/* D-pad navigation. The room has a remote, not a mouse — every arrow press
   picks the nearest thing in that direction by geometry, so views never need
   to declare a focus order by hand. */
(function (CH) {
  'use strict';

  let scope = null;
  let focused = null;

  function candidates() {
    const root = scope || document;
    return Array.from(root.querySelectorAll('[data-focusable]')).filter((el) => {
      if (el.hasAttribute('data-disabled')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    });
  }

  function centreOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  }

  function focus(el, { scroll = true } = {}) {
    if (!el) return;
    if (focused && focused !== el) focused.classList.remove('is-focused');
    focused = el;
    el.classList.add('is-focused');
    if (scroll) scrollIntoView(el);
    el.dispatchEvent(new CustomEvent('nav:focus', { bubbles: true }));
  }

  /** Rails scroll horizontally; panes scroll vertically. Keep the target on screen. */
  function scrollIntoView(el) {
    const track = el.closest('.rail__track');
    if (track) {
      const t = track.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      const pad = t.width * 0.12;
      if (e.left < t.left + pad) track.scrollLeft -= t.left + pad - e.left;
      else if (e.right > t.right - pad) track.scrollLeft += e.right - (t.right - pad);
    }
    const pane = el.closest('.settings__pane, .list, .board__grid, .rail-stack');
    if (pane) {
      const p = pane.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      if (e.top < p.top + 40) pane.scrollTop -= p.top + 40 - e.top;
      else if (e.bottom > p.bottom - 40) pane.scrollTop += e.bottom - (p.bottom - 40);
    }
  }

  /**
   * Nearest neighbour in `dir`. Distance along the travel axis dominates;
   * misalignment on the cross axis is a penalty, so a straight-ahead target
   * always beats a diagonal one.
   */
  function move(dir) {
    const list = candidates();
    if (!list.length) return false;
    if (!focused || !list.includes(focused)) {
      focus(list[0]);
      return true;
    }

    const from = centreOf(focused);
    const horizontal = dir === 'left' || dir === 'right';
    const sign = dir === 'right' || dir === 'down' ? 1 : -1;

    let best = null;
    let bestScore = Infinity;

    for (const el of list) {
      if (el === focused) continue;
      const to = centreOf(el);
      const travel = horizontal ? (to.x - from.x) * sign : (to.y - from.y) * sign;
      const cross = horizontal ? Math.abs(to.y - from.y) : Math.abs(to.x - from.x);
      if (travel <= 4) continue; // not in this direction

      // Overlap on the cross axis means the target is genuinely in line.
      const overlap = horizontal
        ? Math.min(from.rect.bottom, to.rect.bottom) - Math.max(from.rect.top, to.rect.top)
        : Math.min(from.rect.right, to.rect.right) - Math.max(from.rect.left, to.rect.left);
      const alignmentPenalty = overlap > 0 ? cross * 0.25 : cross * 2.4;

      const score = travel + alignmentPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (best) {
      focus(best);
      return true;
    }
    return false;
  }

  function activate() {
    if (!focused) return false;
    focused.dispatchEvent(new CustomEvent('nav:activate', { bubbles: true }));
    if (typeof focused.__onActivate === 'function') focused.__onActivate();
    return true;
  }

  CH.nav = {
    /** Restrict navigation to one view and focus its first (or preferred) target. */
    setScope(root, preferred) {
      scope = root || null;
      if (focused) focused.classList.remove('is-focused');
      focused = null;
      const list = candidates();
      const target = (preferred && list.includes(preferred) && preferred)
        || list.find((el) => el.hasAttribute('data-focus-default'))
        || list[0];
      if (target) focus(target, { scroll: false });
    },
    clear() {
      if (focused) focused.classList.remove('is-focused');
      focused = null;
      scope = null;
    },
    focus,
    move,
    activate,
    get current() {
      return focused;
    },
    /** Attach a click/enter handler and mark an element navigable. */
    bind(el, onActivate, opts = {}) {
      el.setAttribute('data-focusable', '');
      if (opts.default) el.setAttribute('data-focus-default', '');
      el.__onActivate = onActivate;
      el.addEventListener('click', (event) => {
        event.preventDefault();
        focus(el);
        onActivate();
      });
      el.addEventListener('mouseenter', () => focus(el, { scroll: false }));
      return el;
    },
  };
})((window.CH = window.CH || {}));
