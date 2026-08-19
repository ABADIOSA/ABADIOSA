/* Search, driven from a remote. The on-screen keyboard exists because the room
   only has a D-pad; a real keyboard types into the same field. */
(function (CH) {
  'use strict';

  const { el, clear, posterCard } = CH.ui;
  const t = (k, v) => CH.i18n.t(k, v);

  const ROWS_LATIN = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ0123', '456789'];
  const ROWS_ARABIC = ['ابتثجحخدذر', 'زسشصضطظعغف', 'قكلمنهوىية', 'ءأإآؤئ'];

  function mount(root) {
    let query = '';
    let timer = null;
    let requestId = 0;
    let layout = CH.i18n.lang === 'ar' ? 'ar' : 'en'; // keyboard only, not the UI language

    const field = el('div.input', { style: { fontSize: '1.6rem', minHeight: '3.4rem', letterSpacing: '0.08em' } });
    const results = el('div.rail__track', { style: { flexWrap: 'wrap', overflow: 'hidden', maxHeight: '46vh' } });
    const status = el('p.body.muted', { text: '' });

    const keyboard = el('div', {
      style: { display: 'grid', gap: '0.5rem', justifyContent: 'start', marginBlock: '1.4rem' },
    });

    function keyButton(label, onPress, wide) {
      const key = el('button.btn.btn--ghost', {
        text: label,
        style: { padding: '0.55em 0', minWidth: wide ? '9rem' : '3.4rem', fontSize: '1.15rem' },
      });
      return CH.nav.bind(key, onPress);
    }

    function buildKeyboard() {
      clear(keyboard);
      const rows = layout === 'ar' ? ROWS_ARABIC : ROWS_LATIN;
      for (const row of rows) {
        const line = el('div', { style: { display: 'flex', gap: '0.5rem' } });
        for (const ch of row) line.appendChild(keyButton(ch, () => push(ch)));
        keyboard.appendChild(line);
      }
      const controls = el('div', { style: { display: 'flex', gap: '0.5rem' } }, [
        keyButton('␣', () => push(' '), true),
        keyButton('⌫', () => pop(), true),
        keyButton(layout === 'ar' ? 'ABC' : 'ع', () => {
          layout = layout === 'ar' ? 'en' : 'ar';
          buildKeyboard();
          CH.nav.setScope(root);
        }),
        keyButton(`←  ${t('back')}`, () => CH.app.back(), true),
      ]);
      keyboard.appendChild(controls);
    }

    function paint() {
      field.textContent = query || t('typeToSearch');
      field.style.color = query ? 'var(--ink)' : 'var(--ink-faint)';
    }

    function push(ch) {
      query += ch;
      paint();
      schedule();
    }
    function pop() {
      query = query.slice(0, -1);
      paint();
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      if (query.trim().length < 2) {
        clear(results);
        status.textContent = '';
        return;
      }
      status.textContent = t('searching');
      timer = setTimeout(run, 450);
    }

    async function run() {
      const id = ++requestId;
      try {
        const metas = await window.cinema.catalog.search('movie', query.trim());
        if (id !== requestId) return;
        clear(results);
        if (!metas || !metas.length) {
          status.textContent = t('noResults');
          return;
        }
        status.textContent = '';
        for (const meta of metas.slice(0, 24)) {
          results.appendChild(
            posterCard(meta, {
              sub: [meta.releaseInfo, (meta.genres || [])[0]].filter(Boolean).join(' · '),
              onActivate: () => CH.app.go('details', { meta, session: null }),
            })
          );
        }
        CH.nav.setScope(root, CH.nav.current);
      } catch (err) {
        if (id !== requestId) return;
        status.textContent = err.message || t('noResults');
      }
    }

    buildKeyboard();
    paint();
    root.append(
      el('p.eyebrow', { text: t('search') }),
      field,
      keyboard,
      status,
      results
    );

    return {
      onKey(event) {
        if (event.key === 'Backspace') {
          if (query) {
            pop();
            return true;
          }
          return false; // empty field — let Backspace mean "go back"
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          push(event.key);
          return true;
        }
        return false;
      },
      destroy() {
        clearTimeout(timer);
        requestId++;
      },
    };
  }

  CH.views = CH.views || {};
  CH.views.search = { id: 'search', mount, chrome: true };
})((window.CH = window.CH || {}));
