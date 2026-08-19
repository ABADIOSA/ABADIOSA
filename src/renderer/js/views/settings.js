/* Settings, built for a remote: every row is one focusable thing, Enter either
   flips it, cycles it, or opens a text prompt. Nothing needs a mouse. */
(function (CH) {
  'use strict';

  const { el, clear, toast } = CH.ui;
  const t = (k, v) => CH.i18n.t(k, v);

  const TABS = ['display', 'sources', 'show', 'account', 'about'];
  const TAB_LABEL = { display: 'setDisplay', sources: 'setSources', show: 'setShow', account: 'setAccount', about: 'setAbout' };

  /* --------------------------------------------------------- text prompt */

  function prompt({ title, value = '', password = false, hint = '' }) {
    return new Promise((resolve) => {
      const input = el('input.input', { type: password ? 'password' : 'text', value });
      const overlay = el('div.overlay', {}, [
        el('div.overlay__panel.panel', {}, [
          el('h2.title-md.display', { text: title }),
          hint ? el('p.body.muted', { text: hint }) : null,
          input,
          el('p.muted', { style: { fontSize: '0.9rem' }, text: '⏎ / Esc' }),
        ]),
      ]);
      document.getElementById('stage').appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.classList.add('is-open');
        input.focus();
        input.select();
      });

      CH.app.captureKeys = true;
      const close = (result) => {
        CH.app.captureKeys = false;
        overlay.classList.remove('is-open');
        setTimeout(() => overlay.remove(), 300);
        resolve(result);
      };
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') close(input.value);
        else if (event.key === 'Escape') close(null);
      });
    });
  }

  /* -------------------------------------------------------------- fields */

  function field(label, valueText, onActivate, hint) {
    const row = el('div.field', {}, [
      el('div', {}, [el('div.field__label', { text: label }), hint ? el('div.field__hint', { text: hint }) : null]),
      el('div.field__value', { text: valueText }),
    ]);
    return CH.nav.bind(row, onActivate);
  }

  const onOff = (value) => (value ? (CH.i18n.lang === 'ar' ? 'مُفعّل' : 'On') : CH.i18n.lang === 'ar' ? 'مُعطّل' : 'Off');

  function mount(root, params) {
    let tab = (params && params.tab) || 'display';
    let displays = [];
    let serverState = null;
    let addonList = [];
    let tvState = null;

    const nav = el('nav.settings__nav');
    const pane = el('div.settings__pane');
    root.classList.add('view--plain');
    root.appendChild(el('div.settings', {}, [nav, pane]));

    const cfg = () => CH.app.config;

    async function save(patch) {
      CH.app.config = await window.cinema.config.set(patch);
      CH.app.applyConfig();
      render();
    }

    function buildNav() {
      clear(nav);
      nav.appendChild(el('p.eyebrow', { text: t('settings'), style: { marginBottom: '1rem' } }));
      for (const name of TABS) {
        const item = el(`div.settings__tab${name === tab ? '.is-active' : ''}`, { text: t(TAB_LABEL[name]) });
        CH.nav.bind(item, () => {
          tab = name;
          render();
        });
        nav.appendChild(item);
      }
      nav.appendChild(
        CH.nav.bind(el('div.settings__tab', { text: `←  ${t('back')}`, style: { marginTop: '1.5rem' } }), () => CH.app.back())
      );
    }

    /* ------------------------------------------------------------- panes */

    function displayPane() {
      const c = cfg();
      const modeLabels = { auto: t('cinemaAuto'), always: t('cinemaAlways'), off: t('cinemaOff') };
      const currentDisplay =
        c.displayIndex === null || c.displayIndex === undefined
          ? t('optScreenAuto')
          : (displays[c.displayIndex] &&
              `${displays[c.displayIndex].label} — ${displays[c.displayIndex].width}×${displays[c.displayIndex].height}`) ||
            String(c.displayIndex);

      return [
        field(
          t('tvStatus'),
          tvState ? (tvState.tv ? `${t('tvOn')} — ${(tvState.display && tvState.display.label) || ''}` : t('tvOff')) : '…',
          async () => {
            tvState = await window.cinema.app.tvStatus();
            render();
          },
          t('tvHint')
        ),
        field(
          t('optCinemaMode'),
          modeLabels[c.cinemaMode] || c.cinemaMode,
          async () => {
            const order = ['auto', 'always', 'off'];
            const next = order[(order.indexOf(c.cinemaMode) + 1) % order.length];
            await save({ cinemaMode: next });
            tvState = await window.cinema.app.tvStatus();
            render();
          },
          t('optCinemaModeHint')
        ),
        field(t('optAnnounceTv'), onOff(c.announceTv), () => save({ announceTv: !c.announceTv })),
        field(t('optScreen'), currentDisplay, () => {
          // Cycle: auto → each connected display → auto
          const order = [null, ...displays.map((d) => d.index)];
          const at = order.findIndex((v) => v === (c.displayIndex ?? null));
          const next = order[(at + 1) % order.length];
          window.cinema.app.useDisplay(next).then(async () => {
            tvState = await window.cinema.app.tvStatus();
            await save({ displayIndex: next });
          });
        }, t('optScreenHint')),
        field(t('optOverscan'), `${c.overscanPercent}%`, () => {
          const steps = [0, 1.5, 2.5, 4, 6];
          const next = steps[(steps.indexOf(Number(c.overscanPercent)) + 1) % steps.length];
          save({ overscanPercent: next });
        }, t('optOverscanHint')),
        field(t('optCursor'), onOff(c.hideCursor), () => save({ hideCursor: !c.hideCursor })),
        field(t('optClock'), onOff(c.clock24h), () => save({ clock24h: !c.clock24h })),
        field(t('optLaunch'), onOff(c.launchAtLogin), () => save({ launchAtLogin: !c.launchAtLogin })),
        field(t('optLanguage'), c.language === 'ar' ? 'العربية' : 'English', () =>
          save({ language: c.language === 'ar' ? 'en' : 'ar' })
        ),
      ];
    }

    function sourcesPane() {
      const c = cfg();
      const rows = [
        field(
          t('serverStatus'),
          serverState ? (serverState.online ? t('serverOnline') : t('serverOffline')) : '…',
          async () => {
            serverState = await window.cinema.playback.serverStatus();
            render();
          },
          `${c.streamingServerUrl} — ${t('serverHint')}`
        ),
        field(t('addonAdd'), '+', async () => {
          const url = await prompt({ title: t('addonAdd'), hint: t('addonUrl'), value: 'https://' });
          if (!url) return;
          try {
            const added = await window.cinema.addons.add(url.trim());
            toast(t('addonAdded', { name: added.name }));
            await reloadProgramme();
          } catch (err) {
            toast(err.message, 6000);
          }
        }),
        field(t('reload'), '↻', () => reloadProgramme()),
        el('p.eyebrow', { text: t('addonInstalled'), style: { marginTop: '1.4rem' } }),
      ];

      for (const addon of addonList) {
        rows.push(
          field(addon.name, t('addonRemove'), async () => {
            await window.cinema.addons.remove(addon.transportUrl);
            await reloadProgramme();
          }, `${(addon.types || []).join(', ')} · ${(addon.resources || []).join(', ')}`)
        );
      }
      return rows;
    }

    function showPane() {
      const c = cfg();
      const cycle = (key, steps) => () => {
        const at = steps.indexOf(Number(c[key]));
        save({ [key]: steps[(at + 1) % steps.length] });
      };
      const cycleSchedule = (key, steps) => () => {
        const at = steps.indexOf(Number(c.schedule[key]));
        save({ schedule: { [key]: steps[(at + 1) % steps.length] } });
      };

      return [
        field(t('optCinemaName'), CH.i18n.lang === 'ar' ? c.cinemaNameAr : c.cinemaName, async () => {
          const key = CH.i18n.lang === 'ar' ? 'cinemaNameAr' : 'cinemaName';
          const value = await prompt({ title: t('optCinemaName'), value: c[key] });
          if (value !== null) save({ [key]: value });
        }),
        el('p.eyebrow', { text: t('optAttract'), style: { marginTop: '1rem' } }),
        field(t('optAttract'), onOff(c.attractEnabled), () => save({ attractEnabled: !c.attractEnabled }), t('optAttractHint')),
        field(t('optIdle'), `${c.idleSecondsToAttract}s`, cycle('idleSecondsToAttract', [30, 60, 120, 180, 300, 600])),
        field(t('optSlide'), `${c.attractSlideSeconds}s`, cycle('attractSlideSeconds', [10, 14, 18, 24, 30])),
        field(t('optTrailers'), onOff(c.attractPlayTrailers), () => save({ attractPlayTrailers: !c.attractPlayTrailers })),
        field(t('optMuted'), onOff(c.attractMuted), () => save({ attractMuted: !c.attractMuted })),

        el('p.eyebrow', { text: t('optPreshow'), style: { marginTop: '1rem' } }),
        field(t('optPreshow'), onOff(c.preshowEnabled), () => save({ preshowEnabled: !c.preshowEnabled }), t('optPreshowHint')),
        field(t('optPreshowCount'), String(c.preshowTrailers), cycle('preshowTrailers', [0, 1, 2, 3])),
        field(t('optBumpers'), onOff(c.preshowBumpers), () => save({ preshowBumpers: !c.preshowBumpers })),
        field(t('optCountdown'), onOff(c.preshowCountdown), () => save({ preshowCountdown: !c.preshowCountdown })),

        el('p.eyebrow', { text: t('showtimes'), style: { marginTop: '1rem' } }),
        field(t('optScreens'), String(c.schedule.screens), cycleSchedule('screens', [4, 6, 8, 10, 12, 16])),
        field(t('optFirstShow'), c.schedule.firstShow, async () => {
          const value = await prompt({ title: t('optFirstShow'), value: c.schedule.firstShow, hint: 'HH:MM' });
          if (value) save({ schedule: { firstShow: value } });
        }),
        field(t('optLastShow'), c.schedule.lastShow, async () => {
          const value = await prompt({ title: t('optLastShow'), value: c.schedule.lastShow, hint: 'HH:MM' });
          if (value) save({ schedule: { lastShow: value } });
        }),
        field(t('optGap'), String(c.schedule.minutesBetweenShows), cycleSchedule('minutesBetweenShows', [90, 120, 150, 180, 210])),
      ];
    }

    function accountPane() {
      const c = cfg();
      if (c.account && c.account.email) {
        return [
          el('p.body', { text: t('signedInAs', { email: c.account.email }) }),
          field(t('signOut'), '→', async () => {
            await window.cinema.account.logout();
            CH.app.config = await window.cinema.config.get();
            await reloadProgramme();
          }),
        ];
      }
      return [
        el('p.body.muted', { text: t('signInHint') }),
        field(t('signIn'), '→', async () => {
          const email = await prompt({ title: t('email') });
          if (!email) return;
          const password = await prompt({ title: t('password'), password: true });
          if (password === null) return;
          try {
            const result = await window.cinema.account.login(email.trim(), password);
            CH.app.config = await window.cinema.config.get();
            toast(t('signInOk', { n: result.addons }));
            await reloadProgramme();
          } catch (err) {
            toast(err.message, 6000);
          }
        }),
      ];
    }

    function aboutPane() {
      const v = CH.app.versions || {};
      return [
        el('h2.title-md.display', { text: 'Cinema Hall' }),
        el('p.body.muted', {
          text:
            CH.i18n.lang === 'ar'
              ? 'عميل Stremio مصمَّم ليعمل كصالة سينما على شاشة التلفزيون: لوبي وإعلانات ومواعيد عرض ومقدمة ما قبل الفيلم.'
              : 'A Stremio client shaped like a cinema: a lobby loop, coming attractions, showtimes, and a full pre-show.',
        }),
        el('p.body.muted', { text: `v${v.app || '1.0.0'} · Electron ${v.electron || ''} · ${v.platform || ''}` }),
        field(t('reload'), '↻', () => reloadProgramme()),
        field(t('exit'), '⏻', () => window.cinema.app.quit()),
        el('p.muted', {
          style: { fontSize: '0.9rem', marginTop: '1rem' },
          text: 'F10 — cinema mode: auto / always / off · Ctrl+Shift+Q — quit',
        }),
      ];
    }

    async function reloadProgramme() {
      toast(t('loading'));
      await CH.app.loadProgramme({ force: true });
      addonList = await window.cinema.addons.list();
      render();
      toast(t('todayProgramme'));
    }

    function render() {
      buildNav();
      clear(pane);
      const panes = { display: displayPane, sources: sourcesPane, show: showPane, account: accountPane, about: aboutPane };
      for (const node of panes[tab]()) if (node) pane.appendChild(node);
      CH.nav.setScope(root);
    }

    render();

    // Fill in the things that need a round trip, then repaint.
    Promise.all([
      window.cinema.app.displays(),
      window.cinema.addons.list(),
      window.cinema.playback.serverStatus(),
      window.cinema.app.tvStatus(),
    ])
      .then(([d, a, s, tv]) => {
        displays = d;
        addonList = a;
        serverState = s;
        tvState = tv;
        render();
      })
      .catch(() => {});

    return {
      onKey(event) {
        if (event.key === 'Escape' || event.key === 'Backspace') {
          CH.app.back();
          return true;
        }
        return false;
      },
      destroy() {},
    };
  }

  CH.views = CH.views || {};
  CH.views.settings = { id: 'settings', mount, chrome: true };
})((window.CH = window.CH || {}));
