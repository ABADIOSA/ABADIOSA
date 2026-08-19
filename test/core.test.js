'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const addons = require('../src/core/addons');
const program = require('../src/core/program');
const server = require('../src/core/server');
const { demoCatalog } = require('../src/core/demo');
const { Store, merge } = require('../src/core/store');

/* ------------------------------------------------------- addon protocol */

test('resourceUrl follows the add-on routing rules', () => {
  assert.equal(
    addons.resourceUrl('https://v3-cinemeta.strem.io/manifest.json', 'catalog', 'movie', 'top'),
    'https://v3-cinemeta.strem.io/catalog/movie/top.json'
  );
  assert.equal(
    addons.resourceUrl('https://x.io/', 'catalog', 'movie', 'top', { skip: 100, genre: 'Action' }),
    'https://x.io/catalog/movie/top/skip=100&genre=Action.json'
  );
  // Series ids carry colons and must be percent-encoded.
  assert.equal(addons.resourceUrl('https://x.io', 'stream', 'series', 'tt1:2:3'), 'https://x.io/stream/series/tt1%3A2%3A3.json');
  // Empty extras must not produce a stray path segment.
  assert.equal(addons.resourceUrl('https://x.io', 'meta', 'movie', 'tt1', { search: '' }), 'https://x.io/meta/movie/tt1.json');
});

test('baseUrlOf strips the manifest suffix and any query', () => {
  assert.equal(addons.baseUrlOf('https://x.io/abc/manifest.json'), 'https://x.io/abc');
  assert.equal(addons.baseUrlOf('https://x.io/abc/manifest.json?v=2'), 'https://x.io/abc');
  assert.equal(addons.baseUrlOf('https://x.io/abc/'), 'https://x.io/abc');
});

test('supports() honours types and idPrefixes, in both resource shapes', () => {
  const stringForm = { types: ['movie'], idPrefixes: ['tt'], resources: ['catalog', 'meta'] };
  assert.equal(addons.supports(stringForm, 'meta', 'movie', 'tt123'), true);
  assert.equal(addons.supports(stringForm, 'meta', 'movie', 'kitsu:1'), false);
  assert.equal(addons.supports(stringForm, 'meta', 'series', 'tt123'), false);
  assert.equal(addons.supports(stringForm, 'stream', 'movie', 'tt123'), false);

  const objectForm = { types: ['movie'], resources: [{ name: 'stream', types: ['series'], idPrefixes: ['kitsu:'] }] };
  assert.equal(addons.supports(objectForm, 'stream', 'series', 'kitsu:9'), true);
  assert.equal(addons.supports(objectForm, 'stream', 'series', 'tt9'), false);
});

test('catalog extras are read from both v3 shapes', () => {
  assert.equal(addons.isSearchable({ extra: [{ name: 'search', isRequired: true }] }), true);
  assert.equal(addons.isSearchable({ extraSupported: ['search'] }), true);
  // A catalog requiring `search` cannot be browsed as a plain row.
  assert.equal(addons.isBrowsable({ extra: [{ name: 'search', isRequired: true }] }), false);
  assert.equal(addons.isBrowsable({ extra: [{ name: 'skip' }, { name: 'genre', isRequired: true }] }), true);
});

test('normaliseMeta merges both trailer shapes and derives the year', () => {
  const meta = addons.normaliseMeta(
    {
      id: 'tt1',
      name: 'A',
      releaseInfo: '2021–2024',
      trailerStreams: [{ ytId: 'aaa', title: 'Main' }],
      trailers: [{ source: 'aaa', type: 'Trailer' }, { source: 'bbb', type: 'Trailer' }],
    },
    'movie'
  );
  assert.equal(meta.year, 2021);
  assert.deepEqual(meta.trailers.map((t) => t.ytId), ['aaa', 'bbb']);
});

