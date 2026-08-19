/* The foyer: what's on, what's next, and the way into everything else. */
(function (CH) {
  'use strict';

  const { el, rail, posterCard } = CH.ui;
  const t = (k, v) => CH.i18n.t(k, v);

  function mount(root) {
    const cfg = CH.app.config;
    const programme = CH.app.programme;
    const now = new Date();

    const header = el('header.row', { style: { marginBottom: '2vh', alignItems: 'flex-end' } }, [
      el('div.grow', {}, [
        el('p.eyebrow', { text: `${t('todayProgramme')} · ${CH.i18n.date(now)}` }),
        el('h1.title-lg.display', {
          text: CH.i18n.lang === 'ar' ? cfg.cinemaNameAr || 'دار العرض' : cfg.cinemaName || 'CINEMA HALL',
        }),
      ]),
      // The lobby clock hides in browse mode, so the header carries the time.
      el('span.marquee-clock__time', { style: { fontSize: '1.4rem', marginInlineEnd: '0.5rem' }, text: CH.i18n.time(now, cfg.clock24h) }),
      CH.nav.bind(el('button.btn.btn--ghost', { text: `⌕  ${t('search')}` }), () => CH.app.go('search')),
      CH.nav.bind(el('button.btn.btn--ghost', { text: `⚙  ${t('settings')}` }), () => CH.app.go('settings')),
    ]);

    const nowCards = (programme.nowShowing || []).map((session) => {
      const times = session.showtimes.map((iso) => new Date(iso));
      const next = times.find((d) => d > now) || times[0];
      return posterCard(session.meta, {
        badge: `${t('screen')} ${session.screen}`,
        sub: next ? `${t('nextShow')} ${CH.i18n.time(next, cfg.clock24h)} · ${session.format}` : session.format,
        onActivate: () => CH.app.go('details', { meta: session.meta, session }),
      });
    });

    const soonCards = (programme.comingSoon || []).map((entry) =>
      posterCard(entry.meta, {
        badge: t('comingSoon'),
        sub: entry.opensOn ? CH.i18n.date(entry.opensOn) : entry.meta.releaseInfo || '',
        onActivate: () => CH.app.go('details', { meta: entry.meta, session: null }),
      })
    );

    const stack = el('div.rail-stack', { style: { overflow: 'hidden' } }, [
      rail(t('nowShowing'), nowCards, { note: `${nowCards.length}` }),
      rail(t('comingSoon'), soonCards, { note: `${soonCards.length}` }),
    ]);

    root.append(header, stack, hintBar());

    if (programme.usingDemo) CH.ui.toast(t('demoNotice'), 7000);

    return { destroy() {} };
  }

  function hintBar() {
    return el('div.hint-bar', {}, [
      el('span', { html: `<kbd>↑↓←→</kbd>${t('hintNavigate')}` }),
      el('span', { html: `<kbd>⏎</kbd>${t('hintSelect')}` }),
      el('span', { html: `<kbd>Esc</kbd>${t('hintBack')}` }),
    ]);
  }

  CH.views = CH.views || {};
  CH.views.home = { id: 'home', mount, chrome: true, hintBar };
})((window.CH = window.CH || {}));
