/* One title, presented the way a cinema presents it: big art, the facts that
   matter on a poster, and the showtimes for its auditorium. */
(function (CH) {
  'use strict';

  const { el } = CH.ui;
  const t = (k, v) => CH.i18n.t(k, v);

  function mount(root, params) {
    const cfg = CH.app.config;
    const session = params.session;
    let meta = params.meta;

    root.classList.add('view--plain');
    const bg = el('div.detail__bg', { style: { backgroundImage: `url("${meta.background || meta.poster}")` } });
    const body = el('div.detail__body');
    root.appendChild(el('div.detail', {}, [bg, el('div.detail__scrim'), body]));

    function render() {
      const now = new Date();
      const times = session ? session.showtimes.map((iso) => new Date(iso)) : [];
      const nextIdx = times.findIndex((d) => d > now);

      const facts = [
        session ? el('span.chip.chip--solid', { text: `${t('screen')} ${session.screen}` }) : null,
        session ? el('span.chip', { text: session.format }) : null,
        meta.certification || (session && session.certification)
          ? el('span.chip.chip--rating', { text: meta.certification || session.certification })
          : null,
        meta.releaseInfo ? el('span.chip', { text: meta.releaseInfo }) : null,
        meta.runtime ? el('span.chip', { text: meta.runtime }) : null,
        meta.imdbRating ? el('span.chip', { text: `★ ${meta.imdbRating}` }) : null,
        ...(meta.genres || []).slice(0, 3).map((genre) => el('span.chip', { text: genre })),
      ].filter(Boolean);

      const actions = [
        CH.nav.bind(
          el('button.btn.btn--primary', { text: `▶  ${t('play')}` }),
          () => CH.app.go('streams', { meta, session }),
          { default: true }
        ),
        meta.trailers && meta.trailers.length
          ? CH.nav.bind(el('button.btn', { text: `🎬  ${t('watchTrailer')}` }), () =>
              CH.app.go('player', {
                meta,
                stream: { ytId: meta.trailers[0].ytId, title: `${meta.name} — ${t('watchTrailer')}` },
              })
            )
          : null,
        CH.nav.bind(el('button.btn.btn--ghost', { text: `←  ${t('back')}` }), () => CH.app.back()),
      ].filter(Boolean);

      const showtimes = session
        ? el('div.detail__showtimes', {}, [
            el('span.eyebrow', { text: t('showtimes') }),
            ...times.map((d, i) =>
              el('span.board__time', {
                text: CH.i18n.time(d, cfg.clock24h),
                class: `board__time ${i === nextIdx ? 'is-next' : d < now ? 'is-past' : ''}`,
              })
            ),
            session.hall
              ? el('span.muted', { text: `· ${t('hall')} ${session.screen} · ${session.hall.seats} ${t('seats')} · ${session.hall.sound}` })
              : null,
          ])
        : meta.released
        ? el('p.title-md.display', { style: { color: 'var(--gold-hot)' }, text: t('opensOn', { date: CH.i18n.date(meta.released) }) })
        : null;

      CH.ui.clear(body).append(
        ...[
          el('p.eyebrow', { text: session ? t('nowShowing') : t('comingSoon') }),
          el('h1.title-xl.display', { text: meta.name, dir: 'auto' }),
          el('div.slide__facts', {}, facts),
          meta.description ? el('p.body', { style: { maxWidth: '52vw' }, text: meta.description, dir: 'auto' }) : null,
          showtimes,
          el('div.detail__actions', {}, actions),
        ].filter(Boolean)
      );
      CH.nav.setScope(root);
    }

    render();

    // Catalog rows are thin; fetch the full record so cast, runtime and the
    // trailer appear a moment later without blocking the page.
    if (!meta.demo && (!meta.trailers || !meta.trailers.length || !meta.description)) {
      window.cinema.catalog
        .meta(meta.type || 'movie', meta.id)
        .then((full) => {
          if (!full) return;
          meta = { ...meta, ...full };
          render();
        })
        .catch(() => {});
    }

    return { destroy() {} };
  }

  CH.views = CH.views || {};
  CH.views.details = { id: 'details', mount, chrome: true };
})((window.CH = window.CH || {}));
