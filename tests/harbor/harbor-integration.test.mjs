// اختبار تكامل StremioHub × Harbor من طرف إلى طرف.
// يحمّل الإضافة في Chromium حقيقي ويشغّل خادم Harbor وهمياً على المنفذ 11471.
//
//   npm install            (داخل tests/harbor)
//   npx playwright install chromium
//   node harbor-integration.test.mjs
//
// لاستعمال متصفح مثبّت مسبقاً:  CHROME_PATH=/path/to/chrome node harbor-integration.test.mjs

import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mock from './mock-harbor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '../../extension');
const USER_DIR = path.join(os.tmpdir(), 'stremiohub-harbor-test-profile');
fs.rmSync(USER_DIR, { recursive: true, force: true });

await mock.start();
console.log('mock Harbor listening on 127.0.0.1:11471');

const ctx = await chromium.launchPersistentContext(USER_DIR, {
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
});

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
const swErrors = [];
sw.on('console', (m) => { if (m.type() === 'error') swErrors.push('[sw] ' + m.text()); });

const chrome_version = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version;

const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

await page.goto(`chrome-extension://${extId}/popup/popup.html`);
await page.waitForTimeout(1200);

const fail = [];
const check = (name, cond, extra='') => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!cond) fail.push(name); };

console.log('\n== 1. الوحدة الأساسية ==');
const core = await page.evaluate(() => ({
  deepLink: HarborCore.detailDeepLink('series', 'tt0903747', 'tt0903747:1:1'),
  wsUrl: HarborCore.remoteWsUrl({ host: '127.0.0.1', port: 11471 }),
  addonLink: HarborCore.addonInstallLink('https://torrentio.strem.fun/manifest.json'),
  hostNorm: HarborCore.normalizeHost('http://192.168.1.5:11471/remote'),
  portClamp: HarborCore.normalizePort('abc'),
  i18nAr: !!I18N.ar.harbor_intro_title,
  i18nEn: !!I18N.en.harbor_intro_title,
  i18nParity: (() => {
    const ar = Object.keys(I18N.ar).filter(k => k.startsWith('harbor') || k === 'action_harbor' || k === 'open_harbor' || k === 'tab_harbor');
    const en = Object.keys(I18N.en);
    return ar.filter(k => !en.includes(k));
  })(),
  ctrl: typeof Harbor,
}));
check('detailDeepLink', core.deepLink === 'stremio:///detail/series/tt0903747/tt0903747%3A1%3A1', core.deepLink);
check('remoteWsUrl', core.wsUrl === 'ws://127.0.0.1:11471/api/remote', core.wsUrl);
check('addonInstallLink', core.addonLink === 'harbor://torrentio.strem.fun/manifest.json', core.addonLink);
check('normalizeHost(full url)', core.hostNorm === '192.168.1.5', core.hostNorm);
check('normalizePort(invalid)->11471', core.portClamp === 11471, String(core.portClamp));
check('مفاتيح i18n موجودة (ar+en)', core.i18nAr && core.i18nEn);
check('لا مفاتيح Harbor ناقصة في en', core.i18nParity.length === 0, core.i18nParity.join(','));
check('كائن Harbor معرّف', core.ctrl === 'object', core.ctrl);

console.log('\n== 2. تبويب الإعدادات ==');
await page.evaluate(() => { showScreen('settings'); switchSettingsTab('harbor'); });
await page.waitForTimeout(400);
const tab = await page.evaluate(() => ({
  visible: !document.getElementById('settings-tab-harbor').classList.contains('hidden'),
  host: document.getElementById('harbor-host').value,
  port: document.getElementById('harbor-port').value,
  mode: document.getElementById('harbor-open-mode').value,
  enabled: document.getElementById('harbor-enabled').checked,
}));
check('تبويب Harbor يظهر', tab.visible);
check('العنوان الافتراضي 127.0.0.1', tab.host === '127.0.0.1', tab.host);
check('المنفذ الافتراضي 11471', tab.port === '11471', tab.port);
check('الوضع الافتراضي deeplink', tab.mode === 'deeplink', tab.mode);

console.log('\n== 3. اختبار الاتصال (HARBOR_PROBE عبر الـ background) ==');
await page.click('#harbor-test-btn');
await page.waitForTimeout(2500);
const probeRes = await page.evaluate(() => {
  const el = document.getElementById('harbor-test-result');
  return { cls: el.className, text: el.textContent };
});
check('الفحص ينجح مقابل الخادم الوهمي', probeRes.cls.includes('ok'), probeRes.text);

