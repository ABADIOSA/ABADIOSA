/* Trailer playback.
 *
 * The embedded player will not run without a real page origin — from a file://
 * page it answers "Error 153, video player configuration error" and shows
 * nothing. The app is served over loopback for exactly that reason, and this
 * helper adds the other half: a trailer that cannot play must never leave the
 * lobby staring at a dead frame. It listens to the player over postMessage (no
 * extra script needed) and reports failure and end-of-video, so the reel moves
 * on by itself.
 */
(function (CH) {
  'use strict';

  const HOST = 'https://www.youtube-nocookie.com';
  // If the player has not said a word by then, treat it as unplayable.
  const SILENCE_MS = 9000;

  function embedUrl(videoId, { muted = true, controls = false } = {}) {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: muted ? '1' : '0',
      controls: controls ? '1' : '0',
      modestbranding: '1',
      rel: '0',
      playsinline: '1',
      iv_load_policy: '3',
      fs: '0',
      disablekb: '1',
      enablejsapi: '1',
      origin: window.location.origin,
    });
    return `${HOST}/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
  }

  /**
   * Put a trailer in `container`.
   * @returns {{destroy: Function}} destroy unloads the frame, which is the only
   *   reliable way to stop playback.
   */
  function play(container, videoId, { muted = true, onError, onEnded, onReady } = {}) {
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl(videoId, { muted });
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('frameborder', '0');
    Object.assign(iframe.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0' });

    let done = false;
    let heard = false;
    let silenceTimer = null;

    const finish = (reason, detail) => {
      if (done) return;
      done = true;
      clearTimeout(silenceTimer);
      window.removeEventListener('message', onMessage);
      if (reason === 'error' && typeof onError === 'function') onError(detail);
      if (reason === 'ended' && typeof onEnded === 'function') onEnded();
    };

    function onMessage(event) {
      if (!/youtube(-nocookie)?\.com$/.test(new URL(event.origin).hostname.replace(/^www\./, ''))) return;
      if (event.source !== iframe.contentWindow) return;

      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== 'object') return;

      heard = true;
      if (data.event === 'onReady' && typeof onReady === 'function') onReady();
      // 2/5/100/101/150 = bad id, not embeddable, removed, blocked.
      if (data.event === 'onError') finish('error', data.info);
      // Player state 0 is ENDED.
      if (data.event === 'onStateChange' && (data.info === 0 || (data.info && data.info.playerState === 0))) {
        finish('ended');
      }
      if (data.event === 'infoDelivery' && data.info && data.info.playerState === 0) finish('ended');
    }

    window.addEventListener('message', onMessage);

    iframe.addEventListener('load', () => {
      // Subscribing is what makes the player start reporting back to us.
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), HOST);
      } catch {
        /* the frame is cross-origin; the listener above still receives events */
      }
    });

    iframe.addEventListener('error', () => finish('error', 'iframe failed to load'));

    silenceTimer = setTimeout(() => {
      if (!heard) finish('error', 'player never responded');
    }, SILENCE_MS);

    container.appendChild(iframe);

    return {
      destroy() {
        done = true;
        clearTimeout(silenceTimer);
        window.removeEventListener('message', onMessage);
        iframe.remove();
      },
    };
  }

  CH.youtube = { play, embedUrl, HOST, SILENCE_MS };
})((window.CH = window.CH || {}));
