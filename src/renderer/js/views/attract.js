/* The lobby loop.
 *
 * This is what the room sees when nobody is driving: a cinema foyer screen
 * cycling the showtime board, hero cards for what is on now, trailers for what
 * opens soon, and the house notices in between. No pointer, no chrome, no
 * desktop — just the programme. Any key press hands control back to the user.
 */
(function (CH) {
  'use strict';

  const { el, clear, bulbs } = CH.ui;
  const t = (k, v) => CH.i18n.t(k, v);

  function mount(root, params) {
    const cfg = CH.app.config;
    const programme = CH.app.programme;
    const slideMs = Math.max(6, cfg.attractSlideSeconds || 18) * 1000;

    root.classList.add('view--plain');
    const stage = el('div.attract');
    const pips = el('div.reel-pips');
    root.append(stage, pips);

    // Slides need a way to cut themselves short — a trailer that ends early, or
    // one that will not play at all, should move the reel on immediately.
    const controls = { next: () => {} };
    const slides = buildSlides(programme, cfg, controls);
    slides.forEach((s) => stage.appendChild(s.node));
    slides.forEach(() => pips.appendChild(el('i')));

    let index = -1;
    let timer = null;
    let disposed = false;

    function show(next) {
      if (disposed || !slides.length) return;
      const previous = slides[index];
      if (previous) {
        previous.node.classList.remove('is-live');
        if (previous.stop) previous.stop();
      }
      index = (next + slides.length) % slides.length;
      const slide = slides[index];
      slide.node.classList.add('is-live');
      if (slide.start) slide.start();

      Array.from(pips.children).forEach((pip, i) => pip.classList.toggle('is-on', i === index));

      clearTimeout(timer);
      timer = setTimeout(() => show(index + 1), slide.durationMs || slideMs);
    }

    controls.next = () => show(index + 1);

    // Kick off after the first paint so the fade-in reads as a dissolve.
    requestAnimationFrame(() => show(0));
    CH.ui.lights('up');

    return {
      // Left/right scrub the reel by hand; anything else leaves the loop.
      onKey(event) {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          const forward = (event.key === 'ArrowRight') === (CH.i18n.dir === 'ltr');
          show(index + (forward ? 1 : -1));
          return true;
        }
        return false;
      },
      destroy() {
        disposed = true;
        clearTimeout(timer);
        slides.forEach((s) => s.stop && s.stop());
      },
    };
  }

  /* ------------------------------------------------------------- slides */

  function buildSlides(programme, cfg, controls) {
    const slides = [];
    const nowShowing = programme.nowShowing || [];
    const reel = programme.reel || [];

    if (nowShowing.length) slides.push(boardSlide(programme, cfg));

    // Interleave: a hero card, a trailer, a house notice — then repeat.
    const notices = noticeSlides(cfg);
    const heroes = nowShowing.slice(0, 6).map((session) => heroSlide(session, cfg));
    const trailers = cfg.attractPlayTrailers
      ? reel.slice(0, 6).map((entry) => trailerSlide(entry, cfg, controls))
      : reel.slice(0, 6).map((entry) => comingSlide(entry.meta, cfg));

    const maxLen = Math.max(heroes.length, trailers.length, notices.length);
    for (let i = 0; i < maxLen; i++) {
      if (heroes[i]) slides.push(heroes[i]);
      if (trailers[i]) slides.push(trailers[i]);
      if (notices[i % notices.length] && i % 2 === 1) slides.push(notices[i % notices.length]);
    }

    return slides.length ? slides : [noticeSlides(cfg)[0]];
  }

  /** The showtime board — the thing that most says "cinema" at a glance. */
  function boardSlide(programme, cfg) {
    const now = new Date();
    // One line per auditorium, ordered by screen number — a real foyer board
    // never lists the same house twice.
    const byScreen = new Map();
    for (const session of programme.nowShowing || []) {
      if (!byScreen.has(session.screen)) byScreen.set(session.screen, session);
    }
    const rows = Array.from(byScreen.values())
      .sort((a, b) => a.screen - b.screen)
      .slice(0, 10)
      .map((session) => {
      const times = session.showtimes.map((iso) => new Date(iso));
      const nextIdx = times.findIndex((d) => d > now);
      return el('div.board__row', {}, [
        el('div.board__screen', { text: String(session.screen) }),
        el('div.board__film', {}, [
          el('div.board__name', { text: session.meta.name, dir: 'auto' }),
          el('div.board__sub', {
            text: [session.format, session.certification, session.runtime ? `${session.runtime} ${CH.i18n.lang === 'ar' ? 'د' : 'min'}` : '']
              .filter(Boolean)
              .join(' · '),
          }),
        ]),
        el(
          'div.board__times',
          {},
          times.slice(0, 5).map((d, i) =>
            el('span.board__time', {
              text: CH.i18n.time(d, cfg.clock24h),
              class: `board__time ${i === nextIdx ? 'is-next' : d < now ? 'is-past' : ''}`,
            })
          )
        ),
      ]);
    });

    const node = el('div.slide', {}, [
      el('div.board', {}, [
        el('header.board__head', {}, [
          bulbs(11),
          el('p.eyebrow', { text: t('todayProgramme') }),
          el('h1.title-lg.display', { text: CH.i18n.date(now) }),
        ]),
        el('div.board__grid', {}, rows),
      ]),
    ]);
    return { node, durationMs: Math.max(14000, (cfg.attractSlideSeconds || 18) * 1000) };
  }

  /** A film that is playing now, with its next house time. */
  function heroSlide(session, cfg) {
    const meta = session.meta;
    const now = new Date();
    const times = session.showtimes.map((iso) => new Date(iso));
    const next = times.find((d) => d > now) || times[0];
    const minutes = next ? Math.max(0, Math.round((next - now) / 60000)) : null;

    const node = el('div.slide', {}, [
      el('div.slide__bg', { style: { backgroundImage: `url("${meta.background || meta.poster}")` } }),
      el('div.slide__scrim'),
      el('div.slide__body', {}, [
        el('p.eyebrow', { text: t('nowShowing') }),
        el('h1.title-xl.display', { text: meta.name, dir: 'auto' }),
        el('div.slide__facts', {}, [
          el('span.chip.chip--solid', { text: `${t('screen')} ${session.screen}` }),
          el('span.chip', { text: session.format }),
          session.certification ? el('span.chip.chip--rating', { text: session.certification }) : null,
          session.runtime ? el('span.chip', { text: `${session.runtime} ${CH.i18n.lang === 'ar' ? 'د' : 'min'}` }) : null,
          meta.imdbRating ? el('span.chip', { text: `★ ${meta.imdbRating}` }) : null,
        ]),
        meta.description ? el('p.body.slide__synopsis', { text: meta.description, dir: 'auto' }) : null,
        next
          ? el('p.title-md.display', {
              style: { color: 'var(--gold-hot)' },
              text:
                minutes <= 1
                  ? t('startingNow')
                  : `${t('nextShow')} ${CH.i18n.time(next, cfg.clock24h)} — ${t('startsIn', { n: minutes })}`,
            })
          : null,
      ]),
    ]);
    return { node };
  }

  /** Coming soon, playing its trailer inline. */
  function trailerSlide(entry, cfg, controls) {
    const meta = entry.meta;
    const ytId = (meta.trailers && meta.trailers[0] && meta.trailers[0].ytId) || null;
    if (!ytId) return comingSlide(meta, cfg);

    const frame = el('div', { style: { position: 'absolute', inset: '0', background: '#000' } });
    const caption = el('div.slide__body', { style: { maxWidth: '52vw' } }, [
      el('p.eyebrow', { text: entry.kind === 'coming-soon' ? t('comingSoon') : t('nowShowing') }),
      el('h1.title-lg.display', { text: meta.name, dir: 'auto' }),
      meta.released
        ? el('p.title-md', { style: { color: 'var(--gold)' }, text: t('opensOn', { date: CH.i18n.date(meta.released) }) })
        : null,
    ]);

    const node = el('div.slide', {}, [
      frame,
      el('div', {
        style: {
          position: 'absolute',
          inset: '0',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 45%)',
          pointerEvents: 'none',
        },
      }),
      caption,
    ]);

    let player = null;
    let failed = false; // a trailer that would not play is not offered again

    const showArtInstead = () => {
      clear(frame).appendChild(
        el('div.slide__bg', {
          style: {
            backgroundImage: `url("${meta.background || meta.poster}")`,
            animation: 'ken-burns 18s ease-out forwards',
          },
        })
      );
    };

    return {
      node,
      // Give a trailer room to breathe — roughly three ordinary slides. It ends
      // sooner on its own when the video finishes.
      durationMs: Math.max(45000, (cfg.attractSlideSeconds || 18) * 3000),
      start() {
        clear(frame);
        if (failed) {
          showArtInstead();
          return;
        }
        player = CH.youtube.play(frame, ytId, {
          muted: cfg.attractMuted !== false,
          onEnded: () => controls.next(),
          onError: (info) => {
            console.warn('trailer unavailable', meta.name, info);
            failed = true;
            showArtInstead();
            // Hold the artwork briefly so the loop does not lurch forward.
            setTimeout(() => controls.next(), 2500);
          },
        });
      },
      stop() {
        if (player) player.destroy();
        player = null;
        clear(frame);
      },
    };
  }

  /** Coming soon with no trailer available — poster art carries it instead. */
  function comingSlide(meta, cfg) {
    const node = el('div.slide', {}, [
      el('div.slide__bg', { style: { backgroundImage: `url("${meta.background || meta.poster}")` } }),
      el('div.slide__scrim'),
      el('div.slide__body', {}, [
        el('p.eyebrow', { text: t('comingSoon') }),
        el('h1.title-xl.display', { text: meta.name, dir: 'auto' }),
        meta.description ? el('p.body.slide__synopsis', { text: meta.description, dir: 'auto' }) : null,
        meta.released
          ? el('p.title-md.display', { style: { color: 'var(--gold-hot)' }, text: t('opensOn', { date: CH.i18n.date(meta.released) }) })
          : el('p.title-md.display', { style: { color: 'var(--gold-hot)' }, text: t('inTheatres') }),
      ]),
    ]);
    return { node };
  }

  /** House notices — the cards a real foyer screen rotates between trailers. */
  function noticeSlides(cfg) {
    const houseName = CH.i18n.lang === 'ar' ? cfg.cinemaNameAr || 'دار العرض' : cfg.cinemaName || 'CINEMA HALL';
    const cards = [
      { icon: '🎟️', line: t('bumperWelcome', { name: houseName }), sub: t('bumperWelcomeSub') },
      { icon: '📵', line: t('bumperSilence'), sub: t('bumperSilenceSub') },
      { icon: '🚫', line: t('bumperNoRecord'), sub: t('bumperNoRecordSub') },
      { icon: '🍿', line: t('bumperEnjoy'), sub: t('bumperEnjoySub') },
    ];
    return cards.map((card) => ({
      node: el('div.slide', {}, [
        el('div.bumper.is-live', {}, [
          el('div.bumper__icon', { text: card.icon }),
          el('h1.bumper__line.display', { text: card.line }),
          el('p.bumper__sub', { text: card.sub }),
          bulbs(7),
        ]),
      ]),
      durationMs: 9000,
    }));
  }

  CH.views = CH.views || {};
  CH.views.attract = { id: 'attract', mount, chrome: false };
})((window.CH = window.CH || {}));