console.log('\n== 4. تفعيل التكامل وحفظ الإعدادات ==');
await page.click('#harbor-enabled + .slider');
await page.waitForTimeout(300);
const saved = await page.evaluate(async () => (await chrome.storage.local.get('harborConfig')).harborConfig);
check('حُفظ enabled=true في التخزين', saved?.enabled === true, JSON.stringify(saved));

console.log('\n== 5. شاشة الريموت + WebSocket ==');
await page.evaluate(() => Harbor.open());
await page.waitForTimeout(1500);
const remote = await page.evaluate(() => ({
  screen: !document.getElementById('screen-harbor').classList.contains('hidden'),
  pill: document.getElementById('harbor-status-pill').className + '|' + document.getElementById('harbor-status-pill').textContent,
  nowVisible: !document.getElementById('harbor-now').classList.contains('hidden'),
  title: document.getElementById('harbor-title').textContent,
  episode: document.getElementById('harbor-episode').textContent,
  source: document.getElementById('harbor-source').textContent,
  pos: document.getElementById('harbor-pos').textContent,
  dur: document.getElementById('harbor-dur').textContent,
  target: document.getElementById('harbor-target').textContent,
  pauseIconShown: !document.getElementById('hb-icon-pause').classList.contains('hidden'),
  volume: document.getElementById('hb-volume').value,
  controlsVisible: !document.getElementById('harbor-control-card').classList.contains('hidden'),
  dot: !document.getElementById('harbor-btn-dot').classList.contains('hidden'),
}));
check('شاشة الريموت ظاهرة', remote.screen);
check('حالة الاتصال online', remote.pill.includes('online'), remote.pill);
check('لوحة "الآن يعمل" ظاهرة', remote.nowVisible);
check('العنوان صحيح', remote.title === 'Breaking Bad', remote.title);
check('الحلقة S2E4', remote.episode === 'S2E4 · Down', remote.episode);
check('مصدر البثّ', remote.source === '1080p · BluRay · NTb', remote.source);
check('الوقت الحالي 10:15', remote.pos === '10:15', remote.pos);
check('المدة 47:00', remote.dur === '47:00', remote.dur);
check('الوجهة = الجهاز', remote.target.length > 0, remote.target);
check('أيقونة الإيقاف تظهر أثناء التشغيل', remote.pauseIconShown);
check('مستوى الصوت 80', remote.volume === '80', remote.volume);
check('بطاقة التحكم ظاهرة', remote.controlsVisible);
check('نقطة الاتصال مضاءة', remote.dot);

console.log('\n== 6. الأوامر تصل إلى Harbor ==');
mock.received.length = 0;
await page.click('#hb-playpause');
await page.waitForTimeout(400);
await page.click('#hb-fwd10');
await page.waitForTimeout(400);
await page.click('#hb-mute');
await page.waitForTimeout(400);
await page.click('#hb-subs');
await page.waitForTimeout(400);
await page.click('#hb-next');
await page.waitForTimeout(400);
await page.click('.hb-nav[data-nav="down"]');
await page.waitForTimeout(400);
const cmds = mock.received.filter(m => m.t === 'cmd').map(m => m.command);
console.log('  أوامر مستلمة:', JSON.stringify(cmds));
check('pause أُرسل', cmds.some(c => c.action === 'pause'));
check('seek +10 (625)', cmds.some(c => c.action === 'seek' && c.positionSec === 625), JSON.stringify(cmds.find(c=>c.action==='seek')));
check('setMuted true', cmds.some(c => c.action === 'setMuted' && c.muted === true));
check('toggleSubtitles', cmds.some(c => c.action === 'toggleSubtitles'));
check('nextEpisode', cmds.some(c => c.action === 'nextEpisode'));
check('nav down', cmds.some(c => c.action === 'nav' && c.key === 'down'));

console.log('\n== 7. الحالة تتحدث بعد الأوامر ==');
const after = await page.evaluate(() => ({
  playIcon: !document.getElementById('hb-icon-play').classList.contains('hidden'),
  muteActive: document.getElementById('hb-mute').classList.contains('active'),
  subsActive: document.getElementById('hb-subs').classList.contains('active'),
}));
check('أيقونة التشغيل تظهر بعد الإيقاف', after.playIcon);
check('زر الكتم نشط', after.muteActive);
check('زر الترجمة نشط', after.subsActive);

