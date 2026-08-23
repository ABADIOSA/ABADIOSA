'use strict';
/**
 * mpv — the real projector.
 *
 * Chromium's <video> can only play what the browser ships a decoder for, which
 * in practice means H.264 in MP4 with AAC. Most of what Stremio's add-ons hand
 * back is MKV carrying HEVC or AV1 with DTS, TrueHD or E-AC3 audio and ASS
 * subtitles — none of which a WebView will touch. mpv plays all of it, with
 * hardware decoding, HDR passthrough and proper subtitle rendering.
 *
 * It runs as its own process. We drive it over mpv's JSON IPC channel — a unix
 * socket, or a named pipe on Windows — which is line-delimited JSON both ways.
 *
 * Pure Node: no Electron here, so the whole thing is testable against a real
 * mpv binary.
 */

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

/* ------------------------------------------------------------------ locate */

/** Where mpv might live, best guess first. */
function candidatePaths({ platform = process.platform, configured = null, bundledDir = null, env = process.env } = {}) {
  const exe = platform === 'win32' ? 'mpv.exe' : 'mpv';
  const list = [];
  if (configured) list.push(configured);
  if (bundledDir) list.push(path.join(bundledDir, exe));

  if (platform === 'win32') {
    list.push('C:\\Program Files\\mpv\\mpv.exe', 'C:\\Program Files (x86)\\mpv\\mpv.exe', 'C:\\mpv\\mpv.exe');
    if (env.LOCALAPPDATA) {
      list.push(path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'mpv.exe'));
      list.push(path.join(env.LOCALAPPDATA, 'Programs', 'mpv', 'mpv.exe'));
    }
    if (env.ProgramData) list.push(path.join(env.ProgramData, 'chocolatey', 'bin', 'mpv.exe'));
  } else if (platform === 'darwin') {
    list.push('/opt/homebrew/bin/mpv', '/usr/local/bin/mpv', '/Applications/mpv.app/Contents/MacOS/mpv');
  } else {
    list.push('/usr/bin/mpv', '/usr/local/bin/mpv', '/snap/bin/mpv', '/var/lib/flatpak/exports/bin/io.mpv.Mpv');
  }
  return list;
}

