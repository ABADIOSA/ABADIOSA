'use strict';
/**
 * Cinema Hall — the projection booth.
 *
 * Everything here exists to make the machine disappear: the window has no
 * frame, no menu, no taskbar entry; it lands on the television rather than the
 * laptop panel; the display is kept awake; and the cursor is gone until a mouse
 * actually moves. What the room sees is an auditorium, not a computer.
 */

const { app, BrowserWindow, ipcMain, screen, shell, Menu, powerSaveBlocker, session } = require('electron');
const path = require('path');

const { Store } = require('../core/store');
const { Programme } = require('./programme');
const serverBridge = require('../core/server');
const stremioApi = require('../core/stremio-api');
const { manifestUrlOf } = require('../core/addons');

const argv = process.argv.slice(1);
const DEV = argv.includes('--dev');
const FORCE_WINDOWED = argv.includes('--windowed');

let win = null;
let store = null;
let programme = null;
let powerBlockerId = null;

// A single instance only: a second launch just wakes the auditorium up.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

/* ------------------------------------------------------------------ display */

/** Which screen is the television? Default to the external one when present. */
function targetDisplay() {
  const displays = screen.getAllDisplays();
  const index = store.get('displayIndex');
  if (Number.isInteger(index) && displays[index]) return displays[index];
  const primary = screen.getPrimaryDisplay();
  return displays.find((d) => d.id !== primary.id) || primary;
}

function applyPresentationMode() {
  if (!win) return;
  const kiosk = store.get('kiosk') && !FORCE_WINDOWED;
  const display = targetDisplay();
  const { x, y, width, height } = display.bounds;

  if (kiosk) {
    win.setKiosk(false); // reposition first — kiosk pins the window to its screen
    win.setBounds({ x, y, width, height });
    win.setKiosk(true);
    // Some Linux window managers ignore kiosk; fullscreen is the fallback that
    // still hides every trace of a desktop.
    if (!win.isFullScreen()) win.setFullScreen(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setSkipTaskbar(true);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setKiosk(false);
    win.setFullScreen(false);
    win.setAlwaysOnTop(false);
    win.setSkipTaskbar(false);
    win.setBounds({
      x: x + Math.round(width * 0.05),
      y: y + Math.round(height * 0.05),
      width: Math.round(width * 0.9),
      height: Math.round(height * 0.9),
    });
  }
}

/* -------------------------------------------------------------------- power */

function keepAwake(on) {
  if (on && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!on && powerBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerBlockerId)) powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
  return powerBlockerId !== null;
}

/* ------------------------------------------------------------------- window */