console.log('\n== 8. دفع البحث ==');
mock.received.length = 0;
await page.fill('#harbor-search-input', 'Dune Part Two');
await page.click('#harbor-search-btn');
await page.waitForTimeout(1200);
const searchCmds = mock.received.filter(m => m.t === 'cmd').map(m => m.command);
console.log('  تسلسل البحث:', JSON.stringify(searchCmds));
check('openSearch', searchCmds.some(c => c.action === 'openSearch'));
check('setText بالعنوان', searchCmds.some(c => c.action === 'setText' && c.value === 'Dune Part Two'));
check('submitText', searchCmds.some(c => c.action === 'submitText'));

console.log('\n== 9. حالة عدم الاتصال ==');
await page.evaluate(async () => {
  Harbor.disconnect();
  await Harbor.save({ port: 11999 });
  await Harbor.load();
  Harbor.connect();
});
await page.waitForTimeout(2000);
const offline = await page.evaluate(() => ({
  offlineVisible: !document.getElementById('harbor-offline').classList.contains('hidden'),
  pill: document.getElementById('harbor-status-pill').className,
  detail: document.getElementById('harbor-offline-detail').textContent,
}));
check('شاشة "غير متصل" تظهر', offline.offlineVisible);
check('الحالة offline', offline.pill.includes('offline'), offline.pill);
check('تفاصيل العنوان معروضة', offline.detail.includes('11999'), offline.detail);

await page.evaluate(() => Harbor.disconnect());
await page.waitForTimeout(300);

console.log('\n== 10. مُنتقي أجهزة البثّ ==');
await page.evaluate(async () => {
  Harbor.disconnect();
  await Harbor.save({ port: 11471 });
  await Harbor.load();
  Harbor.connect();
});
await page.waitForTimeout(1500);
mock.received.length = 0;
await page.click('#hb-cast-toggle');
await page.waitForTimeout(800);
const castView = await page.evaluate(() => {
  const list = document.getElementById('hb-cast-list');
  return {
    open: !list.classList.contains('hidden'),
    items: [...list.querySelectorAll('[data-cast]')].map(b => b.dataset.cast),
    names: [...list.querySelectorAll('.hb-cast-name')].map(n => n.textContent),
    // التهريب: يجب ألّا يُحقن وسم img من اسم الجهاز
    injected: !!list.querySelector('img'),
    localActive: list.querySelector('[data-cast="local"]').classList.contains('active'),
  };
});
console.log('  الأجهزة:', JSON.stringify(castView.items));
check('قائمة الأجهزة انفتحت', castView.open);
check('castDiscover أُرسل عند أول فتح', mock.received.some(m => m.command?.action === 'castDiscover'));
check('الجهاز المحلي + جهازا بثّ', castView.items.join(',') === 'local,cc-1,dlna-1', castView.items.join(','));
check('لا حقن HTML من اسم الجهاز', !castView.injected);
check('اسم الجهاز الخبيث معروض كنص', castView.names.some(n => n.includes('<img')), JSON.stringify(castView.names));
check('الجهاز المحلي هو النشط', castView.localActive);

mock.received.length = 0;
await page.click('[data-cast="cc-1"]');
await page.waitForTimeout(700);
const afterCast = await page.evaluate(() => ({
  cmd: null,
  label: document.getElementById('hb-cast-label').textContent,
  casting: document.getElementById('hb-cast-toggle').classList.contains('casting'),
  target: document.getElementById('harbor-target').textContent,
  activeId: document.querySelector('.hb-cast-item.active')?.dataset.cast,
}));
const setTargetCmd = mock.received.map(m => m.command).find(c => c?.action === 'setTarget');
check('setTarget أُرسل بالمعرّف الصحيح', setTargetCmd?.target?.castDeviceId === 'cc-1', JSON.stringify(setTargetCmd));
check('اسم الجهاز في الزر', afterCast.label === 'Living Room TV', afterCast.label);
check('الزر بحالة بثّ', afterCast.casting);
check('وجهة التشغيل تعرض البثّ', afterCast.target.includes('Living Room TV'), afterCast.target);
check('الجهاز المختار صار النشط', afterCast.activeId === 'cc-1', String(afterCast.activeId));

// الرجوع إلى الجهاز المحلي
await page.click('[data-cast="local"]');
await page.waitForTimeout(600);
const backLocal = await page.evaluate(() => document.getElementById('hb-cast-toggle').classList.contains('casting'));
check('الرجوع إلى الجهاز المحلي', !backLocal);

