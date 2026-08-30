// background.js — StremioHub Service Worker

// ==================== Context Menu ====================
async function updateContextMenu() {
  const { language } = await chrome.storage.local.get('language');
  const lang = language || 'ar';
  const title = lang === 'en' 
    ? '🔍 Search Stremio for "%s"' 
    : '🔍 ابحث عن "%s" في Stremio';
  
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'search-stremio',
      title: title,
      contexts: ['selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  updateContextMenu();
  // جدولة فحص التحديثات كل 24 ساعة
  chrome.alarms.create('addon-update-check', { periodInMinutes: 60 * 24 });
});

// ==================== Addon Update Checker ====================

/**
 * يكشف إذا كانت الإضافة تحتوي على إعدادات مخصصة في الرابط
 * مثال: torrentio.strem.fun/providers=yts|KEY/manifest.json → معقّدة
 */
function isComplexAddon(transportUrl) {
  if (!transportUrl) return false;
  try {
    const url = new URL(transportUrl);
    // مسارات أكثر من segment واحد تدل على وجود إعدادات
    const segments = url.pathname.split('/').filter(s => s && s !== 'manifest.json');
    return segments.length > 1 || transportUrl.includes('|') || transportUrl.includes('%7C');
  } catch {
    return false;
  }
}

/**
 * يجلب الـ manifest.json من رابط الإضافة
 * يتعامل مع:
 * - transportUrl = https://domain.com/manifest.json  (الشائع)
 * - transportUrl = https://domain.com/               (بدون manifest)
 * - transportUrl = https://domain.com/settings/      (معقد)
 */
async function fetchRemoteManifest(transportUrl) {
  let manifestUrl = transportUrl.trim();

  // إذا كان الرابط ينتهي بـ manifest.json استخدمه مباشرةً
  if (manifestUrl.endsWith('manifest.json')) {
    // صحيح كما هو
  } else {
    // أضف manifest.json
    if (!manifestUrl.endsWith('/')) manifestUrl += '/';
    manifestUrl += 'manifest.json';
  }

  const res = await fetch(manifestUrl, {
    signal: AbortSignal.timeout(8000) // 8 ثانية timeout
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/**
 * الدالة الرئيسية لفحص تحديثات الإضافات
 */
async function checkAddonUpdates(authKey) {
  if (!authKey) return [];

  // 1. جلب الإضافات المثبتة من Stremio API
  let addons = [];
  try {
    const res = await fetch('https://api.strem.io/api/addonCollectionGet', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ authKey, update: true })
    });
    const data = await res.json();
    addons = data?.result?.addons || [];
  } catch (err) {
    console.warn('[StremioHub] checkAddonUpdates: failed to fetch addons list', err);
    return [];
  }

  if (!addons.length) return [];

  // 2. فحص كل إضافة بشكل متوازٍ
  const checks = await Promise.allSettled(
    addons.map(async (addon) => {
      const transportUrl = addon.transportUrl;
      if (!transportUrl) return null;

      const installedVersion = addon.manifest?.version;
      const name = addon.manifest?.name || addon.manifest?.id || 'Unknown';
      const logo = addon.manifest?.logo || null;
      const complex = isComplexAddon(transportUrl);

      try {
        const remoteManifest = await fetchRemoteManifest(transportUrl);
        const latestVersion = remoteManifest?.version;

        const hasUpdate = !!(
          installedVersion &&
          latestVersion &&
          installedVersion !== latestVersion
        );

        return {
          name,
          logo,
          installedVersion: installedVersion || '?',
          latestVersion: latestVersion || '?',
          hasUpdate,
          isComplex: complex,
          transportUrl
        };
      } catch {
        // الإضافة غير متاحة أو فشل الجلب — نتجاهلها
        return null;
      }
    })
  );

  // 3. فلترة: فقط الإضافات التي تحتاج تحديثاً
  const updates = checks
    .filter(r => r.status === 'fulfilled' && r.value?.hasUpdate)
    .map(r => r.value);

  // 4. حفظ النتائج في storage
  await chrome.storage.local.set({
    addonUpdates: updates,
    addonUpdatesCheckedAt: Date.now()
  });

  // 5. تحديث Badge
  const count = updates.length;
  if (count > 0) {
    await chrome.action.setBadgeText({ text: String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }

  return updates;
}

// ==================== Alarm Handler ====================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'addon-update-check') {
    try {
      const { stremio_auth } = await chrome.storage.local.get(['stremio_auth']);
      if (!stremio_auth?.authKey) return;
      await checkAddonUpdates(stremio_auth.authKey);
    } catch (err) {
      console.warn('[StremioHub] Alarm update check failed:', err);
    }
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.language) {
    updateContextMenu();
  }
});

