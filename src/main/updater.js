'use strict';
/**
 * Self-update.
 *
 * Checks GitHub Releases on launch and every few hours, downloads a newer build
 * in the background, and applies it the next time the app is closed — so a
 * cinema that is left running all evening is never interrupted by an update.
 *
 * Not every package can do this, and saying so plainly beats failing quietly:
 * the Windows portable .exe has nowhere to install to, and an unsigned macOS
 * build is refused by the OS updater. Both report back as "unsupported" and the
 * user is pointed at the download page instead.
 */

const RECHECK_MS = 6 * 60 * 60 * 1000;

class Updater {
  /**
   * @param {object} deps
   * @param {(payload: object) => void} deps.notify  send state to the renderer
   * @param {boolean} deps.isPackaged
   * @param {string} deps.version
   * @param {object} [deps.autoUpdater]  injectable for tests
   */
  constructor({ notify, isPackaged, version, autoUpdater = null, platform = process.platform, env = process.env }) {
    this.notify = notify;
    this.isPackaged = isPackaged;
    this.version = version;
    this.platform = platform;
    this.env = env;
    this.timer = null;
    this.state = { phase: 'idle', version, supported: true, reason: null };

    this.autoUpdater = autoUpdater;
    if (!this.autoUpdater && isPackaged) {
      try {
        this.autoUpdater = require('electron-updater').autoUpdater;
      } catch (err) {
        this.state = { ...this.state, supported: false, reason: `electron-updater unavailable: ${err.message}` };
      }
    }

    const unsupported = this.unsupportedReason();
    if (unsupported) this.state = { ...this.state, supported: false, reason: unsupported };
  }

  /** Why this particular package cannot update itself, if it cannot. */
  unsupportedReason() {
    if (!this.isPackaged) return 'development build';
    // electron-builder sets this only for the portable target.
    if (this.platform === 'win32' && this.env.PORTABLE_EXECUTABLE_DIR) return 'portable build';
    return null;
  }

  get enabled() {
    return !!this.autoUpdater && this.state.supported;
  }

  init() {
    if (!this.enabled) {
      this.emit({ phase: 'unsupported' });
      return this.state;
    }

    const au = this.autoUpdater;
    au.autoDownload = true;
    au.autoInstallOnAppQuit = true;
    au.allowPrerelease = false;
    if (au.logger === undefined) au.logger = null;

    au.on('checking-for-update', () => this.emit({ phase: 'checking' }));
    au.on('update-not-available', () => this.emit({ phase: 'current' }));
    au.on('update-available', (info) => this.emit({ phase: 'downloading', available: info && info.version }));
    au.on('download-progress', (p) => this.emit({ phase: 'downloading', percent: Math.round((p && p.percent) || 0) }));
    au.on('update-downloaded', (info) => this.emit({ phase: 'ready', available: info && info.version }));
    au.on('error', (err) => {
      const message = String((err && err.message) || err);
      // An unsigned macOS build cannot be updated by the OS; that is not a bug.
      const signing = /code signature|not signed|Could not get code signature/i.test(message);
      this.emit({ phase: signing ? 'unsupported' : 'error', supported: !signing, reason: message });
    });

    this.check();
    this.timer = setInterval(() => this.check(), RECHECK_MS);
    if (this.timer.unref) this.timer.unref();
    return this.state;
  }

  emit(patch) {
    this.state = { ...this.state, ...patch };
    if (typeof this.notify === 'function') this.notify({ type: 'update', ...this.state });
    return this.state;
  }

  async check() {
    if (!this.enabled) return this.state;
    try {
      await this.autoUpdater.checkForUpdates();
    } catch (err) {
      this.emit({ phase: 'error', reason: String((err && err.message) || err) });
    }
    return this.state;
  }

  /** Apply a downloaded update now: quit, install, come back up. */
  install() {
    if (!this.enabled || this.state.phase !== 'ready') return false;
    this.autoUpdater.quitAndInstall(false, true);
    return true;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { Updater, RECHECK_MS };