console.log('\n== 11. الكتابة عن بُعد ==');
mock.received.length = 0;
// نجعل Harbor يركّز حقلاً نصّياً عبر openSearch
await page.evaluate(() => Harbor.send({ action: 'openSearch' }));
await page.waitForTimeout(700);
const typingShown = await page.evaluate(() => {
  const card = document.getElementById('harbor-typing-card');
  return {
    visible: !card.classList.contains('hidden'),
    placeholder: document.getElementById('harbor-typing-input').placeholder,
  };
});
check('لوحة الكتابة ظهرت عند تركيز Harbor', typingShown.visible);
check('العنصر النائب من Harbor', typingShown.placeholder === 'Search Harbor', typingShown.placeholder);

mock.received.length = 0;
await page.fill('#harbor-typing-input', 'Interstellar');
await page.waitForTimeout(500);
const setTextCmds = mock.received.map(m => m.command).filter(c => c?.action === 'setText');
check('setText يتتبّع الكتابة', setTextCmds.some(c => c.value === 'Interstellar'), JSON.stringify(setTextCmds.at(-1)));

mock.received.length = 0;
await page.press('#harbor-typing-input', 'Enter');
await page.waitForTimeout(700);
const submitted = mock.received.map(m => m.command).find(c => c?.action === 'submitText');
check('Enter يرسل النص', submitted?.value === 'Interstellar', JSON.stringify(submitted));
const typingHidden = await page.evaluate(() =>
  document.getElementById('harbor-typing-card').classList.contains('hidden'));
check('اللوحة تختفي بعد الإرسال', typingHidden);

console.log('\n== 12. اختصارات لوحة المفاتيح ==');
mock.received.length = 0;
await page.evaluate(() => document.body.focus());
await page.keyboard.press('Space');
await page.waitForTimeout(400);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(400);
await page.keyboard.press('KeyM');
await page.waitForTimeout(400);
await page.keyboard.press('KeyN');
await page.waitForTimeout(400);
const keyCmds = mock.received.map(m => m.command).filter(c => c && c.action !== 'ping');
console.log('  أوامر الاختصارات:', JSON.stringify(keyCmds));
check('مسافة = تشغيل/إيقاف', keyCmds.some(c => c.action === 'play' || c.action === 'pause'));
check('→ = تقديم', keyCmds.some(c => c.action === 'seek'));
check('↑ = رفع الصوت', keyCmds.some(c => c.action === 'setVolume'));
check('M = كتم', keyCmds.some(c => c.action === 'setMuted'));
check('N = الحلقة التالية', keyCmds.some(c => c.action === 'nextEpisode'));

// الاختصارات يجب أن تتوقف داخل حقول الإدخال
mock.received.length = 0;
await page.click('#harbor-search-input');
await page.type('#harbor-search-input', 'mn');
await page.waitForTimeout(400);
const whileTyping = mock.received.map(m => m.command).filter(c => c && c.action !== 'ping');
check('الاختصارات معطّلة أثناء الكتابة', whileTyping.length === 0, JSON.stringify(whileTyping));
await page.fill('#harbor-search-input', '');

console.log('\n== 13. الأوامر الواعية بالحالة (withSnapshot) ==');
const toggleRes = await page.evaluate(async () => {
  const cfg = await HarborCore.getConfig();
  const first = await HarborCore.togglePlayback(cfg);
  const second = await HarborCore.togglePlayback(cfg);
  return { first, second };
});
console.log('  ', JSON.stringify(toggleRes));
check('togglePlayback يقرأ الحالة ويقلبها',
  toggleRes.first.ok && toggleRes.second.ok &&
  toggleRes.first.command.action !== toggleRes.second.command.action,
  `${toggleRes.first.command?.action} ثم ${toggleRes.second.command?.action}`);

const noNext = await page.evaluate(async () => {
  const cfg = await HarborCore.getConfig();
  // decide يرجّع null ⇒ لا يُرسَل أمر
  return await HarborCore.withSnapshot(cfg, () => null);
});
check('decide=null لا يرسل أمراً', noNext.ok && noNext.command === null, JSON.stringify(noNext));

