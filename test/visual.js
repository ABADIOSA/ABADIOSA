/* Renders the real renderer in Chromium with a stubbed main-process bridge and
 * captures each screen. Verifies the auditorium actually paints — layout,
 * navigation, the attract loop and the pre-show — without needing Electron.
 *
 *   node test/visual.js
 */
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');

const staticServer = require('../src/main/static-server');
const { demoCatalog } = require('../src/core/demo');
const program = require('../src/core/program');
const { DEFAULTS } = require('../src/core/store');
const { serialiseSession } = require('../src/main/programme');

// `node test/visual.js --docs` writes smaller stills into docs/screens instead.
const DOCS = process.argv.includes('--docs');
require('fs').mkdirSync(DOCS ? path.join(__dirname, '..', 'docs', 'screens') : path.join(__dirname, 'shots'), { recursive: true });
const OUT = DOCS ? path.join(__dirname, '..', 'docs', 'screens') : path.join(__dirname, 'shots');
const VIEWPORT = DOCS ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };

function buildProgramme(now) {
  const metas = demoCatalog();
  const { nowShowing, comingSoon } = program.splitProgram(metas, now);
  const schedule = program.buildSchedule(nowShowing, { now, schedule: DEFAULTS.schedule });
  return {
    generatedAt: now.toISOString(),
    usingDemo: true,
    addonCount: 0,
    nowShowing: schedule.map(serialiseSession),
    comingSoon: comingSoon.map((meta) => ({ meta, certification: program.certificationOf(meta), runtime: program.runtimeMinutes(meta), opensOn: meta.released })),
    reel: program.buildReel({ comingSoon, nowShowing, limit: 12 }),
  };
}

