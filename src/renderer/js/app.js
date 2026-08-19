/* The projectionist: boots the house, routes between views, and hands every
   key press to whatever is currently on screen. */
(function (CH) {
  'use strict';

  const { el, wait, toast } = CH.ui;

  const NO_IDLE = new Set(['player', 'preshow', 'attract']);

  const app = {
    config: null,
    programme: { nowShowing: [], comingSoon: [], reel: [] },
    versions: null,
    captureKeys: false,
    /** Is the auditorium on a television right now? Set by the main process. */
    cinema: false,
    tv: false,

    current: null,      // { id, params, node, instance }
    stack: [],
    booted: false,
  };

  /* ------------------------------------------------------------- routing */

  async function go(id, params = {}, options = {}) {
    const view = CH.views[id];
    if (!view) {
      console.warn('unknown view', id);
      return;
    }

    const previous = app.current;
    if (previous) {
      if (options.reset) app.stack = [];
      else if (!options.replace) app.stack.push({ id: previous.id, params: previous.params });
    }

    const node = el('section.view', { dataset: { view: id } });
    document.getElementById('views').appendChild(node);

    let instance;
    try {
      instance = view.mount(node, params) || {};
    } catch (err) {
      console.error(`view ${id} failed to mount`, err);
      node.remove();
      return;
    }

    app.current = { id, params, node, instance };
    CH.ui.mode(id === 'attract' ? 'attract' : id === 'player' || id === 'preshow' ? id : 'browse');

    // Let layout settle before measuring for focus, then dissolve in.
    requestAnimationFrame(() => {
      node.classList.add('is-active');
      if (view.chrome !== false) CH.nav.setScope(node);
      else CH.nav.clear();
    });

    if (previous) {
      previous.node.classList.remove('is-active');
      await wait(450);
      try {
        if (previous.instance.destroy) previous.instance.destroy();
      } catch (err) {
        console.warn('view teardown failed', err);
      }
      previous.node.remove();
    }
    resetIdle();
  }

  function back() {
    const entry = app.stack.pop();
    if (entry) return go(entry.id, entry.params, { replace: true });
    return go(app.config && app.config.attractEnabled ? 'attract' : 'home', {}, { replace: true, reset: true });
  }

  /* ------------------------------------------------------------- config */

  function applyConfig() {
    const c = app.config;
    CH.i18n.set(c.language);
    document.documentElement.style.setProperty('--safe', `${c.overscanPercent}%`);
    document.body.classList.toggle('cursor-hidden', !!c.hideCursor);
    window.cinema.app.keepAwake(true);
  }

  async function loadProgramme(opts = {}) {
    try {
      const programme = await window.cinema.programme.load(opts);
      app.programme = programme;
      return programme;
    } catch (err) {
      console.error('programme load failed', err);
      toast(err.message || 'programme load failed', 6000);
      return app.programme;
    }
  }

  /* --------------------------------------------------------------- idle */

  let idleTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    const c = app.config;
    if (!c || !c.attractEnabled) return;
    // The lobby loop belongs on the television, not on a laptop window.
    if (!app.cinema) return;
    if (app.current && NO_IDLE.has(app.current.id)) return;
    idleTimer = setTimeout(() => {
      if (app.current && NO_IDLE.has(app.current.id)) return;
      go('attract', {}, { reset: true });
    }, Math.max(15, c.idleSecondsToAttract || 180) * 1000);
  }

  /* ------------------------------------------------------------ pointer */

  let cursorTimer = null;
  function wakeCursor() {
    if (!app.config || !app.config.hideCursor) return;
    document.body.classList.remove('cursor-hidden');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), 2600);
  }

  /* --------------------------------------------------------------- keys */

  function onKeyDown(event) {
    if (app.captureKeys) return; // a text prompt owns the keyboard
    resetIdle();

    const instance = app.current && app.current.instance;
    if (instance && typeof instance.onKey === 'function') {
      try {
        if (instance.onKey(event) === true) {
          event.preventDefault();
          return;
        }
      } catch (err) {
        console.warn('view key handler failed', err);
      }
    }

    // Any key wakes the house out of the lobby loop.
    if (app.current && app.current.id === 'attract') {
      event.preventDefault();
      go('home', {}, { reset: true });
      return;
    }

    switch (event.key) {
      case 'ArrowUp':
        CH.nav.move('up');
        break;
      case 'ArrowDown':
        CH.nav.move('down');
        break;
      case 'ArrowLeft':
        CH.nav.move(CH.i18n.dir === 'rtl' ? 'right' : 'left');
        break;
      case 'ArrowRight':
        CH.nav.move(CH.i18n.dir === 'rtl' ? 'left' : 'right');
        break;
      case 'Enter':
      case ' ':
        CH.nav.activate();
        break;
      case 'Escape':
      case 'Backspace':
        back();
        break;
      case 's':
      case 'S':
        go('settings');
        break;
      case '/':
        go('search');
        break;
      case 'a':
      case 'A':
        go('attract', {}, { reset: true });
        break;
      default:
        return; // leave unhandled keys to the browser
    }
    event.preventDefault();
  }

  /* --------------------------------------------------------------- boot */

  /**
   * The projection booth tells us when a television appears or goes away, so
   * plugging one in starts the show and unplugging it hands the desk back.
   */
  function onCinemaCommand(payload) {
    if (!payload || payload.type !== 'cinema-mode') return;
    const entering = payload.cinema && !app.cinema;
    const leaving = !payload.cinema && app.cinema;
    app.cinema = !!payload.cinema;
    app.tv = !!payload.tv;

    if (payload.announce && payload.tv && entering) toast(CH.i18n.t('tvDetected'), 5000);
    if (payload.announce && leaving) toast(CH.i18n.t('tvDisconnected'), 5000);

    // Never yank a film off the screen because a cable moved.
    if (app.current && (app.current.id === 'player' || app.current.id === 'preshow')) return;
    if (!app.booted) return;

    if (entering) go(app.config.attractEnabled ? 'attract' : 'home', {}, { reset: true });
    else if (leaving && app.current && app.current.id === 'attract') go('home', {}, { reset: true });
    resetIdle();
  }

  async function boot() {
    app.config = await window.cinema.config.get();
    applyConfig();
    CH.ui.startClock(() => app.config);

    window.cinema.on('ui:command', onCinemaCommand);

    // Ask once at startup rather than waiting for a change that may never come.
    try {
      const status = await window.cinema.app.tvStatus();
      app.cinema = !!status.cinema;
      app.tv = !!status.tv;
    } catch {
      app.cinema = false;
    }

    const bootNode = document.getElementById('boot');
    if (bootNode) bootNode.querySelector('.boot__text').textContent = CH.i18n.t('booting');

    window.cinema.app.version().then((v) => {
      app.versions = v;
    });

    await loadProgramme();

    if (bootNode) {
      bootNode.classList.add('is-done');
      setTimeout(() => bootNode.remove(), 700);
    }

    // On a television the house opens on the lobby loop. In a window on the
    // machine itself it opens on the foyer, where you can actually work.
    const openOn = app.cinema && app.config.attractEnabled ? 'attract' : 'home';
    await go(openOn, {}, { reset: true });
    app.booted = true;
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('mousemove', () => {
    wakeCursor();
    resetIdle();
  });
  document.addEventListener('click', resetIdle);
  document.addEventListener('wheel', resetIdle, { passive: true });

  Object.assign(app, { go, back, applyConfig, loadProgramme, resetIdle });
  CH.app = app;

  window.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})((window.CH = window.CH || {}));
