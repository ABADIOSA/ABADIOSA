/* Renders the real renderer in Chromium with a stubbed main-process bridge and
 * captures each screen. Verifies the auditorium actually paints — layout,
 * navigation, the attract loop and the pre-show — without needing Electron.
 *
 *   node test/visual.js
 */
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');

const { demoCatalog } = require('../src/core/demo');
const program = require('../src/core/program');
const { DEFAULTS } = require('../src/core/store');
const { serialiseSession } = require('../src/main/programme');

// `node test/visual.js --docs` writes smaller stills into docs/screens instead.
const DOCS = process.argv.includes('--docs');
require('fs').mkdirSync(DOCS ? path.join(__dirname, '..', 'docs', 'screens') : path.join(__dirname, 'shots'), { recursive: true });
const OUT = DOCS ? path.join(__dirname, '..', 'docs', 'screens') : path.join(__dirname, 'shots');
const VIEWPORT = DOCS ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };
const PAGE = `file://${path.join(__dirname, '..', 'src', 'renderer', 'index.html')}`;

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

async function main() {
  const now = new Date();
  const programme = buildProgramme(now);
  const config = { ...DEFAULTS, hideCursor: false };

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  await page.addInitScript(
    ({ programme, config }) => {
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
        account: { login: async () => ({ addons: 0 }), logout: async () => true },
        app: {
          quit: async () => {},
          toggleKiosk: async () => true,
          displays: async () => [{ index: 0, label: 'Built-in', primary: true, width: 1920, height: 1080 }, { index: 1, label: 'LG TV', primary: false, width: 3840, height: 2160 }],
          useDisplay: async () => null,
          keepAwake: async () => true,
          openExternal: async () => {},
          version: async () => ({ app: '1.0.0', electron: '43.0.0', platform: 'linux' }),
        },
        on: () => () => {},
      };
    },
    { programme, config }
  );

  await page.goto(PAGE);
  await page.waitForFunction(() => window.CH && window.CH.app && window.CH.app.booted, null, { timeout: 15000 });

  const KEEP_FOR_DOCS = new Set(['01-attract-board', '02-attract-hero', '05-home', '07-details', '09-preshow-bumper', '12-preshow-leader', '13-settings-ar']);
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

  await browser.close();

  if (errors.length) {
    console.error('\nPAGE ERRORS:');
    errors.forEach((e) => console.error(' -', e));
    process.exitCode = 1;
  } else {
    console.log('\nno page errors');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
