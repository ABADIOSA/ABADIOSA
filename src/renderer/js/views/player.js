/* The feature presentation.
 *
 * Plain <video> for direct and torrent-server streams, hls.js for m3u8. The
 * on-screen display stays out of the way and disappears after a few seconds so
 * the picture is all that is left in the room.
 */
(function (CH) {
  'use strict';

  const { el, clear, wait, curtain, lights, toast } = CH.ui;
  const t = (k, v) => CH.i18n.t(k, v);

  function fmt(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
  }

  function mount(root, params) {
    root.classList.add('view--plain');
    CH.ui.mode('player');
    lights('down');

    const stage = el('div.player');
    const video = el('video', { playsinline: true, preload: 'auto' });
    const spinner = el('div.spinner', {}, [el('div.spinner__ring'), el('p.spinner__label', { text: t('buffering') })]);

    const osdTitle = el('div.osd__title', { text: params.meta.name });
    const osdFill = el('div.osd__fill');
    const osdNow = el('span', { text: '0:00' });
    const osdLeft = el('span', { text: '0:00' });
    const osdNote = el('span.osd__buffer', { text: '' });
    const osd = el('div.osd', {}, [
      osdTitle,
      el('div.osd__bar', {}, [osdFill]),
      el('div.osd__row', {}, [osdNow, osdNote, osdLeft]),
    ]);

    stage.append(video, spinner, osd);
    root.appendChild(stage);

    let hls = null;
    let osdTimer = null;
    let disposed = false;
    let finished = false;

    function flashOsd(ms = 4000) {
      osd.classList.add('is-visible');
      clearTimeout(osdTimer);
      osdTimer = setTimeout(() => osd.classList.remove('is-visible'), ms);
    }

    function setSpinner(on, label) {
      spinner.classList.toggle('is-hidden', !on);
      if (label) spinner.querySelector('.spinner__label').textContent = label;
    }

    /* ------------------------------------------------------------ source */

    async function start() {
      setSpinner(true, t('buffering'));
      let resolved;
      try {
        resolved = await window.cinema.playback.resolve(params.stream);
      } catch (err) {
        return fail(err.message);
      }
      if (disposed) return;

      if (resolved.kind === 'external') {
        window.cinema.app.openExternal(resolved.url);
        toast(t('externalOnly'));
        return CH.app.back();
      }
      if (resolved.kind === 'youtube') {
        // Play it in-frame so we never drop out of the auditorium.
        const ytId = params.stream.ytId;
        clear(stage).appendChild(
          el('iframe', {
            src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
            allow: 'autoplay; encrypted-media; fullscreen',
            referrerpolicy: 'no-referrer',
            frameborder: '0',
          })
        );
        return;
      }
      if (resolved.needsServer) return fail(t('serverNeeded'));
      if (!resolved.url) return fail(resolved.reason || t('unsupported'));

      attachSource(resolved.url);
    }

    function attachSource(url) {
      const isHls = /\.m3u8(\?|$)/i.test(url);
      if (isHls && window.Hls && window.Hls.isSupported()) {
        hls = new window.Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 60 });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else fail(data.details || 'HLS error');
        });
      } else {
        video.src = url;
      }

      // Subtitle tracks, when the add-on supplied any.
      for (const sub of params.stream.subtitles || []) {
        if (!sub || !sub.url) continue;
        video.appendChild(
          el('track', { kind: 'subtitles', src: sub.url, srclang: sub.lang || 'und', label: sub.lang || 'sub' })
        );
      }

      video.play().catch(() => {
        // Autoplay was refused — surface it rather than sitting on a black screen.
        setSpinner(false);
        flashOsd(8000);
        osdNote.textContent = '▶';
      });
    }

    function fail(message) {
      // A late error from a player the user already left must not yank the
      // view out from under wherever they have navigated to since.
      if (disposed) return;
      setSpinner(false);
      toast(message || t('unsupported'), 6000);
      CH.app.back();
    }

    /* ------------------------------------------------------------ events */

    video.addEventListener('playing', () => {
      setSpinner(false);
      osdNote.textContent = '';
      flashOsd(2500);
    });
    video.addEventListener('waiting', () => setSpinner(true, t('buffering')));
    video.addEventListener('timeupdate', () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        osdFill.style.width = `${(video.currentTime / duration) * 100}%`;
        osdLeft.textContent = `-${fmt(duration - video.currentTime)}`;
      }
      osdNow.textContent = fmt(video.currentTime);
    });
    video.addEventListener('error', () => {
      const code = video.error && video.error.code;
      fail(code === 4 ? t('unsupported') : t('unsupported'));
    });
    video.addEventListener('ended', () => endOfFilm());

    async function endOfFilm() {
      if (finished || disposed) return;
      finished = true;
      const card = el('div.title-card.is-live', {}, [
        el('div.title-card__rule'),
        el('h1.title-card__name.display', { text: t('theEnd') }),
        el('div.title-card__rule'),
      ]);
      stage.appendChild(card);
      await wait(3200);
      await curtain.close();
      CH.app.go('attract', {}, { reset: true });
      await curtain.open();
    }

    async function leave() {
      await curtain.close();
      CH.app.back();
      await curtain.open();
    }

    start();

    /* -------------------------------------------------------------- keys */

    const seek = (delta) => {
      if (!Number.isFinite(video.duration)) return;
      video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + delta));
      flashOsd();
    };

    return {
      onKey(event) {
        const rtl = CH.i18n.dir === 'rtl';
        switch (event.key) {
          case ' ':
          case 'Enter':
          case 'MediaPlayPause':
            if (video.paused) video.play();
            else video.pause();
            osdNote.textContent = video.paused ? '❚❚' : '';
            flashOsd();
            return true;
          case 'ArrowRight':
            seek(rtl ? -10 : 10);
            return true;
          case 'ArrowLeft':
            seek(rtl ? 10 : -10);
            return true;
          case 'PageUp':
            seek(300);
            return true;
          case 'PageDown':
            seek(-300);
            return true;
          case 'ArrowUp':
            video.volume = Math.min(1, video.volume + 0.05);
            osdNote.textContent = `🔊 ${Math.round(video.volume * 100)}%`;
            flashOsd(1800);
            return true;
          case 'ArrowDown':
            video.volume = Math.max(0, video.volume - 0.05);
            osdNote.textContent = `🔊 ${Math.round(video.volume * 100)}%`;
            flashOsd(1800);
            return true;
          case 'm':
          case 'M':
            video.muted = !video.muted;
            osdNote.textContent = video.muted ? '🔇' : '🔊';
            flashOsd(1800);
            return true;
          case 'Escape':
          case 'Backspace':
            leave();
            return true;
          default:
            flashOsd();
            return false;
        }
      },
      destroy() {
        disposed = true;
        clearTimeout(osdTimer);
        if (hls) {
          hls.destroy();
          hls = null;
        }
        video.pause();
        video.removeAttribute('src');
        video.load();
        CH.ui.mode('browse');
        lights('up');
      },
    };
  }

  CH.views = CH.views || {};
  CH.views.player = { id: 'player', mount, chrome: false };
})((window.CH = window.CH || {}));