// ==================== Context Menu Click ====================
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'search-stremio') {
    const query = info.selectionText?.trim();
    if (!query) return;

    // خزّن الـ query ثم افتح الـ Popup
    await chrome.storage.session.set({ pendingSearch: query });

    // حاول فتح الـ Popup — إذا فشل (بعض المتصفحات لا تدعم openPopup من service worker)
    // نفتح tab جديد مع Stremio Web search
    try {
      await chrome.action.openPopup();
    } catch {
      // fallback: افتح بحث على Stremio Web
      const encoded = encodeURIComponent(query);
      await chrome.tabs.create({
        url: `https://web.stremio.com/#/search?search=${encoded}`
      });
    }
  }
});

import { StremioAPI } from './modules/stremio-api.js';

// ==================== Message Listener ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── فحص تحديثات الإضافات (يدوي من الـ Popup) ──
  if (message.type === 'CHECK_ADDON_UPDATES') {
    (async () => {
      try {
        const { stremio_auth } = await chrome.storage.local.get(['stremio_auth']);
        if (!stremio_auth?.authKey) {
          sendResponse({ success: false, error: 'not_logged_in', updates: [] });
          return;
        }
        const updates = await checkAddonUpdates(stremio_auth.authKey);
        sendResponse({ success: true, updates });
      } catch (err) {
        sendResponse({ success: false, error: err.message, updates: [] });
      }
    })();
    return true;
  }

  // ── تحديث إضافة بسيطة مباشرةً عبر API ──
  if (message.type === 'UPDATE_SINGLE_ADDON') {
    (async () => {
      try {
        const { transportUrl } = message;
        const { stremio_auth } = await chrome.storage.local.get(['stremio_auth']);
        if (!stremio_auth?.authKey) throw new Error('not_logged_in');

        // 1. جلب الـ manifest الجديد
        const newManifest = await fetchRemoteManifest(transportUrl);
        if (!newManifest?.id) throw new Error('invalid_manifest');

        // 2. جلب قائمة الإضافات الحالية
        const listRes = await fetch('https://api.strem.io/api/addonCollectionGet', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ authKey: stremio_auth.authKey, update: true })
        });
        const listData = await listRes.json();
        const addons = listData?.result?.addons || [];

        // 3. استبدال الإضافة القديمة بالجديدة (نفس transportUrl)
        const updatedAddons = addons.map(addon => {
          if (addon.transportUrl === transportUrl) {
            return { ...addon, manifest: newManifest };
          }
          return addon;
        });

        // 4. رفع التحديث لـ Stremio API
        const saveRes = await fetch('https://api.strem.io/api/addonCollectionSet', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ authKey: stremio_auth.authKey, addons: updatedAddons })
        });
        const saveData = await saveRes.json();
        if (saveData.error) throw new Error(typeof saveData.error === 'string' ? saveData.error : 'save_failed');

        // 5. إزالة الإضافة من قائمة التحديثات المحفوظة
        const { addonUpdates = [] } = await chrome.storage.local.get(['addonUpdates']);
        const remaining = addonUpdates.filter(u => u.transportUrl !== transportUrl);
        await chrome.storage.local.set({ addonUpdates: remaining });

        // 6. تحديث Badge
        const count = remaining.length;
        await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

        sendResponse({ success: true, newVersion: newManifest.version });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'UPDATE_COMPLEX_ADDON') {
    (async () => {
      try {
        const { oldTransportUrl, newTransportUrl } = message;
        if (!oldTransportUrl || !newTransportUrl) throw new Error('missing_urls');

        // 1. جلب التوثيق
        const { stremio_auth } = await chrome.storage.local.get(['stremio_auth']);
        if (!stremio_auth?.authKey) throw new Error('not_logged_in');

        // 2. جلب المانيفست الجديد
        const newManifest = await fetchRemoteManifest(newTransportUrl);
        if (!newManifest?.id) throw new Error('invalid_manifest');

        // 3. جلب قائمة الإضافات الحالية
        const listRes = await fetch('https://api.strem.io/api/addonCollectionGet', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ authKey: stremio_auth.authKey, update: true })
        });
        const listData = await listRes.json();
        const addons = listData?.result?.addons || [];

        // 4. البحث عن الإضافة القديمة
        const oldAddonIndex = addons.findIndex(a => a.transportUrl === oldTransportUrl);
        if (oldAddonIndex === -1) throw new Error('old_addon_not_found');

        // حماية: التأكد أن المعرف هو نفسه لكي لا يتم استبدال إضافة بأخرى مختلفة كلياً
        if (newManifest.id !== addons[oldAddonIndex].manifest.id) {
          throw new Error('manifest_id_mismatch');
        }

        // 5. استبدال الرابط والبيانات في نفس المكان
        addons[oldAddonIndex] = {
          ...addons[oldAddonIndex],
          transportUrl: newTransportUrl,
          manifest: newManifest
        };

        // 6. الحفظ
        const saveRes = await fetch('https://api.strem.io/api/addonCollectionSet', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ authKey: stremio_auth.authKey, addons })
        });
        const saveData = await saveRes.json();
        if (saveData.error) throw new Error(typeof saveData.error === 'string' ? saveData.error : 'save_failed');

        // 7. إزالة من قائمة التحديثات وتحديث الـ Badge
        const { addonUpdates = [] } = await chrome.storage.local.get(['addonUpdates']);
        const remaining = addonUpdates.filter(u => u.transportUrl !== oldTransportUrl);
        await chrome.storage.local.set({ addonUpdates: remaining });
        const count = remaining.length;
        await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

        sendResponse({ success: true, newVersion: newManifest.version });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'GET_AUTH') {
    (async () => {
      const result = await chrome.storage.local.get(['stremio_auth']);
      sendResponse(result.stremio_auth || null);
    })();
    return true; // async response
  }

  if (message.type === 'OPEN_STREMIO_WEB') {
    const { imdbId, mediaType, videoId } = message;
    const url = videoId 
      ? `https://web.stremio.com/#/detail/${mediaType}/${imdbId}/${videoId}`
      : `https://web.stremio.com/#/detail/${mediaType}/${imdbId}`;
    chrome.tabs.create({ url });
  }

  if (message.type === 'OPEN_STREMIO_APP') {
    const { imdbId, mediaType, videoId } = message;
    const url = videoId
      ? `stremio:///detail/${mediaType}/${imdbId}/${videoId}`
      : `stremio:///detail/${mediaType}/${imdbId}`;
    chrome.tabs.create({ url });
  }

  if (message.type === 'SEARCH_IN_POPUP') {
    (async () => {
      await chrome.storage.session.set({ pendingSearch: message.query });
      try { await chrome.action.openPopup(); } catch {}
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'ADD_TO_LIBRARY') {
    (async () => {
      try {
        const { stremio_auth } = await chrome.storage.local.get(['stremio_auth']);
        if (!stremio_auth?.authKey) throw new Error('Not logged in');

        let itemMeta = null;
        
        // If imdbId is provided directly, we can fetch exactly
        if (message.imdbId) {
          const type = message.mediaType || 'movie';
          const metaRes = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${message.imdbId}.json`);
          if (metaRes.ok) {
            const data = await metaRes.json();
            if (data.meta) itemMeta = data.meta;
          }
        } 
        
        // Otherwise search cinemeta by title
        if (!itemMeta && message.query) {
          const type = message.mediaType || 'movie';
          const searchRes = await fetch(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(message.query)}.json`);
          if (searchRes.ok) {
            const data = await searchRes.json();
            let matched = data.metas?.[0];
            if (message.year && data.metas) {
              const exact = data.metas.find(m => m.year == message.year || (m.releaseInfo && m.releaseInfo.includes(message.year)));
              if (exact) matched = exact;
            }
            if (matched) {
              // Fetch full meta
              const metaRes = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${matched.id}.json`);
              if (metaRes.ok) {
                const fullData = await metaRes.json();
                if (fullData.meta) itemMeta = fullData.meta;
              } else {
                itemMeta = matched;
              }
            }
          }
        }

        if (!itemMeta) {
          // Fallback minimal meta if cinemeta fails
          itemMeta = {
            id: message.imdbId || `custom:${Date.now()}`,
            name: message.query,
            type: message.mediaType || 'movie',
            year: message.year || ''
          };
        }

        const success = await StremioAPI.addToLibrary(stremio_auth.authKey, itemMeta);
        
        // Invalidate library cache
        await chrome.storage.local.remove(['library_cache']);

        sendResponse({ success, itemMeta });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'OPEN_IN_STREMIO_DIRECT') {
    (async () => {
      try {
        let imdbId = message.imdbId;
        const type = message.mediaType || 'movie';
        
        if (!imdbId && message.query) {
          const searchRes = await fetch(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(message.query)}.json`);
          if (searchRes.ok) {
            const data = await searchRes.json();
            let matched = data.metas?.[0];
            if (message.year && data.metas) {
              const exact = data.metas.find(m => m.year == message.year || (m.releaseInfo && m.releaseInfo.includes(message.year)));
              if (exact) matched = exact;
            }
            if (matched) imdbId = matched.id;
          }
        }

        if (!imdbId) throw new Error('Could not find item in Stremio catalog');

        const { openMethod } = await chrome.storage.local.get(['openMethod']);
        const method = openMethod || 'web';
        
        const url = method === 'app' 
          ? `stremio:///detail/${type}/${imdbId}`
          : `https://web.stremio.com/#/detail/${type}/${imdbId}`;
          
        await chrome.tabs.create({ url });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ==================== Ratings API Handlers ====================

  if (message.type === 'FETCH_RATINGS') {
    (async () => {
      const { imdbId } = message;
      if (!imdbId || !/^tt\d+$/.test(imdbId)) {
        sendResponse({ error: 'invalid_id' });
        return;
      }

      // ── طبقة الكاش (session storage — يُمسح عند إغلاق المتصفح) ──
      const cacheKey = `sh_ratings_${imdbId}`;
      try {
        const cached = await chrome.storage.session.get(cacheKey);
        if (cached[cacheKey]) {
          sendResponse({ ratings: cached[cacheKey], fromCache: true });
          return;
        }
      } catch (_) { /* session storage اختياري */ }

      // ── قراءة الإعدادات ──
      const settings = await chrome.storage.local.get([
        'ratingsEnabled',
        'ratingsSource',
        'mdblistApiKey',
        'publicmetadbApiKey'
      ]);

      if (settings.ratingsEnabled === false) {
        sendResponse({ error: 'disabled' });
        return;
      }

      const source = settings.ratingsSource || 'mdblist';
      let ratingsData = null;
      let fetchError  = null;

      try {
        if (source === 'mdblist') {
          ratingsData = await fetchFromMDBList(settings.mdblistApiKey, imdbId);
        } else if (source === 'publicmetadb') {
          // نمرر mediaType (movie أو series) لأن PublicMetaDB يحتاجه
          const mediaType = message.mediaType || 'movie';
          ratingsData = await fetchFromPublicMetaDB(settings.publicmetadbApiKey, imdbId, mediaType);
        }
      } catch (err) {
        fetchError = err.message;
      }

      if (!ratingsData) {
        sendResponse({ error: fetchError || 'no_data' });
        return;
      }

      // ── حفظ في الكاش ──
      try {
        await chrome.storage.session.set({ [cacheKey]: ratingsData });
      } catch (_) { /* تجاهل فشل الكاش */ }

      sendResponse({ ratings: ratingsData });
    })();
    return true; // يُبلغ Chrome أن الرد سيكون async
  }

  if (message.type === 'TEST_RATINGS_API') {
    (async () => {
      const { source, apiKey } = message;
      const testImdbId = 'tt0111161'; // The Shawshank Redemption
      try {
        let result = null;
        if (source === 'mdblist') {
          result = await fetchFromMDBList(apiKey, testImdbId);
        } else if (source === 'publicmetadb') {
          result = await fetchFromPublicMetaDB(apiKey, testImdbId);
        }
        sendResponse({ ok: !!result, count: result?.ratings?.length || 0 });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});

// ==================== Ratings API Helpers ====================

async function fetchFromMDBList(apiKey, imdbId) {
  if (!apiKey) throw new Error('mdblist_no_key');
  // ✅ mdblist.com/api/ هو العنوان الصحيح (api.mdblist.com للـ OAuth فقط)
  const url = `https://mdblist.com/api/?apikey=${apiKey}&i=${imdbId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mdblist_http_${res.status}`);
  const data = await res.json();
  if (data.response === false || data.error === true) {
    throw new Error(data.error_message || data.error || 'mdblist_api_error');
  }
  return parseMDBList(data);
}


async function fetchFromPublicMetaDB(apiKey, imdbId, mediaType = 'movie') {
  if (!apiKey) throw new Error('publicmetadb_no_key');

  // 1. جلب tmdb_id عبر Cinemeta لأن PublicMetaDB يحتاج TMDB ID
  const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/${mediaType}/${imdbId}.json`;
  let tmdbId = null;
  let title = '';
  let year = '';

  try {
    const cinemetaRes = await fetch(cinemetaUrl);
    if (cinemetaRes.ok) {
      const cinemetaData = await cinemetaRes.json();
      tmdbId = cinemetaData?.meta?.moviedb_id;
      title = cinemetaData?.meta?.name || '';
      year = cinemetaData?.meta?.year || '';
    }
  } catch (_) {
    // تجاهل أخطاء cinemeta، سنلقي خطأ إذا لم نجد tmdbId
  }

  if (!tmdbId) {
    throw new Error('publicmetadb_no_tmdb_id');
  }

  // 2. طلب التقييمات من الـ API الرسمي الجديد
  // PublicMetaDB يقبل 'movie' أو 'tv' فقط
  const pmMediaType = mediaType === 'series' ? 'tv' : mediaType;
  const url = `https://publicmetadb.com/api/external/ratings?tmdb_id=${tmdbId}&media_type=${pmMediaType}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) throw new Error(`publicmetadb_http_${res.status}`);
  
  const data = await res.json();
  return parsePublicMetaDB(data, title, year);
}

function parseMDBList(data) {
  if (!data) return null;
  const ratings = [];

  // ── البنية الجديدة: ratings هي مصفوفة [{source, value, score, votes}] ──
  if (Array.isArray(data.ratings) && data.ratings.length > 0) {
    const SOURCE_MAP = {
      // source key      label          max   icon  useScore (بعض القيم كـ letterboxd تكون من 5)
      'imdb':            { label: 'IMDb',        max: 10,  icon: '⭐', useValue: true  },
      'tomatoes':        { label: 'RT',          max: 100, icon: '🍅', useValue: true  },
      'tomatoesaudience':{ label: 'RT Aud',      max: 100, icon: '🍿', useValue: true  },
      'metacritic':      { label: 'Metacritic',  max: 100, icon: '🎯', useValue: true  },
      'metacriticuser':  { label: 'MC User',     max: 10,  icon: '👤', useValue: true  },
      'trakt':           { label: 'Trakt',       max: 100, icon: '📺', useValue: true  },
      'tmdb':            { label: 'TMDB',        max: 100, icon: '🎭', useValue: true  },
      'letterboxd':      { label: 'Letterboxd',  max: 5,   icon: '🎬', useValue: true  },
      'rogerebert':      { label: 'Ebert',       max: 4,   icon: '🎥', useValue: true  },
    };
    for (const r of data.ratings) {
      const key = r.source?.toLowerCase();
      const map = SOURCE_MAP[key];
      // r.value هو القيمة الأصلية، r.score هو من 100 دائماً
      const val = r.value;
      if (map && val != null) {
        ratings.push({ source: map.label, score: val, max: map.max, icon: map.icon });
      }
    }
  } else {
    // ── البنية القديمة: حقول مستقلة ──
    if (data.imdbrating    != null) ratings.push({ source: 'IMDb',       score: data.imdbrating,    max: 10,  icon: '⭐' });
    if (data.tomatoesmeter != null) ratings.push({ source: 'RT',         score: data.tomatoesmeter, max: 100, icon: '🍅' });
    if (data.metacritic    != null) ratings.push({ source: 'Metacritic', score: data.metacritic,    max: 100, icon: '🎯' });
    if (data.letterboxd    != null) ratings.push({ source: 'Letterboxd', score: data.letterboxd,    max: 5,   icon: '🎬' });
    if (data.trakt         != null) ratings.push({ source: 'Trakt',      score: data.trakt,         max: 100, icon: '📺' });
    if (data.rogerebert    != null) ratings.push({ source: 'Ebert',      score: data.rogerebert,    max: 4,   icon: '🎥' });
  }

  if (ratings.length === 0) return null;
  return { source: 'mdblist', title: data.title || '', year: data.year || '', ratings };
}

function parsePublicMetaDB(data, title, year) {
  if (!data || !data.items) return null;
  
  const LABEL_MAP = {
    'IM': { label: 'IMDb', max: 10, icon: '⭐' },
    'RT': { label: 'RT', max: 100, icon: '🍅' },
    'PC': { label: 'RT Aud', max: 100, icon: '🍿' },
    'MC': { label: 'Metacritic', max: 100, icon: '🎯' },
    'TR': { label: 'Trakt', max: 100, icon: '📺' },
    'TM': { label: 'TMDB', max: 100, icon: '🎭' },
    'LB': { label: 'Letterboxd', max: 5, icon: '🎬' },
    'RE': { label: 'Ebert', max: 4, icon: '🎥' }
  };

  // تجميع التقييمات وحساب المتوسط لكل منصة
  const grouped = {};
  for (const item of data.items) {
    const lbl = item.label || 'Overall';
    if (!grouped[lbl]) grouped[lbl] = [];
    grouped[lbl].push(item.score);
  }

  const ratings = [];

  // تقييم مجتمع PublicMetaDB العام
  if (data.average != null) {
    ratings.push({ source: 'PublicMeta', score: data.average, max: 100, icon: '🌐' });
  }

  // التقييمات الخارجية (تحويل السكور من % إلى النظام الأصلي)
  for (const [lbl, scores] of Object.entries(grouped)) {
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length; // من 100
    const map = LABEL_MAP[lbl];
    if (map) {
      // إذا كان التقييم مثلاً 93 والماكس الخاص به 10 (مثل IMDb) نرجعه إلى 9.3
      let finalScore = avgScore;
      if (map.max && map.max !== 100) {
        finalScore = (avgScore * (map.max / 100));
        // تقريب لمنزلة عشرية واحدة إذا كان ماكس 10 أو 5
        finalScore = Number(finalScore.toFixed(1)); 
      }
      ratings.push({ source: map.label, score: finalScore, max: map.max, icon: map.icon });
    }
  }

  if (ratings.length === 0) return null;
  return { source: 'publicmetadb', title: title || 'PublicMetaDB', year: year || '', ratings };
}
