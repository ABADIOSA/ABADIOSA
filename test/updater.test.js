'use strict';
/* Self-update. The point of these is the honest cases: builds that cannot
   update themselves must say so rather than failing silently. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Updater } = require('../src/main/updater');

/** Stands in for electron-updater, capturing the handlers it registers. */
function fakeAutoUpdater() {
  const handlers = {};
  return {
    handlers,
    fire: (name, payload) => handlers[name] && handlers[name](payload),
    on: (name, fn) => (handlers[name] = fn),
    checkForUpdates: async () => ({}),
    quitAndInstall: function () {
      this.installed = true;
    },
  };
}

const base = { notify: () => {}, version: '1.1.0' };

test('a development build never tries to update itself', () => {
  const updater = new Updater({ ...base, isPackaged: false });
  assert.equal(updater.enabled, false);
  assert.equal(updater.state.reason, 'development build');
  assert.equal(updater.init().phase, 'unsupported');
});

test('a portable build reports that it cannot update, rather than erroring', () => {
  const updater = new Updater({
    ...base,
    isPackaged: true,
    autoUpdater: fakeAutoUpdater(),
    platform: 'win32',
    env: { PORTABLE_EXECUTABLE_DIR: 'C:\\Users\\x\\Downloads' },
  });
  assert.equal(updater.enabled, false);
  assert.equal(updater.state.reason, 'portable build');
});

test('an installed build walks from check to ready and can install', () => {
  const au = fakeAutoUpdater();
  const phases = [];
  const updater = new Updater({
    ...base,
    isPackaged: true,
    autoUpdater: au,
    platform: 'win32',
    env: {},
    notify: (p) => phases.push(p.phase),
  });
  updater.init();
  assert.equal(updater.enabled, true);
  assert.equal(au.autoInstallOnAppQuit, true, 'updates apply on quit, never mid-film');

  au.fire('checking-for-update');
  au.fire('update-available', { version: '1.2.0' });
  au.fire('download-progress', { percent: 42.6 });
  assert.equal(updater.state.percent, 43);
  assert.equal(updater.install(), false, 'nothing to install until it has downloaded');

  au.fire('update-downloaded', { version: '1.2.0' });
  assert.equal(updater.state.phase, 'ready');
  assert.equal(updater.state.available, '1.2.0');
  assert.equal(updater.install(), true);
  assert.equal(au.installed, true);

  assert.deepEqual(phases, ['checking', 'downloading', 'downloading', 'ready']);
});

test('up to date is reported as such', () => {
  const au = fakeAutoUpdater();
  const updater = new Updater({ ...base, isPackaged: true, autoUpdater: au, platform: 'linux', env: {} });
  updater.init();
  au.fire('update-not-available', {});
  assert.equal(updater.state.phase, 'current');
});

test('an unsigned macOS build is unsupported, not broken', () => {
  const au = fakeAutoUpdater();
  const updater = new Updater({ ...base, isPackaged: true, autoUpdater: au, platform: 'darwin', env: {} });
  updater.init();
  au.fire('error', new Error('Could not get code signature for running application'));
  assert.equal(updater.state.phase, 'unsupported');
  assert.equal(updater.state.supported, false);
});

test('a genuine failure stays an error', () => {
  const au = fakeAutoUpdater();
  const updater = new Updater({ ...base, isPackaged: true, autoUpdater: au, platform: 'win32', env: {} });
  updater.init();
  au.fire('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
  assert.equal(updater.state.phase, 'error');
  assert.equal(updater.state.supported, true, 'a dropped connection is not a permanent condition');
});