function createWindow() {
  const display = targetDisplay();

  win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    show: false,
    frame: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    fullscreenable: true,
    title: 'Cinema Hall',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    applyPresentationMode();
    win.show();
    win.focus();
    if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  });

  // Nothing opens a second window; external links go to the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep the top-level frame on our own page. Trailer iframes are unaffected.
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrlShift = input.control && input.shift;
    if (ctrlShift && input.key.toLowerCase() === 'q') {
      event.preventDefault();
      app.quit();
    } else if (input.key === 'F10') {
      event.preventDefault();
      store.set({ kiosk: !store.get('kiosk') });
      applyPresentationMode();
    } else if (input.key === 'F12' && DEV) {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

/** Plugging the TV in mid-session should move the show onto it. */
function watchDisplays() {
  const reflow = () => {
    if (win) setTimeout(applyPresentationMode, 400);
  };
  screen.on('display-added', reflow);
  screen.on('display-removed', reflow);
  screen.on('display-metrics-changed', reflow);
}

/* ---------------------------------------------------------------------- ipc */

function registerIpc() {
  ipcMain.handle('config:get', () => store.get());
  ipcMain.handle('config:set', (_e, patch) => {
    const next = store.set(patch);
    if (patch && ('kiosk' in patch || 'displayIndex' in patch)) applyPresentationMode();
    if (patch && 'launchAtLogin' in patch && app.setLoginItemSettings) {
      app.setLoginItemSettings({ openAtLogin: !!patch.launchAtLogin, args: [] });
    }
    return next;
  });
  ipcMain.handle('config:reset', () => store.reset());

  ipcMain.handle('programme:load', (_e, opts) => programme.load(opts || {}));

  ipcMain.handle('addons:refresh', async () => {
    programme.cache = null;
    return programme.refreshAddons();
  });
  ipcMain.handle('addons:list', () =>
    programme.client.addons.map((a) => ({
      transportUrl: a.transportUrl,
      id: a.manifest.id,
      name: a.manifest.name,
      description: a.manifest.description || '',
      types: a.manifest.types || [],
      resources: (a.manifest.resources || []).map((r) => (typeof r === 'string' ? r : r.name)),
    }))
  );
  ipcMain.handle('addons:add', async (_e, transportUrl) => {
    const url = manifestUrlOf(transportUrl);
    if (!url) throw new Error('empty add-on url');
    const addon = await programme.client.loadAddon(url); // validates before we persist
    const list = store.get('addons') || [];
    if (!list.includes(url)) store.set({ addons: [...list, url] });
    programme.cache = null;
    await programme.refreshAddons();
    return { id: addon.manifest.id, name: addon.manifest.name };
  });
  ipcMain.handle('addons:remove', async (_e, transportUrl) => {
    const url = manifestUrlOf(transportUrl);
    store.set({ addons: (store.get('addons') || []).filter((a) => a !== url) });
    programme.cache = null;
    await programme.refreshAddons();
    return store.get('addons');
  });

  ipcMain.handle('catalog:meta', (_e, { type, id }) => programme.client.getMeta(type, id));
  ipcMain.handle('catalog:streams', (_e, { type, id }) => programme.client.getStreams(type, id));
  ipcMain.handle('catalog:search', (_e, { type, query }) => programme.client.search(type, query));

  ipcMain.handle('playback:resolve', (_e, stream) =>
    serverBridge.resolveStream(stream, { serverUrl: store.get('streamingServerUrl') })
  );
  ipcMain.handle('playback:serverStatus', async () => {
    const url = store.get('streamingServerUrl');
    const settings = await serverBridge.probe(url);
    return { url, online: !!settings, settings };
  });

  ipcMain.handle('account:login', async (_e, { email, password }) => {
    const { authKey, user } = await stremioApi.login(email, password);
    store.set({ authKey, account: user ? { email: user.email, id: user._id } : { email } });
    programme.cache = null;
    const result = await programme.refreshAddons();
    return { account: store.get('account'), addons: result.count };
  });
  ipcMain.handle('account:logout', async () => {
    const key = store.get('authKey');
    store.set({ authKey: null, account: null });
    programme.cache = null;
    if (key) await stremioApi.logout(key);
    await programme.refreshAddons();
    return true;
  });

  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:toggleKiosk', () => {
    store.set({ kiosk: !store.get('kiosk') });
    applyPresentationMode();
    return store.get('kiosk');
  });
  ipcMain.handle('app:displays', () => {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((d, index) => ({
      index,
      id: d.id,
      label: d.label || `Display ${index + 1}`,
      primary: d.id === primary.id,
      width: d.bounds.width,
      height: d.bounds.height,
      scaleFactor: d.scaleFactor,
    }));
  });
  ipcMain.handle('app:useDisplay', (_e, index) => {
    store.set({ displayIndex: index === null ? null : Number(index) });
    applyPresentationMode();
    return store.get('displayIndex');
  });
  ipcMain.handle('app:keepAwake', (_e, on) => keepAwake(!!on));
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  ipcMain.handle('app:version', () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
  }));
}

/* -------------------------------------------------------------------- start */

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'cinema-hall.json'));
  programme = new Programme(store);

  // Add-ons are third-party servers; deny every permission they might ask for.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'fullscreen');
  });

  registerIpc();
  keepAwake(true);
  createWindow();
  watchDisplays();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  keepAwake(false);
  app.quit();
});

app.on('before-quit', () => keepAwake(false));