console.log('\n== 14. تحليل روابط المواقع ==');
const linkCases = await page.evaluate(() => {
  const urls = [
    'https://www.imdb.com/title/tt0816692/',
    'https://www.themoviedb.org/tv/1396-breaking-bad',
    'https://letterboxd.com/film/the-matrix/',
    'https://trakt.tv/movies/the-matrix-1999',
    'https://example.com/nothing',
  ];
  const out = [];
  for (const u of urls) {
    out.push([u, HarborCore.parseMediaLink(u)]);
  }
  return out;
});
for (const [u, res] of linkCases) console.log('  ', u, '→', JSON.stringify(res));
const byUrl = Object.fromEntries(linkCases);
check('IMDb → معرّف مباشر', byUrl['https://www.imdb.com/title/tt0816692/']?.imdbId === 'tt0816692');
check('TMDB → نوع + عنوان', byUrl['https://www.themoviedb.org/tv/1396-breaking-bad']?.mediaType === 'series' && byUrl['https://www.themoviedb.org/tv/1396-breaking-bad']?.query === 'breaking bad');
check('Letterboxd → فيلم', byUrl['https://letterboxd.com/film/the-matrix/']?.query === 'the matrix');
check('Trakt → السنة مُزالة من الـ slug', byUrl['https://trakt.tv/movies/the-matrix-1999']?.query === 'the matrix');
check('رابط غير مدعوم → null', byUrl['https://example.com/nothing'] === null);

console.log('\n== 15. مقارنة الإصدارات ==');
const vcmp = await page.evaluate(() => {
  const c = ExtUpdater.compareVersions;
  return {
    newer: c('1.8.0', '1.7.0'),
    older: c('1.7.0', '1.8.0'),
    equal: c('1.7.0', '1.7.0'),
    vPrefix: c('v1.8.0', '1.7.0'),
    minor: c('1.7.1', '1.7.0'),
    fourth: c('1.7.0.2', '1.7.0'),
    tenVsNine: c('1.10.0', '1.9.0'),
    shortVsLong: c('2', '1.9.9'),
    garbage: c('abc', '1.0.0'),
    parse: ExtUpdater.parseVersion('v1.7.0'),
  };
});
console.log('  ', JSON.stringify(vcmp));
check('أحدث ← 1', vcmp.newer === 1);
check('أقدم ← -1', vcmp.older === -1);
check('متساويتان ← 0', vcmp.equal === 0);
check('بادئة v تُتجاهل', vcmp.vPrefix === 1);
check('فرق في الرقم الثالث', vcmp.minor === 1);
check('مقطع رابع', vcmp.fourth === 1);
check('1.10 أحدث من 1.9 (ليست مقارنة نصية)', vcmp.tenVsNine === 1, String(vcmp.tenVsNine));
check('طول مختلف: 2 > 1.9.9', vcmp.shortVsLong === 1);
check('نص غير صالح لا يكسر المقارنة', vcmp.garbage === -1, String(vcmp.garbage));
check('parseVersion يزيل v', JSON.stringify(vcmp.parse) === '[1,7,0]', JSON.stringify(vcmp.parse));

console.log('\n== 16. شريط التحديث ==');
const bannerNew = await page.evaluate(() => {
  Updater.selfUpdating = false;
  Updater.state = {
    current: '1.7.0', latest: '1.9.0', hasUpdate: true,
    url: 'https://example.com/rel', notes: '## عنوان\nأول سطر حقيقي',
    checkedAt: Date.now(),
  };
  Updater.renderBanner();
  const b = document.getElementById('update-banner');
  return {
    visible: !b.classList.contains('hidden'),
    title: document.getElementById('update-banner-title').textContent,
    sub: document.getElementById('update-banner-sub').textContent,
    href: document.getElementById('update-banner-btn').getAttribute('href'),
  };
});
check('الشريط يظهر عند توفّر تحديث', bannerNew.visible);
check('يعرض رقم النسخة', bannerNew.title.includes('1.9.0'), bannerNew.title);
check('يأخذ أول سطر من ملاحظات الإصدار', bannerNew.sub === 'عنوان', bannerNew.sub);
check('زر التنزيل يشير للإصدار', bannerNew.href === 'https://example.com/rel', bannerNew.href);

const bannerAuto = await page.evaluate(() => {
  Updater.selfUpdating = true;
  Updater.renderBanner();
  return !document.getElementById('update-banner').classList.contains('hidden');
});
check('لا شريط للنسخ ذاتية التحديث', !bannerAuto);

