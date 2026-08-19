/* Source picker. Add-ons answer with anything from a 4K direct link to a
   torrent; we label what each one actually is before the lights go down. */
(function (CH) {
  'use strict';

  const { el, clear } = CH.ui;
  const t = (k, v) => CH.i18n.t(k, v);

  const QUALITY = [
    [/2160|4k|uhd/i, '4K'],
    [/1080/i, '1080p'],
    [/720/i, '720p'],
    [/480|sd\b/i, 'SD'],
  ];

  function describe(stream) {
    const text = `${stream.name || ''} ${stream.title || ''} ${stream.description || ''}`;
    const quality = (QUALITY.find(([re]) => re.test(text)) || [])[1] || '';
    const kind = stream.url ? 'HTTP' : stream.infoHash ? 'TORRENT' : stream.ytId ? 'YOUTUBE' : stream.externalUrl ? 'EXTERNAL' : '?';
    return { quality, kind, text: text.trim() };
  }

  function mount(root, params) {
    const cfg = CH.app.config;
    const head = el('header', { style: { marginBottom: '2.2vh' } }, [
      el('p.eyebrow', { text: t('selectSource') }),
      el('h1.title-lg.display', { text: params.meta.name, dir: 'auto' }),
    ]);
    const list = el('div.list', { style: { maxHeight: '66vh' } });
    const status = el('p.body.muted', { text: t('loading') });
    root.append(head, status, list);

    let disposed = false;

    function start(stream) {
      const target = cfg.preshowEnabled === false ? 'player' : 'preshow';
      CH.app.go(target, { meta: params.meta, session: params.session, stream });
    }

    window.cinema.catalog
      .streams(params.meta.type || 'movie', params.meta.id)
      .then((streams) => {
        if (disposed) return;
        status.remove();
        if (!streams || !streams.length) {
          list.appendChild(el('p.body', { text: t('noStreams') }));
          const back = CH.nav.bind(el('button.btn.btn--ghost', { text: `←  ${t('back')}` }), () => CH.app.back(), { default: true });
          list.appendChild(back);
          CH.nav.setScope(root);
          return;
        }

        // Direct links first — they start instantly and need no local server.
        const ordered = [...streams].sort((a, b) => rank(a) - rank(b));
        for (const stream of ordered) {
          const info = describe(stream);
          const row = el('div.list__item', {}, [
            el('span.list__tag', { text: info.quality || info.kind }),
            el('div', {}, [
              el('div.list__name', { text: stream.name || stream.addonName || t('play'), dir: 'auto' }),
              el('div.list__sub', { text: (stream.title || stream.description || '').slice(0, 160), dir: 'auto' }),
            ]),
            el('span.list__tag', { text: stream.addonName || '' }),
          ]);
          CH.nav.bind(row, () => start(stream), { default: ordered.indexOf(stream) === 0 });
          list.appendChild(row);
        }
        CH.nav.setScope(root);
      })
      .catch((err) => {
        if (disposed) return;
        status.textContent = err.message || t('noStreams');
      });

    return {
      onKey(event) {
        if (event.key === 'Escape' || event.key === 'Backspace') {
          CH.app.back();
          return true;
        }
        return false;
      },
      destroy() {
        disposed = true;
        clear(list);
      },
    };
  }

  function rank(stream) {
    const text = `${stream.name || ''} ${stream.title || ''}`;
    let score = stream.url ? 0 : stream.infoHash ? 20 : 40;
    if (/2160|4k|uhd/i.test(text)) score -= 5;
    else if (/1080/i.test(text)) score -= 3;
    else if (/720/i.test(text)) score -= 1;
    return score;
  }

  CH.views = CH.views || {};
  CH.views.streams = { id: 'streams', mount, chrome: true };
})((window.CH = window.CH || {}));