const failures = [];
function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ok  ${message}`);
  } else {
    failures.push(`${message} (got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)})`);
    console.error(`  FAIL ${message} — got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  const now = new Date();
  const programme = buildProgramme(now);
  const config = { ...DEFAULTS, hideCursor: false };

  // Serve the renderer exactly as the app does, over loopback — a file:// page
  // has a null origin, which is what broke YouTube embeds in the first place.
  const site = await staticServer.serve(path.join(__dirname, '..', 'src', 'renderer'));
  const PAGE = `${site.url}/index.html`;

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  await page.addInitScript(
    ({ programme, config }) => {
      let cinemaHandler = null;
      const streams = [
        { name: 'Demo · Direct', title: '1080p WEB-DL · 4.2 GB', url: 'https://example.invalid/feature.mp4', addonName: 'Demo Source' },
        { name: 'Demo · Torrent', title: '2160p BluRay HDR · 18 GB', infoHash: 'a'.repeat(40), fileIdx: 0, addonName: 'Demo Source' },
      ];
      window.cinema = {
        config: {
          get: async () => JSON.parse(JSON.stringify(config)),
          set: async (patch) => Object.assign(config, patch),
          reset: async () => config,
        },
        programme: { load: async () => programme },
        addons: { refresh: async () => ({ count: 0 }), list: async () => [], add: async () => ({ name: 'x' }), remove: async () => [] },
        catalog: { meta: async () => null, streams: async () => streams, search: async () => programme.comingSoon.map((c) => c.meta) },
        playback: {
          resolve: async () => ({ kind: 'direct', url: 'https://example.invalid/feature.mp4' }),
          serverStatus: async () => ({ url: 'http://127.0.0.1:11470', online: false }),
        },
        player: {
          // window.__mpv decides which engine the harness pretends to have.
          status: async () => ({
            preference: 'auto',
            engine: window.__mpv ? 'mpv' : 'builtin',
            mpv: window.__mpv ? { available: true, binary: '/usr/bin/mpv', version: '0.37.0' } : { available: false },
            install: 'winget install mpv',
            playing: false,
          }),
          play: async ({ url }) =>
            window.__mpv ? { engine: 'mpv', version: '0.37.0' } : { engine: 'builtin', url },
          command: async () => null,
          stop: async () => true,
          install: async () => ({ ok: false, command: 'winget install mpv' }),
        },
        update: {
          status: async () => ({ phase: 'idle', supported: true, version: '1.1.0' }),
          check: async () => ({ phase: 'current', supported: true, version: '1.1.0' }),
          install: async () => true,
        },
        account: { login: async () => ({ addons: 0 }), logout: async () => true },
        app: {
          quit: async () => {},
          cinemaMode: async (mode) => ({ mode: mode || 'auto', cinema: window.__tv, tv: window.__tv }),
          tvStatus: async () => ({
            tv: window.__tv,
            cinema: window.__tv,
            mode: 'auto',
            display: { id: 2, label: 'LG TV', width: 3840, height: 2160, external: true },
            externals: [],
          }),
          displays: async () => [
            { index: 0, label: 'Built-in', primary: true, width: 1920, height: 1080 },
            { index: 1, label: 'LG TV', primary: false, width: 3840, height: 2160 },
          ],
          useDisplay: async () => null,
          keepAwake: async () => true,
          openExternal: async () => {},
          version: async () => ({ app: '1.0.0', electron: '43.0.0', platform: 'linux' }),
        },
        on: (channel, handler) => {
          if (channel === 'ui:command') cinemaHandler = handler;
          return () => {
            cinemaHandler = null;
          };
        },
      };

      // Lets the harness act as the projection booth: report from the projector.
      window.__emit = (payload) => cinemaHandler && cinemaHandler(payload);

      // Lets the harness act as the projection booth: plug a TV in or pull it out.
      window.__setTv = (on) => {
        window.__tv = on;
        if (cinemaHandler) cinemaHandler({ type: 'cinema-mode', cinema: on, tv: on, announce: true, display: { label: 'LG TV' } });
      };
    },
    { programme, config }
  );

  // Start with a television attached: the show should open on the lobby loop.
  await page.addInitScript(() => {
    window.__tv = true;
    window.__mpv = false; // the built-in player, until the mpv pass below
  });

  await page.goto(PAGE);
  await page.waitForFunction(() => window.CH && window.CH.app && window.CH.app.booted, null, { timeout: 15000 });
  assertEqual(await page.evaluate(() => window.location.protocol), 'http:', 'renderer must be served over http, not file://');

  // The embed must carry a real origin — this is precisely what "Error 153" was.
  const embed = await page.evaluate(() => window.CH.youtube.embedUrl('dQw4w9WgXcQ', { muted: true }));
  assertEqual(embed.includes(`origin=${encodeURIComponent(site.url)}`), true, 'trailer embed must declare the page origin');
  assertEqual(embed.includes('enablejsapi=1'), true, 'trailer embed must report back so failures can be detected');

  const KEEP_FOR_DOCS = new Set(['01-attract-board', '02-attract-hero', '05-home', '07-details', '09-preshow-bumper', '12-preshow-leader', '13-settings-ar', '19-settings-player']);
  const shot = async (name) => {
    if (DOCS && !KEEP_FOR_DOCS.has(name)) return;
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('  captured', name);
  };
  const activeView = () => page.evaluate(() => window.CH.app.current && window.CH.app.current.id);

  console.log('view after boot:', await activeView());
  await page.waitForTimeout(1400);
  await shot('01-attract-board');

  // Scrub the reel: hero card, then a coming-soon slide, then a house notice.
  for (const name of ['02-attract-hero', '03-attract-coming', '04-attract-notice']) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1300);
    await shot(name);
  }

  // Any other key leaves the lobby.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  console.log('view after keypress:', await activeView());
  await shot('05-home');

  // D-pad down into the rail, then open a title.
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  await shot('06-home-focus');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  console.log('view after select:', await activeView());
  await shot('07-details');

  // Start the show -> source picker.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  console.log('view after play:', await activeView());
  await shot('08-streams');

  // Pick a source -> pre-show ceremony.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3200); // curtain up, then the first house notice
  console.log('view after source:', await activeView());
  await shot('09-preshow-bumper');

  await page.keyboard.press('ArrowRight'); // skip to the next beat
  await page.waitForTimeout(1200);
  await shot('10-preshow-bumper2');

  // Skip forward through the remaining beats to the title card + leader.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(900);
  }
  await shot('11-preshow-titlecard');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1200);
  await shot('12-preshow-leader');

  // Settings, in both languages. Reached from the foyer so no in-flight
  // playback error can navigate out from under us.
  await page.evaluate(() => window.CH.app.go('home', {}, { reset: true }));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.CH.app.go('settings', {}, { reset: true }));
  await page.waitForTimeout(1200);
  await shot('13-settings-ar');
  await page.evaluate(() => {
    window.CH.i18n.set('en');
    window.CH.app.go('settings', { tab: 'show' }, { reset: true });
  });
  await page.waitForTimeout(900);
  await shot('14-settings-en');

  await page.evaluate(() => window.CH.app.go('search', {}, { reset: true }));
  await page.waitForTimeout(800);
  await shot('15-search');

  await page.evaluate(() => {
    window.CH.i18n.set('ar');
    window.CH.app.go('settings', { tab: 'player' }, { reset: true });
  });
  await page.waitForTimeout(1100);
  await shot('19-settings-player');

  /* ---- the point of the app: the TV drives the mode, not a menu ---- */

  await page.evaluate(() => window.CH.app.go('home', {}, { reset: true }));
  await page.waitForTimeout(600);

  await page.evaluate(() => window.__setTv(false));
  await page.waitForTimeout(900);
  assertEqual(await activeView(), 'home', 'unplugging the TV must leave the lobby loop');
  assertEqual(await page.evaluate(() => window.CH.app.cinema), false, 'cinema mode must be off with no TV');
  await shot('16-tv-unplugged');

  await page.evaluate(() => window.__setTv(true));
  await page.waitForTimeout(1200);
  assertEqual(await activeView(), 'attract', 'connecting a TV must start the lobby loop by itself');
  assertEqual(await page.evaluate(() => window.CH.app.cinema), true, 'cinema mode must be on with a TV');
  await shot('17-tv-connected');

  // A show already under way must survive a cable being touched. The pre-show
  // runs on timers alone, so it exercises the guard without needing real media.
  await page.evaluate(() =>
    window.CH.app.go(
      'preshow',
      { meta: { name: 'Test Feature', id: 'x', type: 'movie', trailers: [] }, stream: { url: 'about:blank' } },
      { reset: true }
    )
  );
  await page.waitForTimeout(1500);
  assertEqual(await activeView(), 'preshow', 'the pre-show should be running');
  await page.evaluate(() => window.__setTv(false));
  await page.waitForTimeout(1000);
  assertEqual(await activeView(), 'preshow', 'a show under way must not be interrupted by a display change');

  /* ---- the projector: mpv takes the film, and hands the room back ---- */

  await page.evaluate(() => {
    window.__mpv = true;
    window.CH.app.go(
      'player',
      { meta: { name: 'Iron Harvest Road', id: 'x', type: 'movie' }, stream: { url: 'https://example.invalid/f.mkv' } },
      { reset: true }
    );
  });
  await page.waitForTimeout(1200);
  assertEqual(await activeView(), 'player', 'the player view stays up while mpv owns the screen');
  assertEqual(
    await page.evaluate(() => !!document.querySelector('.view[data-view="player"] .title-card__name')),
    true,
    'a handoff card is painted behind mpv so nothing flashes when it closes'
  );
  await shot('18-mpv-handoff');

  // Progress from the other process must reach the on-screen display.
  await page.evaluate(() =>
    window.__emit({ type: 'playback', state: 'progress', engine: 'mpv', position: 300, duration: 1200, paused: false })
  );
  await page.waitForTimeout(300);
  assertEqual(
    await page.evaluate(() => document.querySelector('.view[data-view="player"] .osd__fill').style.width),
    '25%',
    'mpv progress drives the on-screen display'
  );

  // When mpv closes on its own, the room goes back to the lobby.
  await page.evaluate(() => window.__emit({ type: 'playback', state: 'ended', engine: 'mpv', code: 0 }));
  await page.waitForTimeout(6000);
  assertEqual(await activeView(), 'attract', 'the end of the film returns the room to the lobby');

  await browser.close();
  await site.close();

  if (errors.length) {
    console.error('\nPAGE ERRORS:');
    errors.forEach((e) => console.error(' -', e));
  } else {
    console.log('\nno page errors');
  }
  if (failures.length) {
    console.error('\nASSERTION FAILURES:');
    failures.forEach((f) => console.error(' -', f));
  }
  if (errors.length || failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
