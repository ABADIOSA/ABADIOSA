'use strict';
/**
 * Bridge to a Stremio streaming server (the local service that turns a torrent
 * into a plain HTTP stream the <video> element can play).
 *
 * Direct HTTP/HLS streams — the kind debrid and hoster add-ons return — play
 * with no server at all. Torrent streams need one running on 11470.
 */

const DEFAULT_URL = 'http://127.0.0.1:11470';

const DEFAULT_TRACKERS = [
  'tracker:udp://tracker.opentrackr.org:1337/announce',
  'tracker:udp://open.demonii.com:1337/announce',
  'tracker:udp://tracker.torrent.eu.org:451/announce',
  'tracker:udp://exodus.desync.com:6969/announce',
  'tracker:udp://tracker.openbittorrent.com:6969/announce',
];

function normaliseServerUrl(url) {
  return String(url || DEFAULT_URL).replace(/\/+$/, '');
}

/** Is a streaming server answering? Resolves to its settings, or null. */
async function probe(serverUrl = DEFAULT_URL, { timeout = 3000, fetchImpl = fetch } = {}) {
  const base = normaliseServerUrl(serverUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeout);
  try {
    const res = await fetchImpl(`${base}/settings`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Peer sources for a torrent: whatever the add-on gave us, plus sane defaults. */
function peerSources(stream) {
  const fromAddon = (stream.sources || []).filter((s) => typeof s === 'string');
  const dht = stream.infoHash ? [`dht:${stream.infoHash}`] : [];
  return Array.from(new Set([...fromAddon, ...DEFAULT_TRACKERS, ...dht]));
}

/** Ask the server to start (or re-attach to) a torrent before we stream it. */
async function createTorrent(stream, serverUrl = DEFAULT_URL, { fetchImpl = fetch, timeout = 15000 } = {}) {
  const base = normaliseServerUrl(serverUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeout);
  try {
    const res = await fetchImpl(`${base}/${stream.infoHash}/create`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        torrent: {
          infoHash: stream.infoHash,
          peerSearch: { sources: peerSources(stream), min: 40, max: 150 },
        },
        guessFileIdx: stream.fileIdx == null ? { name: stream.title || stream.name || '' } : undefined,
      }),
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classify an add-on stream and produce something playable.
 * @returns {Promise<{kind:'direct'|'torrent'|'youtube'|'external'|'unsupported', url?:string, needsServer?:boolean, reason?:string}>}
 */
async function resolveStream(stream, opts = {}) {
  const serverUrl = normaliseServerUrl(opts.serverUrl || DEFAULT_URL);
  if (!stream) return { kind: 'unsupported', reason: 'empty stream' };

  if (stream.url) return { kind: 'direct', url: stream.url };

  if (stream.ytId) return { kind: 'youtube', url: `https://www.youtube.com/watch?v=${stream.ytId}` };

  if (stream.infoHash) {
    const settings = await probe(serverUrl, opts);
    if (!settings) {
      return {
        kind: 'torrent',
        needsServer: true,
        reason: `no streaming server on ${serverUrl}`,
      };
    }
    await createTorrent(stream, serverUrl, opts);
    const fileIdx = stream.fileIdx == null ? 0 : stream.fileIdx;
    return { kind: 'torrent', url: `${serverUrl}/${stream.infoHash}/${fileIdx}` };
  }

  if (stream.externalUrl) return { kind: 'external', url: stream.externalUrl };

  return { kind: 'unsupported', reason: 'stream has no url, infoHash or ytId' };
}

/** Transcoding fallback for containers the WebView can't decode (e.g. MKV/HEVC). */
function transcodeUrl(mediaUrl, serverUrl = DEFAULT_URL) {
  const base = normaliseServerUrl(serverUrl);
  return `${base}/hlsv2/${encodeURIComponent(hashId(mediaUrl))}/master.m3u8?mediaURL=${encodeURIComponent(mediaUrl)}`;
}

function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

module.exports = {
  DEFAULT_URL,
  DEFAULT_TRACKERS,
  normaliseServerUrl,
  probe,
  peerSources,
  createTorrent,
  resolveStream,
  transcodeUrl,
};
