'use strict';
/**
 * Cinema Hall — the projection booth.
 *
 * Two jobs. First, make the machine disappear: no frame, no menu, no taskbar
 * entry, no cursor, and the display kept awake. Second, and the point of the
 * whole thing: notice when a television is connected — over HDMI or a wireless
 * display, both of which arrive as an extra screen — and move the show onto it
 * in cinema mode by itself, then hand the laptop back when it is unplugged.
 */

const { app, BrowserWindow, ipcMain, screen, shell, Menu, powerSaveBlocker, session } = require('electron');
const path = require('path');

const { Store } = require('../core/store');
const { Programme } = require('./programme');
const staticServer = require('./static-server');
const serverBridge = require('../core/server');
const stremioApi = require('../core/stremio-api');
const { manifestUrlOf } = require('../core/addons');

const argv = process.argv.slice(1);
const DEV = argv.includes('--dev');
const FORCE_WINDOWED = argv.includes('--windowed');

let win = null;
let store = null;
let programme = null;
let site = null;
let powerBlockerId = null;

/** What the auditorium is doing right now, so we only react to real changes. */
let showState = { cinema: null, tv: null };

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

function primaryId() {
  return screen.getPrimaryDisplay().id;
}

/** Every screen that is not the machine's own — a TV, a projector, a monitor. */
function externalDisplays() {
  const primary = primaryId();
  return screen.getAllDisplays().filter((d) => d.id !== primary);
}

/**
 * Is a television connected? HDMI and wireless display (Miracast, and macOS
 * AirPlay screen extension) both present to the OS as an extra screen, so one
 * check covers "سلكي أو لاسلكي".
 */
function tvConnected() {
  const index = store.get('displayIndex');
  if (Number.isInteger(index)) {
    const display = screen.getAllDisplays()[index];
    return !!display && display.id !== primaryId();
  }
  return externalDisplays().length > 0;
}

/** Which screen the show belongs on. */
function targetDisplay() {
  const displays = screen.getAllDisplays();
  const index = store.get('displayIndex');
  if (Number.isInteger(index) && displays[index]) return displays[index];
  return externalDisplays()[0] || screen.getPrimaryDisplay();
}

/** Cinema mode on or off, given the setting and what is plugged in. */
function cinemaActive() {
  if (FORCE_WINDOWED) return false;
  const mode = store.get('cinemaMode');
  if (mode === 'always') return true;
  if (mode === 'off') return false;
  return tvConnected(); // 'auto'
}

function describeDisplay(display) {
  return display
    ? {
        id: display.id,
        label: display.label || '',
        width: display.bounds.width,
        height: display.bounds.height,
        external: display.id !== primaryId(),
      }
    : null;
}

/* ------------------------------------------------------------- presentation */

function applyPresentationMode() {
  if (!win) return;
  const cinema = cinemaActive();
  const display = cinema ? targetDisplay() : screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  if (cinema) {
    // Reposition before pinning: kiosk locks the window to whichever screen it
    // is on, so moving it afterwards does nothing.
    win.setKiosk(false);
    win.setBounds({ x, y, width, height });
    win.setKiosk(true);
    if (!win.isFullScreen()) win.setFullScreen(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setSkipTaskbar(true);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setKiosk(false);
    win.setFullScreen(false);
    win.setAlwaysOnTop(false);
    win.setSkipTaskbar(false);
    win.setVisibleOnAllWorkspaces(false);
    win.setBounds({
      x: x + Math.round(width * 0.06),
      y: y + Math.round(height * 0.06),
      width: Math.round(width * 0.88),
      height: Math.round(height * 0.88),
    });
  }
  return { cinema, display };
}

/**
 * Re-read the world and, when it has actually changed, move the show and tell
 * the auditorium so it can open the curtain (or step back to browsing).
 */
function syncPresentation({ force = false } = {}) {
  if (!win) return;
  const cinema = cinemaActive();
  const tv = tvConnected();
  const changed = cinema !== showState.cinema || tv !== showState.tv;

  applyPresentationMode();

  if (changed || force) {
    showState = { cinema, tv };
    win.webContents.send('ui:command', {
      type: 'cinema-mode',
      cinema,
      tv,
      announce: !!store.get('announceTv'),
      display: describeDisplay(cinema ? targetDisplay() : screen.getPrimaryDisplay()),
    });
  }
}

/** Screens arrive in bursts while a TV negotiates; settle before reacting. */
function watchDisplays() {
  let timer = null;
  const settle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => syncPresentation(), 800);
  };
  screen.on('display-added', settle);
  screen.on('display-removed', settle);
  screen.on('display-metrics-changed', settle);
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