/** Walk PATH ourselves rather than shelling out to which/where. */
function fromPath({ platform = process.platform, env = process.env } = {}) {
  const exe = platform === 'win32' ? 'mpv.exe' : 'mpv';
  const dirs = String(env.PATH || '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
  for (const dir of dirs) {
    const full = path.join(dir, exe);
    if (isExecutable(full)) return full;
  }
  return null;
}

function isExecutable(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The first mpv we can actually run, or null. */
function locate(opts = {}) {
  for (const candidate of candidatePaths(opts)) {
    if (candidate && isExecutable(candidate)) return candidate;
  }
  return fromPath(opts);
}

/** Confirm a binary really is mpv, and report its version. */
function probe(binary, { timeout = 5000 } = {}) {
  return new Promise((resolve) => {
    if (!binary) return resolve(null);
    let output = '';
    let child;
    try {
      child = spawn(binary, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', (chunk) => (output += chunk));
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const match = output.match(/^mpv\s+(v?[\d.]+\S*)/i);
      resolve(match ? { binary, version: match[1], banner: output.split('\n')[0].trim() } : null);
    });
  });
}

/* -------------------------------------------------------------------- args */

function ipcPathFor(id = `${process.pid}-${Date.now()}`) {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\cinema-hall-mpv-${id}`
    : path.join(os.tmpdir(), `cinema-hall-mpv-${id}.sock`);
}

/**
 * The projector's settings. Tuned for a television: fullscreen on the chosen
 * screen, no window furniture, quality scaling, hardware decoding, and Arabic
 * before English when a stream carries several tracks.
 */
function buildArgs({
  url,
  ipcPath,
  title = '',
  screen = null,
  origin = null, // {x, y} of the target display — more reliable than an index
  fullscreen = true,
  startTime = 0,
  subtitles = [],
  volume = null,
  inputConf = null,
  extra = [],
} = {}) {
  const args = [
    `--input-ipc-server=${ipcPath}`,
    '--force-window=yes',
    '--idle=once',
    '--keep-open=no',
    '--no-border',
    '--osc=no',
    '--osd-level=1',
    '--osd-bar=yes',
    '--hwdec=auto-safe',
    '--profile=gpu-hq',
    '--vo=gpu-next,gpu,libmpv',
    '--cache=yes',
    '--cache-secs=60',
    '--demuxer-max-bytes=256MiB',
    '--demuxer-readahead-secs=30',
    '--sub-auto=fuzzy',
    '--sub-visibility=yes',
    '--alang=ara,ar,eng,en',
    '--slang=ara,ar,eng,en',
    '--user-agent=CinemaHall/1.0',
  ];

  if (fullscreen) args.push('--fullscreen');
  // Screen indices are not guaranteed to match between Electron and mpv, but a
  // coordinate always lands on the right monitor, so send both.
  if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
    args.push(`--geometry=+${Math.round(origin.x)}+${Math.round(origin.y)}`);
  }
  if (Number.isInteger(screen)) args.push(`--fs-screen=${screen}`);
  if (title) args.push(`--title=${title}`, `--force-media-title=${title}`);
  if (startTime > 0) args.push(`--start=${Math.floor(startTime)}`);
  if (volume !== null) args.push(`--volume=${Math.max(0, Math.min(130, volume))}`);
  if (inputConf) args.push(`--input-conf=${inputConf}`);
  for (const sub of subtitles) if (sub && sub.url) args.push(`--sub-file=${sub.url}`);
  args.push(...extra);

  // The file always goes last so nothing can be read as an option to it.
  args.push('--', url);
  return args;
}

/** Extra key bindings layered on top of mpv's own, which we keep. */
const INPUT_CONF = [
  '# Cinema Hall — leaving the film returns to the auditorium.',
  'ESC quit',
  'BS quit',
  'q quit',
  'ENTER cycle pause',
  'RIGHT seek 10',
  'LEFT seek -10',
  'UP add volume 5',
  'DOWN add volume -5',
  'PGDWN seek -300',
  'PGUP seek 300',
  '',
].join('\n');

/* --------------------------------------------------------------- ipc client */

/**
 * Talks to a running mpv over its JSON IPC channel.
 * Emits: 'event' (raw mpv events), 'property' ({name, value}), 'close'.
 */
class MpvClient extends EventEmitter {
  constructor(ipcPath) {
    super();
    this.ipcPath = ipcPath;
    this.socket = null;
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();
    this.observed = new Map();
  }

  /** mpv creates the socket a moment after launch, so retry briefly. */
  connect({ retries = 60, delay = 100 } = {}) {
    return new Promise((resolve, reject) => {
      const attempt = (left) => {
        const socket = net.connect(this.ipcPath);
        socket.once('connect', () => {
          this.socket = socket;
          socket.setEncoding('utf8');
          socket.on('data', (chunk) => this._onData(chunk));
          socket.on('close', () => {
            this.socket = null;
            for (const { reject: fail } of this.pending.values()) fail(new Error('mpv connection closed'));
            this.pending.clear();
            this.emit('close');
          });
          socket.on('error', () => {});
          resolve(this);
        });
        socket.once('error', (err) => {
          socket.destroy();
          if (left <= 0) return reject(err);
          setTimeout(() => attempt(left - 1), delay);
        });
      };
      attempt(retries);
    });
  }

  _onData(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      this._dispatch(message);
    }
  }

  _dispatch(message) {
    if (message.request_id !== undefined && this.pending.has(message.request_id)) {
      const { resolve, reject } = this.pending.get(message.request_id);
      this.pending.delete(message.request_id);
      if (message.error && message.error !== 'success') reject(new Error(message.error));
      else resolve(message.data);
      return;
    }
    if (message.event === 'property-change') {
      this.emit('property', { name: message.name, value: message.data, id: message.id });
    }
    if (message.event) this.emit('event', message);
  }

  command(...args) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('not connected to mpv'));
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.write(`${JSON.stringify({ command: args, request_id: id })}\n`, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  getProperty(name) {
    return this.command('get_property', name);
  }
  setProperty(name, value) {
    return this.command('set_property', name, value);
  }
  observeProperty(name) {
    const id = this.observed.size + 1;
    this.observed.set(id, name);
    return this.command('observe_property', id, name);
  }

  close() {
    if (this.socket) this.socket.end();
  }
}

/* ------------------------------------------------------------------ session */

/**
 * One film: spawns mpv, connects, watches the properties the auditorium cares
 * about, and resolves when playback is over.
 */
async function launch(binary, options = {}) {
  const ipcPath = options.ipcPath || ipcPathFor();
  // A stale socket file would make mpv refuse to start.
  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(ipcPath);
    } catch {
      /* nothing to clean up */
    }
  }

  const args = buildArgs({ ...options, ipcPath });
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });

  // A binary that is missing or not executable emits 'error'. Without a
  // listener that is an uncaught exception, which would take the whole app
  // down over a mistyped path in Settings.
  const spawnFailure = new Promise((_, reject) => {
    child.once('error', (err) => reject(new Error(`could not start mpv: ${err.message}`)));
  });
  spawnFailure.catch(() => {}); // it is raced below; never let it go unhandled

  let stderr = '';
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });
  }

  const client = new MpvClient(ipcPath);
  try {
    // Whichever happens first: mpv answers, or it never started at all.
    await Promise.race([client.connect(), spawnFailure]);
  } catch (err) {
    child.kill();
    throw new Error(`mpv did not open its control channel: ${err.message}`);
  }

  // observe_property fires immediately with the current value, so the cache has
  // to be listening first — otherwise the opening values are lost to whoever
  // subscribes a moment later.
  const state = {};
  client.on('property', ({ name, value }) => {
    state[name] = value;
  });

  const WATCHED = ['time-pos', 'duration', 'pause', 'media-title', 'volume', 'mute', 'demuxer-cache-state'];
  for (const property of WATCHED) {
    await client.observeProperty(property).catch(() => {});
  }

  const exited = new Promise((resolve) => {
    child.once('close', (code) => {
      if (process.platform !== 'win32') {
        try {
          fs.unlinkSync(ipcPath);
        } catch {
          /* already gone */
        }
      }
      resolve({ code, stderr });
    });
  });

  return {
    child,
    client,
    state,
    ipcPath,
    args,
    exited,
    stop: () => client.command('quit').catch(() => child.kill()),
  };
}

module.exports = {
  candidatePaths,
  fromPath,
  isExecutable,
  locate,
  probe,
  ipcPathFor,
  buildArgs,
  INPUT_CONF,
  MpvClient,
  launch,
};
