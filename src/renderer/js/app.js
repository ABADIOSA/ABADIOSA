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

  async function boot() {
    app.config = await window.cinema.config.get();
    applyConfig();
    CH.ui.startClock(() => app.config);

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

    // The house opens on the lobby loop — that is what the television should
    // show the moment the machine is switched on.
    await go(app.config.attractEnabled ? 'attract' : 'home', {}, { reset: true });
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