const bannerDismissed = await page.evaluate(() => {
  Updater.selfUpdating = false;
  Updater.state = { ...Updater.state, dismissedUpdate: '1.9.0' };
  Updater.renderBanner();
  const hidden = document.getElementById('update-banner').classList.contains('hidden');
  // نسخة أحدث من المُتجاهَلة يجب أن تُظهر الشريط من جديد
  Updater.state = { ...Updater.state, latest: '2.0.0' };
  Updater.renderBanner();
  const backAgain = !document.getElementById('update-banner').classList.contains('hidden');
  return { hidden, backAgain };
});
check('التجاهل يُخفي الشريط', bannerDismissed.hidden);
check('نسخة أحدث من المُتجاهَلة تُظهره ثانيةً', bannerDismissed.backAgain);

const bannerNone = await page.evaluate(() => {
  Updater.state = { current: '1.7.0', latest: '1.7.0', hasUpdate: false, checkedAt: Date.now() };
  Updater.renderBanner();
  Updater.renderSettings();
  return {
    hidden: document.getElementById('update-banner').classList.contains('hidden'),
    status: document.getElementById('upd-status').textContent,
  };
});
check('لا شريط بلا تحديث', bannerNone.hidden);
check('الإعدادات تقول إنك على الأحدث', bannerNone.status.length > 0, bannerNone.status);

console.log('\n== 17. أولوية الشارة ==');
const badge = await page.evaluate(async () => {
  const read = () => chrome.action.getBadgeText({});

  // تحديثات إضافات Stremio فقط
  await chrome.storage.local.set({
    updateState: { hasUpdate: false },
    addonUpdates: [{ transportUrl: 'a' }, { transportUrl: 'b' }],
    dismissedUpdate: null,
  });
  await ExtUpdater.refreshBadge();
  const addonsOnly = await read();

  // تحديث الإضافة نفسها له الأولوية
  await chrome.storage.local.set({ updateState: { hasUpdate: true, latest: '9.9.9' } });
  await ExtUpdater.refreshBadge();
  const selfWins = await read();

  // بعد تجاهله تعود شارة الإضافات
  await chrome.storage.local.set({ dismissedUpdate: '9.9.9' });
  await ExtUpdater.refreshBadge();
  const afterDismiss = await read();

  // لا شيء إطلاقاً
  await chrome.storage.local.set({ updateState: { hasUpdate: false }, addonUpdates: [] });
  await ExtUpdater.refreshBadge();
  const empty = await read();

  await chrome.storage.local.remove(['updateState', 'addonUpdates', 'dismissedUpdate']);
  return { addonsOnly, selfWins, afterDismiss, empty };
});
console.log('  ', JSON.stringify(badge));
check('عدّاد إضافات Stremio', badge.addonsOnly === '2', badge.addonsOnly);
check('تحديث الإضافة يتقدّم على العدّاد', badge.selfWins === '↑', badge.selfWins);
check('بعد التجاهل يعود العدّاد', badge.afterDismiss === '2', badge.afterDismiss);
check('الشارة تُمسح بلا تحديثات', badge.empty === '', JSON.stringify(badge.empty));

console.log('\n== 18. الفحص عبر الـ background ==');
const checkRes = await page.evaluate(async () =>
  await chrome.runtime.sendMessage({ type: 'CHECK_EXTENSION_UPDATE', force: true }));
console.log('  ', JSON.stringify({ ...checkRes, notes: undefined }));
check('الفحص يرجّع النسخة الحالية', checkRes?.current === chrome_version, `${checkRes?.current} ≠ ${chrome_version}`);
check('الفحص لا يرمي استثناءً', typeof checkRes?.hasUpdate === 'boolean', JSON.stringify(checkRes));
check('يبلّغ إن كان المتصفح يحدّث تلقائياً', typeof checkRes?.selfUpdating === 'boolean');

console.log('\n== الأخطاء ==');
const realErrors = errors.filter(e => !/net::ERR_|Failed to load resource|WebSocket connection to/.test(e));
console.log('console/page errors:', realErrors.length ? '\n' + realErrors.join('\n') : '(لا شيء)');
console.log('service worker errors:', swErrors.length ? '\n' + swErrors.join('\n') : '(لا شيء)');
if (realErrors.length) fail.push('أخطاء وقت التشغيل');

await ctx.close();
mock.stop();

console.log('\n================================');
console.log(fail.length ? '❌ فشل: ' + fail.join(' | ') : '✅ كل الفحوص نجحت');
process.exit(fail.length ? 1 : 0);
