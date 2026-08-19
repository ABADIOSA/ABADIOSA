/* Small DOM helpers plus the auditorium controls: curtain, house lights,
   the marquee clock, and toasts. */
(function (CH) {
  'use strict';

  /** el('div.card', {text, html, attrs}, children) */
  function el(spec, props = {}, children = []) {
    const [tagPart, ...classes] = String(spec).split('.');
    const node = document.createElement(tagPart || 'div');
    if (classes.length) node.className = classes.join(' ');
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'style') Object.assign(node.style, value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of [].concat(children)) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  const clear = (node) => {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ------------------------------------------------------------ curtain */

  const curtainEl = () => document.getElementById('curtain');

  const curtain = {
    async close() {
      const node = curtainEl();
      if (!node) return;
      node.classList.add('is-moving', 'is-closed');
      await wait(1550);
    },
    async open() {
      const node = curtainEl();
      if (!node) return;
      node.classList.remove('is-closed');
      await wait(1550);
      node.classList.remove('is-moving');
    },
    snapClosed() {
      const node = curtainEl();
      if (node) node.classList.add('is-moving', 'is-closed');
    },
    /** Clear the velvet immediately — used when a view is torn down mid-show. */
    reset() {
      const node = curtainEl();
      if (node) node.classList.remove('is-closed', 'is-moving');
    },
  };

  /** House lights down = the room goes black and the vignette tightens. */
  function lights(state) {
    document.getElementById('stage').dataset.lights = state;
  }

  function mode(name) {
    document.getElementById('stage').dataset.mode = name;
  }

  /* -------------------------------------------------------------- toast */

  let toastTimer = null;
  function toast(message, ms = 3800) {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), ms);
  }

  /* -------------------------------------------------------------- clock */

  function startClock(getConfig) {
    const timeNode = document.getElementById('houseTime');
    const nameNode = document.getElementById('houseName');
    const tick = () => {
      const cfg = getConfig() || {};
      if (timeNode) timeNode.textContent = CH.i18n.time(new Date(), cfg.clock24h);
      if (nameNode) nameNode.textContent = CH.i18n.lang === 'ar' ? cfg.cinemaNameAr || 'دار العرض' : cfg.cinemaName || 'CINEMA HALL';
    };
    tick();
    setInterval(tick, 15000);
  }

  /* ------------------------------------------------------------ cards */

  function posterCard(meta, { badge, sub, onActivate }) {
    const card = el('div.card');
    const art = el('img.card__art', { alt: meta.name, loading: 'lazy' });
    art.src = meta.poster || meta.background || '';
    art.addEventListener('error', () => {
      art.style.display = 'none';
      card.style.background = 'linear-gradient(160deg,#241a12,#0d0b0a)';
    });
    card.appendChild(art);
    if (badge) card.appendChild(el('span.card__badge', { text: badge }));
    card.appendChild(
      el('div.card__meta', {}, [
        // Catalog text is often English inside an Arabic UI — let the browser
        // pick each string's own direction rather than forcing the page's.
        el('div.card__name', { text: meta.name, dir: 'auto' }),
        el('div.card__sub', { text: sub || [meta.releaseInfo, (meta.genres || [])[0]].filter(Boolean).join(' · '), dir: 'auto' }),
      ])
    );
    CH.nav.bind(card, onActivate);
    return card;
  }

  function rail(title, cards, { note } = {}) {
    if (!cards.length) return null;
    const track = el('div.rail__track', {}, cards);
    return el('section.rail', {}, [
      el('div.rail__head', {}, [
        el('h2.title-md.display', { text: title }),
        note ? el('span.muted', { text: note }) : null,
      ]),
      track,
    ]);
  }

  function bulbs(count = 9) {
    return el('div.bulbs', {}, Array.from({ length: count }, () => el('i')));
  }

  CH.ui = { el, clear, wait, curtain, lights, mode, toast, startClock, posterCard, rail, bulbs };
})((window.CH = window.CH || {}));