test('AddonClient fans out over catalogs, metas and streams', async () => {
  const manifest = {
    id: 'test',
    name: 'Test',
    types: ['movie'],
    idPrefixes: ['tt'],
    resources: ['catalog', 'meta', 'stream'],
    catalogs: [
      { type: 'movie', id: 'top', name: 'Popular' },
      { type: 'movie', id: 'search', name: 'Search', extra: [{ name: 'search', isRequired: true }] },
    ],
  };
  const routes = {
    'https://a.io/manifest.json': manifest,
    'https://a.io/catalog/movie/top.json': { metas: [{ id: 'tt1', name: 'One', type: 'movie' }] },
    'https://a.io/meta/movie/tt1.json': { meta: { id: 'tt1', name: 'One', description: 'full' } },
    'https://a.io/stream/movie/tt1.json': { streams: [{ url: 'https://s/1.mp4', name: '1080p' }] },
  };
  const client = new addons.AddonClient({ fetchJson: async (url) => {
    if (!(url in routes)) throw new Error(`404 ${url}`);
    return routes[url];
  } });

  const { ok, failed } = await client.setAddons(['https://a.io/manifest.json']);
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 0);

  // Only the browsable catalog is offered as a row.
  const catalogs = client.catalogs('movie');
  assert.equal(catalogs.length, 1);
  assert.equal(catalogs[0].id, 'top');

  assert.equal((await client.getCatalog(catalogs[0]))[0].name, 'One');
  assert.equal((await client.getMeta('movie', 'tt1')).description, 'full');

  const streams = await client.getStreams('movie', 'tt1');
  assert.equal(streams[0].addonName, 'Test');
});

test('a broken add-on is reported, not fatal', async () => {
  const client = new addons.AddonClient({
    fetchJson: async (url) => {
      if (url.includes('good')) return { id: 'g', name: 'Good', types: ['movie'], resources: ['catalog'], catalogs: [] };
      throw new Error('boom');
    },
  });
  const { ok, failed } = await client.setAddons(['https://good.io/manifest.json', 'https://bad.io/manifest.json']);
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0].error, /boom/);
});

/* ------------------------------------------------------------ programme */

test('splitProgram sorts by release date, then by year', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const { nowShowing, comingSoon } = program.splitProgram(
    [
      { id: 'a', released: '2026-01-01' },
      { id: 'b', released: '2026-12-01' },
      { id: 'c', year: 2028 },
      { id: 'd' },
      { id: null },
    ],
    now
  );
  assert.deepEqual(nowShowing.map((m) => m.id), ['a', 'd']);
  assert.deepEqual(comingSoon.map((m) => m.id), ['b', 'c']);
});

test('runtimeMinutes reads every runtime spelling add-ons use', () => {
  assert.equal(program.runtimeMinutes({ runtime: '2h 8min' }), 128);
  assert.equal(program.runtimeMinutes({ runtime: '96 min' }), 96);
  assert.equal(program.runtimeMinutes({ runtime: '1 h' }), 60);
  assert.equal(program.runtimeMinutes({ runtime: '' }), 0);
  assert.equal(program.runtimeMinutes({}), 0);
});

test('the schedule is deterministic and stays inside the trading day', () => {
  const now = new Date('2026-06-15T12:00:00');
  const metas = [{ id: 'tt1', runtime: '2h' }, { id: 'tt2', runtime: '1h 30min' }];
  const first = program.buildSchedule(metas, { now });
  const second = program.buildSchedule(metas, { now });

  assert.deepEqual(
    first.map((s) => s.showtimes.map((d) => d.toISOString())),
    second.map((s) => s.showtimes.map((d) => d.toISOString())),
    'same input must always produce the same board'
  );

  const last = program.parseClock(program.DEFAULT_SCHEDULE.lastShow);
  for (const session of first) {
    assert.ok(session.showtimes.length > 0);
    for (const t of session.showtimes) {
      assert.ok(t.getHours() * 60 + t.getMinutes() <= last, 'no show may start after the last slot');
    }
  }
});

test('nextShowtime rolls over to tomorrow once the day is done', () => {
  const now = new Date('2026-06-15T12:00:00');
  const [session] = program.buildSchedule([{ id: 'tt1' }], { now });
  const midday = program.nextShowtime(session, new Date('2026-06-15T12:00:00'));
  assert.ok(midday > new Date('2026-06-15T12:00:00'));

  const afterClose = program.nextShowtime(session, new Date('2026-06-15T23:59:00'));
  assert.equal(afterClose.getDate(), 16);
});

