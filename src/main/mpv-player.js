'use strict';
/**
 * The projector, as the auditorium sees it.
 *
 * Picks the engine — mpv when it is on the machine, the WebView's own <video>
 * otherwise — runs the film, and reports back. mpv opens its own fullscreen
 * window on the television, so our own window has to stop being always-on-top
 * for the duration or it would sit in front of the picture.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const mpv = require('../core/mpv');

/** How the user asks for mpv when it is missing, per platform. */
const INSTALL_COMMANDS = {
  win32: { command: 'winget', args: ['install', '--id', 'mpv.net', '-e', '--accept-package-agreements', '--accept-source-agreements'], label: 'winget install mpv' },
  darwin: { command: 'brew', args: ['install', 'mpv'], label: 'brew install mpv' },
  linux: { command: 'sudo', args: ['apt-get', 'install', '-y', 'mpv'], label: 'sudo apt-get install mpv' },
};

class MpvPlayer {
  /**
   * @param {object} deps
   * @param {import('../core/store').Store} deps.store
   * @param {() => Electron.BrowserWindow|null} deps.getWindow
   * @param {() => {index: number, bounds: {x: number, y: number}}} deps.getTargetDisplay
   * @param {(payload: object) => void} deps.notify
   */
  constructor({ store, getWindow, getTargetDisplay, notify, userDataDir }) {
    this.store = store;
    this.getWindow = getWindow;
    this.getTargetDisplay = getTargetDisplay;
    this.notify = notify;
    this.userDataDir = userDataDir;
    this.session = null;
    this._detected = undefined; // undefined = not looked yet, null = not present
  }

  /* ------------------------------------------------------------ detection */

  /** Find mpv once per launch, unless the configured path changes. */
  async detect({ force = false } = {}) {
    const configured = this.store.get('mpvPath') || null;
    if (!force && this._detected !== undefined && this._detectedFor === configured) return this._detected;

    const binary = mpv.locate({
      configured,
      bundledDir: path.join(process.resourcesPath || path.join(__dirname, '..', '..'), 'mpv'),
    });
    this._detected = binary ? await mpv.probe(binary) : null;
    this._detectedFor = configured;
    return this._detected;
  }

  /** Which engine a film would actually use right now, and why. */
  async status() {
    const preference = this.store.get('playerEngine') || 'auto';
    const found = await this.detect();
    const engine = preference === 'builtin' ? 'builtin' : found ? 'mpv' : 'builtin';
    return {
      preference,
      engine,
      mpv: found ? { available: true, binary: found.binary, version: found.version } : { available: false },
      install: INSTALL_COMMANDS[process.platform] ? INSTALL_COMMANDS[process.platform].label : null,
      playing: !!this.session,
    };
  }

  /* --------------------------------------------------------------- launch */

  inputConfPath() {
    const file = path.join(this.userDataDir, 'mpv-input.conf');
    try {
      fs.mkdirSync(this.userDataDir, { recursive: true });
      fs.writeFileSync(file, mpv.INPUT_CONF, 'utf8');
      return file;
    } catch {
      return null; // mpv's own defaults still apply
    }
  }

  /**
   * Play a resolved URL.
   * @returns {Promise<{engine: 'mpv'|'builtin', url?: string, version?: string, reason?: string}>}
   *   'builtin' means the caller should play it in the page instead.
   */
  async play({ url, title = '', subtitles = [], startTime = 0 }) {
    const { engine, mpv: found } = await this.status();
    if (engine !== 'mpv') return { engine: 'builtin', url };

    await this.stop();

    const display = this.getTargetDisplay();
    const win = this.getWindow();

    // mpv's window must be allowed in front of ours.
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);

    let session;
    try {
      session = await mpv.launch(found.binary, {
        url,
        title: title || 'Cinema Hall',
        origin: display && display.bounds,
        screen: display && Number.isInteger(display.index) ? display.index : null,
        fullscreen: true,
        startTime,
        subtitles,
        inputConf: this.inputConfPath(),
      });
    } catch (err) {
      this.restoreWindow();
      return { engine: 'builtin', url, reason: err.message };
    }

    this.session = session;
    this.notify({ type: 'playback', state: 'started', engine: 'mpv', title });

    if (title) session.client.command('show-text', title, 3500).catch(() => {});

    // A tick a second is plenty for a progress bar and costs nothing.
    const ticker = setInterval(() => {
      if (!this.session) return;
      const s = session.state;
      this.notify({
        type: 'playback',
        state: 'progress',
        engine: 'mpv',
        position: typeof s['time-pos'] === 'number' ? s['time-pos'] : null,
        duration: typeof s.duration === 'number' ? s.duration : null,
        paused: !!s.pause,
      });
    }, 1000);

    session.exited.then(({ code, stderr }) => {
      clearInterval(ticker);
      const wasPlaying = this.session === session;
      if (wasPlaying) this.session = null;
      this.restoreWindow();
      this.notify({
        type: 'playback',
        state: 'ended',
        engine: 'mpv',
        code,
        error: code && code !== 0 ? lastMeaningfulLine(stderr) : null,
      });
    });

    return { engine: 'mpv', version: found.version };
  }

  restoreWindow() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    // Only claw back the top spot if we are actually running as a cinema.
    if (this.store.get('cinemaMode') !== 'off') win.setAlwaysOnTop(true, 'screen-saver');
    win.focus();
  }

  /* -------------------------------------------------------------- control */

  async command(...args) {
    if (!this.session) throw new Error('nothing is playing');
    return this.session.client.command(...args);
  }

  async stop() {
    if (!this.session) return false;
    const session = this.session;
    this.session = null;
    try {
      await session.stop();
      await session.exited;
    } catch {
      session.child.kill();
    }
    this.restoreWindow();
    return true;
  }

  /* -------------------------------------------------------------- install */

  /**
   * Hand the job to the platform's own package manager. Always user-initiated
   * from Settings, and the exact command is shown there before it runs.
   */
  install() {
    const recipe = INSTALL_COMMANDS[process.platform];
    if (!recipe) return Promise.resolve({ ok: false, error: 'no package manager known for this platform' });

    return new Promise((resolve) => {
      let output = '';
      let child;
      try {
        child = spawn(recipe.command, recipe.args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      } catch (err) {
        return resolve({ ok: false, command: recipe.label, error: err.message });
      }
      const collect = (chunk) => {
        output += chunk;
        if (output.length > 8192) output = output.slice(-8192);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('error', (err) => resolve({ ok: false, command: recipe.label, error: err.message }));
      child.on('close', async (code) => {
        const found = await this.detect({ force: true });
        resolve({
          ok: !!found,
          command: recipe.label,
          code,
          version: found ? found.version : null,
          output: lastMeaningfulLine(output),
        });
      });
    });
  }
}

function lastMeaningfulLine(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1].slice(0, 300) : null;
}

module.exports = { MpvPlayer, INSTALL_COMMANDS };
