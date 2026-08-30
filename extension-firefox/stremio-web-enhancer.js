// stremio-web-enhancer.js — StremioHub Web Enhancer
// يُحقن في web.stremio.com فقط — StremioHub v1.4.0-beta

(function StremioWebEnhancer() {
  'use strict';

  // ── Guard: منع التشغيل المزدوج ──
  if (window.__sh_webEnhancer) return;
  window.__sh_webEnhancer = true;

  // ── الحالة الداخلية ──
  const state = {
    currentImdbId:  null,
    currentType:    null,
    retryCount:     0,
    retryTimer:     null,
    injecting:      false
  };

  const CONFIG = {
    MAX_RETRIES:    20,   // 20 × 500ms = 10 ثواني
    RETRY_INTERVAL: 500,  // ms
    WIDGET_ID:      'sh-ratings-host',
    STYLE_ID:       'sh-custom-styles'
  };

  // ── Stremio Web يستخدم hash routing: /#/detail/{type}/{imdbId} ──
  function parseCurrentPage() {
    const url = window.location.href;
    const match = url.match(/\/detail\/(movie|series)\/(tt\d+)/);
    if (!match) return null;
    return { type: match[1], imdbId: match[2] };
  }

  function onPageChange() {
    const page = parseCurrentPage();

    // ليس على صفحة تفصيل — لا شيء
    if (!page) {
      state.currentImdbId = null;
      state.currentType   = null;
      clearMonitor();
      // إزالة widget موجود عند الخروج من صفحة التفصيل
      const existing = document.getElementById(CONFIG.WIDGET_ID);
      if (existing) existing.remove();
      return;
    }

    // نفس العمل — تجنب إعادة الحقن
    if (page.imdbId === state.currentImdbId) return;

    state.currentImdbId = page.imdbId;
    state.currentType   = page.type;
    state.injecting     = false;

    clearMonitor();
    startMonitor();
  }

  function clearMonitor() {
    if (state.retryTimer) {
      clearInterval(state.retryTimer);
      state.retryTimer = null;
    }
  }

  function startMonitor() {
    // تشغيل فحص دوري كل ثانية لضمان بقاء الـ Widget
    // إذا قام React بإعادة رسم الـ DOM وحذف الـ Widget، سيتم حقنه مجدداً
    state.retryTimer = setInterval(tryInject, 1000);
    tryInject(); // محاولة فورية
  }

  // ── الاستماع لتغييرات الصفحة (hash routing) ──
  window.addEventListener('hashchange', onPageChange, { passive: true });

  // ── فحص أولي عند تحميل الـ script ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageChange, { once: true });
  } else {
    onPageChange();
  }

  // ── محاولة إيجاد عنصر مناسب في DOM Stremio لزرع التقييمات ──
  // الأولوية لزر IMDb، وإذا لم يوجد نبحث عن سنة الإصدار أو مدة العرض
  const ANCHOR_SELECTORS = [
    'a[href*="imdb.com/title"]',
    'a[class*="imdb-button-container"]',
    // Fallbacks في حال لم يكن للعمل تقييم IMDb في ستريميو
    '[class*="release-info-label"]',
    '[class*="runtime-label"]',
    '[class*="runtime-release-info-container"] > :last-child',
    
    // Selectors احتياطية قديمة
    '[class*="MetaDetails-module"] [class*="imdb"]',
    '[class*="MetaDetails"] [class*="imdb"]',
    '[class*="meta-info"] [class*="imdb"]',
    '[class*="Imdb"]',
    '[data-testid*="imdb"]',
    '[class*="imdbRating"]',
    '[class*="ImdbRating"]',
    '[class*="rating-container"] [class*="imdb"]',
    '[class*="MetaPreview"] [class*="imdb"]',
    '[class*="meta-preview"] [class*="imdb"]',
    '[class*="rating"][class*="imdb"]'
  ];

  function findInjectionAnchor() {
    for (const sel of ANCHOR_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (_) { /* selector قد يكون غير صالح */ }
    }
    return null;
  }

  async function tryInject() {
    // إذا تغيرت الصفحة أثناء الانتظار — أوقف
    const page = parseCurrentPage();
    if (!page || page.imdbId !== state.currentImdbId || state.injecting) return;

    // هل الـ Widget موجود بالفعل؟
    const existing = document.getElementById(CONFIG.WIDGET_ID);
    if (existing && document.body.contains(existing)) return; // كل شيء تمام

    // تحقق من أن العمل لم يفشل مسبقاً لمنع التكرار اللانهائي
    if (state.failedIds && state.failedIds.has(state.currentImdbId)) return;

    // تحقق من الإعدادات أولاً (مع حماية من خطأ invalidated context أثناء تحديث الإضافة)
    let ratingsEnabled, ratingPreferences;
    try {
      const data = await chrome.storage.local.get(['ratingsEnabled', 'ratingPreferences']);
      ratingsEnabled = data.ratingsEnabled;
      ratingPreferences = data.ratingPreferences;
    } catch (err) {
      if (err.message && err.message.includes('Extension context invalidated')) {
        clearMonitor(); // إيقاف المراقبة تماماً لأن الـ script يحتاج إلى إعادة تحميل الصفحة
      }
      return;
    }

    if (ratingsEnabled === false) return;
    state.ratingPreferences = ratingPreferences || { imdb: true, rt: true, metacritic: true, letterboxd: true, tmdb: true, trakt: true, ebert: true };

    const anchor = findInjectionAnchor();
    if (anchor) {
      state.injecting = true;
      injectRatingsWidget(anchor);
    }
  }

  function injectRatingsWidget(anchor) {
    // إزالة widget سابق إن وجد
    const old = document.getElementById(CONFIG.WIDGET_ID);
    if (old) old.remove();

    // إنشاء Shadow DOM container
    const host   = document.createElement('span');
    host.id      = CONFIG.WIDGET_ID;
    host.style.cssText = 'display:inline-flex;align-items:center;vertical-align:middle;';
    const shadow = host.attachShadow({ mode: 'closed' });

    // إدراج بجانب شارة IMDb
    anchor.after(host);

    // عرض skeleton أثناء التحميل
    renderSkeleton(shadow);

    // طلب التقييمات من background.js (يتجاوز CSP)
    chrome.runtime.sendMessage(
      { type: 'FETCH_RATINGS', imdbId: state.currentImdbId, mediaType: state.currentType },
      (response) => {
        if (chrome.runtime.lastError) {
          // الـ extension ربما لم يُحمَّل بعد — فشل صامت
          host.remove();
          state.injecting = false;
          return;
        }
        if (!response || response.error || !response.ratings) {
          host.remove();
          state.injecting = false;
          // تسجيل العمل كفاشل حتى لا نظل في حلقة لانهائية من التحميل
          state.failedIds = state.failedIds || new Set();
          state.failedIds.add(state.currentImdbId);
          return;
        }
        renderRatings(shadow, response.ratings);
        state.injecting = false;
      }
    );
  }

  // ── Skeleton (يظهر أثناء تحميل البيانات) ──
  function renderSkeleton(shadow) {
    shadow.innerHTML = `
      <style>
        :host { display:inline-flex; align-items:center; gap:5px; margin-inline-start:8px; }
        .sk {
          width: 50px; height: 22px; border-radius: 12px;
          background: rgba(255,255,255,0.1);
          animation: pulse 1.4s ease-in-out infinite;
        }
        @keyframes pulse { 0%,100%{opacity:.35} 50%{opacity:.75} }
      </style>
      <span class="sk"></span>
      <span class="sk"></span>
      <span class="sk" style="width:42px"></span>
    `;
  }

  // ── Widget النهائي ──
  function renderRatings(shadow, ratingsData) {
    let { ratings = [] } = ratingsData;
    const prefs = state.ratingPreferences;
    
    // فلترة التقييمات بناءً على خيارات المستخدم
    ratings = ratings.filter(r => {
      if (r.source === 'IMDb' && prefs.imdb === false) return false;
      if (r.source === 'RT' && prefs.rt === false) return false;
      if (r.source === 'RT Aud' && prefs.rtaud === false) return false;
      if (r.source === 'Metacritic' && prefs.metacritic === false) return false;
      if (r.source === 'MC User' && prefs.mcuser === false) return false;
      if (r.source === 'Letterboxd' && prefs.letterboxd === false) return false;
      if (r.source === 'TMDB' && prefs.tmdb === false) return false;
      if (r.source === 'Trakt' && prefs.trakt === false) return false;
      if (r.source === 'Ebert' && prefs.ebert === false) return false;
      return true;
    });

    // Letterboxd منصة للأفلام فقط، إخفاؤها إذا كان العمل مسلسلاً
    if (state.currentType === 'series') {
      ratings = ratings.filter(r => r.source !== 'Letterboxd');
    }

    if (ratings.length === 0) { shadow.innerHTML = ''; return; }

    const SVG_MAP = {
      'IMDb': '<svg viewBox="0 0 512 512" height="13" width="13"><rect width="512" height="512" rx="15%" fill="#f5c518"/><path d="M104 328V184H64v144zM189 184l-9 67-5-36-5-31h-50v144h34v-95l14 95h25l13-97v97h34V184zM256 328V184h62c15 0 26 11 26 25v94c0 14-11 25-26 25zm47-118l-9-1v94c5 0 9-1 10-3 2-2 2-8 2-18v-56-12l-3-4zM419 220h3c14 0 26 11 26 25v58c0 14-12 25-26 25h-3c-8 0-16-4-21-11l-2 9h-36V184h38v46c5-6 13-10 21-10zm-8 70v-34l-1-11c-1-2-4-3-6-3s-5 1-6 3v57c1 2 4 3 6 3s6-1 6-3l1-12z" fill="#000000"/></svg>',
      'RT': '<svg viewBox="0 0 24 24" width="13" height="13" fill="#fa320a"><path d="M5.866 0L4.335 1.262l2.082 1.8c-2.629-.989-4.842 1.4-5.012 2.338 1.384-.323 2.24-.422 3.344-.335-7.042 4.634-4.978 13.148-1.434 16.094 5.784 4.612 13.77 3.202 17.91-1.316C27.26 13.363 22.993.65 10.86 2.766c.107-1.17.633-1.503 1.243-1.602-.89-1.493-3.67-.734-4.556 1.374C7.52 2.602 5.866 0 5.866 0zM4.422 7.217H6.9c2.673 0 2.898.012 3.55.202 1.06.307 1.868.973 2.313 1.904.05.106.092.206.13.305l7.623.008.027 2.912-2.745-.024v7.549l-2.982-.016v-7.522l-2.127.016a2.92 2.92 0 0 1-1.056 1.134c-.287.176-.3.19-.254.264.127.2 2.125 3.642 2.125 3.659l-3.39.019-2.013-3.376c-.034-.047-.122-.068-.344-.084l-.297-.02.037 3.48-3.075-.038zm3.016 2.288l.024.338c.014.186.024.729.024 1.206v.867l.582-.025c.32-.013.695-.049.833-.078.694-.146 1.048-.478 1.087-1.018.027-.378-.063-.636-.303-.87-.318-.309-.761-.416-1.733-.418Z"/></svg>',
      'Trakt': '<svg viewBox="0 0 24 24" width="13" height="13" fill="#ed1c24"><path d="m15.082 15.107-.73-.73 9.578-9.583a4.499 4.499 0 0 0-.115-.575L13.662 14.382l1.08 1.08-.73.73-1.81-1.81L23.422 3.144c-.075-.15-.155-.3-.25-.44L11.508 14.377l2.154 2.155-.73.73-7.193-7.199.73-.73 4.309 4.31L22.546 1.86A5.618 5.618 0 0 0 18.362 0H5.635A5.637 5.637 0 0 0 0 5.634V18.37A5.632 5.632 0 0 0 5.635 24h12.732C21.477 24 24 21.48 24 18.37V6.19l-8.913 8.918zm-4.314-2.155L6.814 8.988l.73-.73 3.954 3.96zm1.075-1.084-3.954-3.96.73-.73 3.959 3.96zm9.853 5.688a4.141 4.141 0 0 1-4.14 4.14H6.438a4.144 4.144 0 0 1-4.139-4.14V6.438A4.141 4.141 0 0 1 6.44 2.3h10.387v1.04H6.438c-1.71 0-3.099 1.39-3.099 3.1V17.55c0 1.71 1.39 3.105 3.1 3.105h11.117c1.71 0 3.1-1.395 3.1-3.105v-1.754h1.04v1.754z"/></svg>',
      'Letterboxd': '<svg viewBox="0 0 24 24" width="13" height="13" fill="#00e054"><path d="M8.224 14.352a4.447 4.447 0 0 1-3.775 2.092C1.992 16.444 0 14.454 0 12s1.992-4.444 4.45-4.444c1.592 0 2.988.836 3.774 2.092-.427.682-.673 1.488-.673 2.352s.246 1.67.673 2.352zM15.101 12c0-.864.247-1.67.674-2.352-.786-1.256-2.183-2.092-3.775-2.092s-2.989.836-3.775 2.092c.427.682.674 1.488.674 2.352s-.247 1.67-.674 2.352c.786 1.256 2.183 2.092 3.775 2.092s2.989-.836 3.775-2.092A4.42 4.42 0 0 1 15.1 12zm4.45-4.444a4.447 4.447 0 0 0-3.775 2.092c.427.682.673 1.488.673 2.352s-.246 1.67-.673 2.352a4.447 4.447 0 0 0 3.775 2.092C22.008 16.444 24 14.454 24 12s-1.992-4.444-4.45-4.444z"/></svg>',
      'TMDB': '<svg viewBox="0 0 38 14" height="13" width="35"><text x="0" y="11" font-family="-apple-system, system-ui, sans-serif" font-weight="900" font-size="12" fill="#01b4e4">TMDB</text></svg>',
      'Metacritic': '<svg viewBox="0 0 24 24" width="13" height="13" fill="#ffcc33"><path d="M11.99 0A12 12 0 1 0 24 12v-.014A12 12 0 0 0 11.99 0Zm-.055 2.564a9.399 9.399 0 0 1 9.407 9.389v.01a9.399 9.399 0 1 1-9.408-9.399Zm-1.61 17.198 2.046-2.046-3.94-3.94c-.165-.166-.345-.373-.442-.608-.221-.47-.318-1.203.221-1.742.664-.664 1.548-.387 2.406.47l3.788 3.788 2.046-2.046-3.954-3.954a2.48 2.48 0 0 1-.456-.622c-.263-.539-.25-1.216.235-1.7.677-.678 1.562-.429 2.544.553l3.677 3.677 2.046-2.046-3.982-3.982c-2.018-2.018-3.912-1.949-5.212-.65-.498.499-.802 1.024-.954 1.618a4.026 4.026 0 0 0-.055 1.686l-.027.028c-.996-.414-2.13-.166-3 .705-1.162 1.161-1.12 2.392-.982 3.11l-.042.043-1.009-.816-1.77 1.77a64.1 64.1 0 0 1 2.213 2.1z"/></svg>',
      'MC User': '<svg viewBox="0 0 24 24" width="13" height="13" fill="#ffcc33"><path d="M11.99 0A12 12 0 1 0 24 12v-.014A12 12 0 0 0 11.99 0Zm-.055 2.564a9.399 9.399 0 0 1 9.407 9.389v.01a9.399 9.399 0 1 1-9.408-9.399Zm-1.61 17.198 2.046-2.046-3.94-3.94c-.165-.166-.345-.373-.442-.608-.221-.47-.318-1.203.221-1.742.664-.664 1.548-.387 2.406.47l3.788 3.788 2.046-2.046-3.954-3.954a2.48 2.48 0 0 1-.456-.622c-.263-.539-.25-1.216.235-1.7.677-.678 1.562-.429 2.544.553l3.677 3.677 2.046-2.046-3.982-3.982c-2.018-2.018-3.912-1.949-5.212-.65-.498.499-.802 1.024-.954 1.618a4.026 4.026 0 0 0-.055 1.686l-.027.028c-.996-.414-2.13-.166-3 .705-1.162 1.161-1.12 2.392-.982 3.11l-.042.043-1.009-.816-1.77 1.77a64.1 64.1 0 0 1 2.213 2.1z"/></svg>',
      'Ebert': '<svg viewBox="0 0 24 24" height="13" width="13" fill="#ffffff"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>'
    };

    const chips = ratings.map(r => {
      // حساب النسبة المئوية للألوان
      const pct = r.max === 10 ? r.score * 10
                : r.max === 5  ? r.score * 20
                : r.score;

      const color = pct >= 70 ? '#34d399'  // أخضر
                  : pct >= 50 ? '#fbbf24'  // أصفر
                  : '#f87171';              // أحمر

      // عرض القيمة الخام
      const display = r.max === 5  ? `${r.score}/5`
                    : r.max === 10 ? `${r.score}/10`
                    : `${r.score}%`;

      // تمييز تقييمات الجمهور (User / Audience) بنص صغير
      let scoreText = display;
      if (r.source === 'MC User' || r.source === 'RT Aud') {
        const label = r.source === 'MC User' ? 'User' : 'Aud';
        scoreText += `<span style="font-size:9px; opacity:0.65; margin-inline-start:3px; font-weight:500; text-transform:uppercase; letter-spacing:0.5px;">${label}</span>`;
      }

      const iconContent = SVG_MAP[r.source] || r.icon;

      return `
        <span class="chip" title="${r.source}: ${display}">
          <span class="icon" aria-hidden="true">${iconContent}</span>
          <span class="score" style="color:${color}">${scoreText}</span>
        </span>
      `;
    }).join('');

    shadow.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-inline-start: 10px;
          flex-wrap: nowrap;
        }
        .label {
          font-size: 10px;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          font-family: -apple-system, system-ui, sans-serif;
          margin-inline-end: 2px;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 20px;
          padding: 2px 8px 2px 6px;
          cursor: default;
          transition: background 0.15s;
          font-family: -apple-system, system-ui, sans-serif;
        }
        .chip:hover { background: rgba(255,255,255,0.15); }
        .icon  { font-size: 11px; line-height: 1; display: flex; align-items: center; }
        .icon svg { height: 13px; width: auto; max-width: 40px; }
        .score { font-size: 12px; font-weight: 600; line-height: 1; }
      </style>
      <span class="label">Community</span>
      ${chips}
    `;
  }

})(); // نهاية IIFE الرئيسية — منطق التقييمات


// ==================== Web Style Customization ====================
// مستمع منفصل يعمل بشكل مستقل عن منطق التقييمات

(function StremioWebStyler() {
  'use strict';
  if (window.__sh_webStyler) return;
  window.__sh_webStyler = true;

  // تطبيق الستايل عند التحميل الأول
  applyWebStyles();

  // استقبال تحديثات فورية من الـ popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'UPDATE_WEB_STYLE') {
      applyWebStyles(msg);
      sendResponse({ success: true });
    }
  });

  async function applyWebStyles(overrides = {}) {
    let settings = {};
    try {
      settings = await chrome.storage.local.get(['webCustomFont', 'webCustomFontFile', 'webAccentColor', 'webOledEnabled']);
    } catch (err) {
      if (err.message && err.message.includes('Extension context invalidated')) return;
    }

    const font     = overrides.font        !== undefined ? overrides.font        : (settings.webCustomFont  || '');
    const accent   = overrides.accentColor !== undefined ? overrides.accentColor : (settings.webAccentColor || '');
    const oled     = overrides.oled        !== undefined ? overrides.oled        : (settings.webOledEnabled || false);

    if (!font && !accent && !oled) {
      const existing = document.getElementById('sh-custom-styles');
      if (existing) existing.remove();
      return;
    }

    let styleTag = document.getElementById('sh-custom-styles');
    if (!styleTag) {
      styleTag    = document.createElement('style');
      styleTag.id = 'sh-custom-styles';
      document.head.appendChild(styleTag);
    }

    let css = '';

    if (font) {
      if (font === 'Thmanyah') {
        try {
          const fontUrlReg = chrome.runtime.getURL('fonts/thmanyahsans-Regular.woff2');
          const fontUrlBold = chrome.runtime.getURL('fonts/thmanyahsans-Bold.woff2');
          css += `
            @font-face {
              font-family: 'Thmanyah';
              src: url('${fontUrlReg}') format('woff2');
              font-weight: normal;
              font-style: normal;
            }
            @font-face {
              font-family: 'Thmanyah';
              src: url('${fontUrlBold}') format('woff2');
              font-weight: bold;
              font-style: normal;
            }
          `;
        } catch (e) {}
        css += `html, body, #app, * { font-family: '${font}', sans-serif !important; }\n`;
      } else if (font === 'custom' && settings.webCustomFontFile) {
        css += `
          @font-face {
            font-family: 'StremioHubCustomFont';
            src: url('${settings.webCustomFontFile}');
          }
        `;
        css += `html, body, #app, * { font-family: 'StremioHubCustomFont', sans-serif !important; }\n`;
      } else if (font !== 'custom') {
        const linkId = `sh-font-${font.replace(/\s/g, '-')}`;
        if (!document.getElementById(linkId)) {
          const link  = document.createElement('link');
          link.id     = linkId;
          link.rel    = 'stylesheet';
          link.href   = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}&display=swap`;
          document.head.appendChild(link);
        }
        css += `html, body, #app, * { font-family: '${font}', sans-serif !important; }\n`;
      }
    }

    if (accent) {
      css += `
        /* إصلاح الألوان المميزة للروابط والنصوص والأيقونات المحددة */
        .selected, .selected > svg, .selected .label-BCz2f,
        .see-all-container-MoOtW, .see-all-container-MoOtW > svg, .see-all-container-MoOtW .label-bytni,
        a[class*="link-"]:not([class*="link-container"]),
        .label-PJvSJ {
          color: ${accent} !important;
          fill: ${accent} !important;
        }
        
        .selected > svg path, .see-all-container-MoOtW > svg path {
          stroke: ${accent} !important;
        }
        
        /* الأزرار الرئيسية في الموقع (مثل صفحة Login و Authenticate) */
        .button:not([class*="disabled"]) {
          background-color: ${accent} !important;
          border-color: ${accent} !important;
          color: #ffffff !important;
        }
        
        /* إصلاح ألوان الحواف (Borders) للقوائم المنسدلة وتبويبات الإعدادات والقوائم الجانبية */
        .selected,
        .button-DNmYL[class*="selected-"],
        [class*="multiselect"],
        [class*="search-input"]:focus-within {
          border-color: ${accent} !important;
        }

        /* إصلاح ألوان إطار التركيز (Focus Outline) لأي عنصر يتفاعل معه المستخدم */
        *:focus-visible, *:focus {
          outline-color: ${accent} !important;
        }

      `;
    }

    if (oled) {
      css += `
        /* وضع OLED للون أسود عميق */
        html, body, #app, 
        div[class*="routes-container"], 
        div[class*="route-container"], 
        div[class*="board-container"], 
        div[class*="nav-bars-container"], 
        div[class*="main-nav-bars-container"] nav[class*="nav-bar-container"], 
        div[class*="nav-content-container"],
        div[class*="settings-container"],
        div[class*="library-container"],
        div[class*="menu-container"]:not([class*="control-bar"]),
        div[class*="nav-menu-container"]:not([class*="control-bar"]),
        div[class*="modal-container"],
        div[class*="intro-container"],
        div[class*="auth-container"] {
          background-color: #000000 !important;
          background: #000000 !important;
        }
      `;
    }

    styleTag.textContent = css;
  }
})();
