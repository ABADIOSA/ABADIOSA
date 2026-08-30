// خادم Harbor وهمي: يحاكي web_server.rs + بروتوكول الريموت
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = 11471;
export const received = [];

const snapshot = {
  proto: 1,
  idle: false,
  mediaId: 'tt0903747',
  mediaTitle: 'Breaking Bad',
  posterUrl: null,
  episode: { season: 2, episode: 4, name: 'Down' },
  source: { label: 'BreakingBad.S02E04.1080p', resolution: '1080p', quality: 'BluRay', releaseGroup: 'NTb' },
  positionSec: 615,
  durationSec: 2820,
  playing: true,
  volume: 0.8,
  muted: false,
  target: { kind: 'local', label: 'This PC' },
  castDevices: [
    { id: 'cc-1', name: 'Living Room TV', kind: 'chromecast', host: '192.168.1.20', port: 8009 },
    // اسم فيه وسوم HTML للتأكد من التهريب
    { id: 'dlna-1', name: '<img src=x onerror=alert(1)>Bedroom', kind: 'dlna', host: '192.168.1.21', port: 1900 },
  ],
  castDiscovering: false,
  hasPrevEpisode: true,
  hasNextEpisode: true,
  subtitlesOn: false,
  canToggleSubtitles: true,
  textEntry: null,
  updatedAt: Date.now(),
};

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body>mock harbor</body></html>');
});

const wss = new WebSocketServer({ server, path: '/api/remote' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ t: 'hello', proto: 1, server: 'harbor-remote' }));
  ws.send(JSON.stringify({ t: 'snapshot', snapshot }));
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    received.push(msg);
    if (msg.t === 'hello') {
      ws.send(JSON.stringify({ t: 'hello', proto: 1, server: 'harbor-remote' }));
      ws.send(JSON.stringify({ t: 'snapshot', snapshot }));
      return;
    }
    if (msg.t === 'cmd') {
      const c = msg.command;
      if (c.action === 'ping') { ws.send(JSON.stringify({ t: 'pong', at: Date.now() })); return; }
      if (c.action === 'pause') snapshot.playing = false;
      if (c.action === 'play') snapshot.playing = true;
      if (c.action === 'seek') snapshot.positionSec = c.positionSec;
      if (c.action === 'setMuted') snapshot.muted = c.muted;
      if (c.action === 'setVolume') snapshot.volume = c.volume;
      if (c.action === 'toggleSubtitles') snapshot.subtitlesOn = !snapshot.subtitlesOn;
      if (c.action === 'nextEpisode') snapshot.episode = { season: 2, episode: 5, name: 'Breakage' };
      if (c.action === 'setTarget') {
        if (c.target === 'local') {
          snapshot.target = { kind: 'local', label: 'This PC' };
        } else {
          const dev = snapshot.castDevices.find((d) => d.id === c.target.castDeviceId);
          snapshot.target = { kind: 'cast', deviceId: c.target.castDeviceId, label: dev?.name ?? '?', castKind: dev?.kind ?? 'dlna' };
        }
      }
      if (c.action === 'castStop') snapshot.target = { kind: 'local', label: 'This PC' };
      // يحاكي تركيز Harbor داخل حقل نصّي (بحث مثلاً)
      if (c.action === 'openSearch') snapshot.textEntry = { value: '', placeholder: 'Search Harbor' };
      if (c.action === 'setText') snapshot.textEntry = { value: c.value, placeholder: 'Search Harbor' };
      if (c.action === 'submitText' || c.action === 'blurText') snapshot.textEntry = null;
      snapshot.updatedAt = Date.now();
      ws.send(JSON.stringify({ t: 'snapshot', snapshot }));
    }
  });
});

export function start() {
  return new Promise((r) => server.listen(PORT, '127.0.0.1', r));
}
export function stop() {
  wss.close();
  server.close();
}
