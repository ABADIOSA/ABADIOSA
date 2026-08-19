/* The pre-show.
 *
 * Between choosing a film and the film starting, a real cinema spends four or
 * five minutes on ceremony: the curtain, the house notices, the coming
 * attractions, the title card, the Academy leader counting down. That ceremony
 * is the whole point of this app, so it is a first-class sequence rather than a
 * splash screen. Any key skips the current beat; Escape skips the lot.
 */
(function (CH) {
  'use strict';

  const { el, clear, wait, curtain, lights } = CH.ui;
  const t = (k, v) => CH.i18n.t(k, v);

  function mount(root, params) {
    const cfg = CH.app.config;
    root.classList.add('view--plain');
    const stage = el('div.preshow');
    root.appendChild(stage);

    let skipStep = null;   // resolves the beat currently on screen
    let aborted = false;

    /** A beat that ends on its own timer, or early when the user presses a key. */
    function beat(ms) {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          skipStep = null;
          resolve();
        };
        const timer = setTimeout(finish, ms);
        skipStep = finish;
      });
    }

    async function showBumper({ icon, line, sub, ms = 4200, alert = false }) {
      if (aborted) return;
      const node = el(`div.bumper${alert ? '.bumper--alert' : ''}`, {}, [
        icon ? el('div.bumper__icon', { text: icon }) : null,
        el('h1.bumper__line.display', { text: line }),
        sub ? el('p.bumper__sub', { text: sub }) : null,
      ]);
      clear(stage).appendChild(node);
      requestAnimationFrame(() => node.classList.add('is-live'));
      await beat(ms);
      node.classList.remove('is-live');
      await wait(500);
    }

    async function showTrailer(meta) {
      if (aborted) return;
      const ytId = meta.trailers && meta.trailers[0] && meta.trailers[0].ytId;
      if (!ytId) return;

      const frame = el('div', { style: { position: 'absolute', inset: '0', background: '#000' } });
      const label = el(
        'div',
        {
          style: {
            position: 'absolute',
            insetInlineStart: '4vw',
            insetBlockEnd: '5vh',
            zIndex: '5',
            textShadow: '0 2px 20px rgba(0,0,0,.9)',
          },
        },
        [el('p.eyebrow', { text: t('comingSoon') }), el('h2.title-md.display', { text: meta.name })]
      );
      clear(stage).append(frame, label);

      // The beat ends on whichever comes first: the trailer finishing, the
      // trailer failing to play, the cap, or a key press.
      const player = CH.youtube.play(frame, ytId, {
        muted: false,
        onEnded: () => skipStep && skipStep(),
        onError: (info) => {
          console.warn('pre-show trailer unavailable', meta.name, info);
          if (skipStep) skipStep();
        },
      });

      // Trailers run about two minutes; the skip key is always there.
      await beat(125000);
      player.destroy();
      clear(stage);
      await wait(300);
    }

    async function showTitleCard(meta) {
      if (aborted) return;
      const houseName = CH.i18n.lang === 'ar' ? cfg.cinemaNameAr || 'دار العرض' : cfg.cinemaName || 'CINEMA HALL';
      const node = el('div.title-card', {}, [
        el('p.eyebrow', { text: `${houseName} ${t('presents')}` }),
        el('div.title-card__rule'),
        el('h1.title-card__name.display', { text: meta.name }),
        el('div.title-card__rule'),
        el('p.bumper__sub', { text: t('featurePresentation') }),
      ]);
      clear(stage).appendChild(node);
      requestAnimationFrame(() => node.classList.add('is-live'));
      await beat(5200);
      node.classList.remove('is-live');
      await wait(700);
    }

    /** Academy leader: ring, cross-hairs, and a one-second sweep per number. */
    async function showCountdown(from = 5) {
      if (aborted) return;
      const num = el('div.leader__num', { text: String(from) });
      const sweep = el('div.leader__sweep');
      const node = el('div.leader', {}, [
        el('div.leader__frame', {}, [
          el('div.leader__ring', {
            html:
              '<svg viewBox="0 0 200 200" width="100%" height="100%">' +
              '<circle cx="100" cy="100" r="96" fill="none" stroke="rgba(246,239,227,0.55)" stroke-width="1.5"/>' +
              '<circle cx="100" cy="100" r="78" fill="none" stroke="rgba(246,239,227,0.28)" stroke-width="1"/>' +
              '<path d="M100 0 V200 M0 100 H200" stroke="rgba(246,239,227,0.35)" stroke-width="1"/>' +
              '</svg>',
          }),
          sweep,
          num,
        ]),
      ]);
      clear(stage).appendChild(node);
      requestAnimationFrame(() => node.classList.add('is-live'));

      for (let n = from; n >= 2 && !aborted; n--) {
        num.textContent = String(n);
        const started = performance.now();
        let raf = 0;
        const spin = () => {
          const elapsed = performance.now() - started;
          sweep.style.setProperty('--sweep', `${Math.min(360, (elapsed / 1000) * 360)}deg`);
          if (elapsed < 1000) raf = requestAnimationFrame(spin);
        };
        spin();
        await beat(1000);
        cancelAnimationFrame(raf);
        sweep.style.setProperty('--sweep', '0deg');
      }

      node.classList.remove('is-live');
      await wait(350);
      clear(stage);
      // A held black frame — the pause every projector leaves before the reel.
      await wait(700);
    }

    async function run() {
      CH.ui.mode('preshow');
      lights('down');
      // Velvet first, then the house opens onto the screen — everything that
      // follows plays *on* the screen, so the curtain must be up for it.
      curtain.snapClosed();
      await wait(900);
      await curtain.open();

      const houseName = CH.i18n.lang === 'ar' ? cfg.cinemaNameAr || 'دار العرض' : cfg.cinemaName || 'CINEMA HALL';

      if (cfg.preshowBumpers !== false) {
        await showBumper({ icon: '🎟️', line: t('bumperWelcome', { name: houseName }), sub: t('bumperWelcomeSub'), ms: 4000 });
        await showBumper({ icon: '📵', line: t('bumperSilence'), sub: t('bumperSilenceSub'), ms: 4200, alert: true });
        await showBumper({ icon: '🚫', line: t('bumperNoRecord'), sub: t('bumperNoRecordSub'), ms: 3800 });
      }

      const count = Math.max(0, Number(cfg.preshowTrailers ?? 2));
      const reel = (CH.app.programme.reel || [])
        .map((entry) => entry.meta)
        .filter((meta) => meta && meta.id !== params.meta.id && meta.trailers && meta.trailers.length)
        .slice(0, count);

      if (reel.length && !aborted) {
        await showBumper({ icon: '🎬', line: t('bumperTrailers'), ms: 3000 });
        for (const meta of reel) {
          if (aborted) break;
          await showTrailer(meta);
        }
      }

      if (aborted) return;
      await showTitleCard(params.meta);
      if (aborted) return;
      if (cfg.preshowCountdown !== false) await showCountdown(5);

      // Abandoned mid-ceremony (idle timeout, a jump elsewhere) — do not force
      // the feature open on top of whatever the user is looking at now.
      if (aborted) return;
      CH.app.go('player', params, { replace: true });
    }

    run().catch((err) => {
      console.error('pre-show failed', err);
      CH.app.go('player', params, { replace: true });
    });

    return {
      onKey(event) {
        if (event.key === 'Escape' || event.key === 'Backspace') {
          aborted = true;
          if (skipStep) skipStep();
          clear(stage);
          curtain.reset();
          CH.app.go('player', params, { replace: true });
          return true;
        }
        // Any other key advances past the beat on screen.
        if (skipStep) {
          skipStep();
          return true;
        }
        return false;
      },
      destroy() {
        aborted = true;
        if (skipStep) skipStep();
        clear(stage);
        curtain.reset(); // never leave velvet hanging over another view
      },
    };
  }

  CH.views = CH.views || {};
  CH.views.preshow = { id: 'preshow', mount, chrome: false };
})((window.CH = window.CH || {}));