test('buildReel leads with coming-soon titles and only includes trailers', () => {
  const withTrailer = (id) => ({ id, trailers: [{ ytId: id }] });
  const reel = program.buildReel({
    comingSoon: [withTrailer('s1'), withTrailer('s2'), { id: 's3' }],
    nowShowing: [withTrailer('n1'), { id: 'n2' }],
    limit: 5,
  });
  assert.ok(reel.every((e) => e.meta.trailers && e.meta.trailers.length), 'no trailer, no slot');
  assert.equal(reel[0].kind, 'coming-soon');
});

/* --------------------------------------------------------------- server */

test('resolveStream classifies each add-on stream shape', async () => {
  assert.deepEqual(await server.resolveStream({ url: 'https://a/b.mp4' }), { kind: 'direct', url: 'https://a/b.mp4' });
  assert.equal((await server.resolveStream({ ytId: 'abc' })).kind, 'youtube');
  assert.equal((await server.resolveStream({ externalUrl: 'https://a' })).kind, 'external');
  assert.equal((await server.resolveStream({})).kind, 'unsupported');
});

test('a torrent without a streaming server reports what is missing', async () => {
  const result = await server.resolveStream(
    { infoHash: 'abc', fileIdx: 1 },
    { serverUrl: 'http://127.0.0.1:1', fetchImpl: async () => { throw new Error('refused'); } }
  );
  assert.equal(result.needsServer, true);
  assert.match(result.reason, /127\.0\.0\.1:1/);
});

test('a torrent with a live server becomes a plain HTTP url', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    if (url.endsWith('/settings')) return { ok: true, json: async () => ({ values: {} }) };
    return { ok: true, json: async () => ({}) };
  };
  const result = await server.resolveStream(
    { infoHash: 'deadbeef', fileIdx: 2, sources: ['tracker:udp://t/announce'] },
    { serverUrl: 'http://127.0.0.1:11470', fetchImpl }
  );
  assert.equal(result.url, 'http://127.0.0.1:11470/deadbeef/2');
  assert.ok(calls.some((u) => u.endsWith('/deadbeef/create')), 'the torrent must be created before streaming');
});

test('peerSources keeps the add-on trackers and adds DHT', () => {
  const sources = server.peerSources({ infoHash: 'abc', sources: ['tracker:udp://custom/announce'] });
  assert.ok(sources.includes('tracker:udp://custom/announce'));
  assert.ok(sources.includes('dht:abc'));
  assert.equal(new Set(sources).size, sources.length, 'no duplicates');
});

/* ----------------------------------------------------------------- misc */

test('every demo poster is a well-formed SVG data URI', () => {
  const catalog = demoCatalog();
  assert.ok(catalog.length >= 12);
  for (const meta of catalog) {
    for (const art of [meta.poster, meta.background]) {
      assert.ok(art.startsWith('data:image/svg+xml'), `${meta.name} art is not an SVG data uri`);
      const svg = decodeURIComponent(art.replace('data:image/svg+xml;charset=utf-8,', ''));
      // A raw & (as in "Salt & Cedar") makes the SVG unparseable and the poster blank.
      assert.ok(!/&(?!amp;|lt;|gt;|apos;|quot;|#)/.test(svg), `${meta.name} has an unescaped ampersand`);
    }
  }
});

test('the demo house has both a current programme and future titles', () => {
  const { nowShowing, comingSoon } = program.splitProgram(demoCatalog(), new Date());
  assert.ok(nowShowing.length >= 6);
  assert.ok(comingSoon.length >= 4);
});

test('store merges nested patches without dropping siblings', () => {
  const target = { schedule: { screens: 8, firstShow: '11:30' }, kiosk: true };
  merge(target, { schedule: { screens: 12 } });
  assert.deepEqual(target, { schedule: { screens: 12, firstShow: '11:30' }, kiosk: true });
});

test('store round-trips through disk and falls back to defaults', () => {
  const file = require('node:path').join(require('node:os').tmpdir(), `cinema-test-${Date.now()}.json`);
  const store = new Store(file);
  store.set({ language: 'en', schedule: { screens: 12 } });

  const reopened = new Store(file);
  assert.equal(reopened.get('language'), 'en');
  assert.equal(reopened.get('schedule').screens, 12);
  assert.equal(reopened.get('schedule').firstShow, '11:30', 'defaults fill the gaps');

  require('node:fs').unlinkSync(file);
  const missing = new Store(file);
  assert.equal(missing.get('language'), 'ar', 'a missing file means defaults, not a crash');
});