/* ----------------------------------------------------------------- requests */

/**
 * YouTube's embedded player refuses any request without a usable referrer and
 * answers "Error 153 — video player configuration error". Serving the renderer
 * over loopback already gives it a real one; naming youtube.com on the embed
 * document itself covers players restricted to particular referrers too.
 */
function fixYouTubeReferrer(ses) {
  const filter = { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] };
  ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (details.resourceType !== 'subFrame') {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }
    callback({
      requestHeaders: { ...details.requestHeaders, Referer: 'https://www.youtube.com/' },
    });
  });
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
  win.loadURL(`${site.url}/index.html`);

  win.once('ready-to-show', () => {
    syncPresentation({ force: true });
    win.show();
    win.focus();
    if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep the top-level frame on our own page. Trailer iframes are unaffected.
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(site.url)) event.preventDefault();
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && input.shift && input.key.toLowerCase() === 'q') {
      event.preventDefault();
      app.quit();
    } else if (input.key === 'F10') {
      event.preventDefault();
      // Cycle auto → always → off, so one key covers every situation.
      const order = ['auto', 'always', 'off'];
      const next = order[(order.indexOf(store.get('cinemaMode')) + 1) % order.length];
      store.set({ cinemaMode: next });
      syncPresentation({ force: true });
    } else if (input.key === 'F12' && DEV) {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

/* ---------------------------------------------------------------------- ipc */

function registerIpc() {
  ipcMain.handle('config:get', () => store.get());
  ipcMain.handle('config:set', (_e, patch) => {
    const next = store.set(patch);
    if (patch && ('cinemaMode' in patch || 'displayIndex' in patch)) syncPresentation({ force: true });
    if (patch && 'launchAtLogin' in patch && app.setLoginItemSettings) {
      app.setLoginItemSettings({ openAtLogin: !!patch.launchAtLogin, args: [] });
    }
    return next;
  });
  ipcMain.handle('config:reset', () => {
    const next = store.reset();
    syncPresentation({ force: true });
    return next;
  });

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
    const addon = await programme.client.loadAddon(url); // validate before persisting
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
  ipcMain.handle('app:cinemaMode', (_e, mode) => {
    if (mode) store.set({ cinemaMode: mode });
    syncPresentation({ force: true });
    return { mode: store.get('cinemaMode'), cinema: cinemaActive(), tv: tvConnected() };
  });
  ipcMain.handle('app:displays', () => {
    const primary = primaryId();
    return screen.getAllDisplays().map((d, index) => ({
      index,
      id: d.id,
      label: d.label || `Display ${index + 1}`,
      primary: d.id === primary,
      width: d.bounds.width,
      height: d.bounds.height,
      scaleFactor: d.scaleFactor,
    }));
  });
  ipcMain.handle('app:useDisplay', (_e, index) => {
    store.set({ displayIndex: index === null ? null : Number(index) });
    syncPresentation({ force: true });
    return store.get('displayIndex');
  });
  ipcMain.handle('app:tvStatus', () => ({
    tv: tvConnected(),
    cinema: cinemaActive(),
    mode: store.get('cinemaMode'),
    display: describeDisplay(targetDisplay()),
    externals: externalDisplays().map(describeDisplay),
  }));
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

app.whenReady().then(async () => {
  store = new Store(path.join(app.getPath('userData'), 'cinema-hall.json'));
  programme = new Programme(store);

  // Add-ons are third-party servers; deny every permission they might ask for.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'fullscreen');
  });
  fixYouTubeReferrer(session.defaultSession);

  site = await staticServer.serve(path.join(__dirname, '..', 'renderer'));

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

app.on('before-quit', () => {
  keepAwake(false);
  if (site) site.close();
});
