// modules/harbor-core.js — جسر التكامل مع مشغّل Harbor
// https://github.com/harborstremio/harbor
//
// هذا الملف مكتوب بدون import/export حتى يعمل في الحالتين:
//   • background.js (وهو ES module)  →  import './modules/harbor-core.js'
//   • popup.html (سكربت كلاسيكي)     →  <script src="../modules/harbor-core.js">
// وفي الحالتين يضع الواجهة على globalThis.HarborCore
//
// ── ما الذي يعتمد عليه هذا الجسر من Harbor؟ ──
// 1) خادم Harbor المحلي على المنفذ 11471 (src-tauri/src/web_server.rs)
//    ويعمل فقط عندما تُفعّل في Harbor: Settings → Remote Control أو Serve Web UI.
//    - GET  /            → واجهة Harbor على الويب
//    - GET  /remote      → واجهة الريموت (للجوال)
//    - WS   /api/remote  → بروتوكول الريموت
// 2) روابط النظام العميقة: stremio:// و harbor:// (tauri.conf.json → deep-link.schemes)

(function () {
  'use strict';

  // ==================== الثوابت ====================

  // مطابقة لـ harbor/src/lib/remote/protocol.ts
  const REMOTE_PROTO = 1;
  const REMOTE_WS_PATH = '/api/remote';
  const DEFAULT_PORT = 11471;
  const DEFAULT_HOST = '127.0.0.1';

  const STORAGE_KEY = 'harborConfig';

  const DEFAULT_CONFIG = {
    // تشغيل التكامل كاملاً
    enabled: false,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    // كيف نفتح عملاً في Harbor:
    //   'deeplink' → stremio://detail/... (يحتاج Harbor مسجَّلاً كمعالج للرابط)
    //   'remote'   → عبر الريموت: افتح البحث واكتب الاسم (يحتاج الخادم شغّالاً)
    //   'web'      → افتح واجهة Harbor على http://host:port
    openMode: 'deeplink',
    // نسخ تثبيت الإضافات إلى Harbor عبر رابط harbor:// أيضاً
    mirrorAddons: false
  };

  // ==================== الإعدادات ====================

  async function getConfig() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      return { ...DEFAULT_CONFIG, ...(stored[STORAGE_KEY] || {}) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  async function setConfig(patch) {
    const current = await getConfig();
    const next = { ...current, ...patch };
    // تنظيف المدخلات قبل الحفظ
    next.host = normalizeHost(next.host);
    next.port = normalizePort(next.port);
    if (!['deeplink', 'remote', 'web'].includes(next.openMode)) next.openMode = 'deeplink';
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  }

  function normalizeHost(host) {
    let h = String(host || '').trim();
    if (!h) return DEFAULT_HOST;
    // اقبل لو لصق المستخدم رابطاً كاملاً
    h = h.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
    // انزع المنفذ إن وُجد (لكن لا تكسر IPv6 المكتوب بين قوسين)
    if (!h.startsWith('[')) h = h.replace(/:\d+$/, '');
    return h || DEFAULT_HOST;
  }

  function normalizePort(port) {
    const p = parseInt(port, 10);
    if (!Number.isFinite(p) || p < 1 || p > 65535) return DEFAULT_PORT;
    return p;
  }

  // ==================== بناء الروابط ====================

  function baseUrl(cfg) {
    return `http://${normalizeHost(cfg.host)}:${normalizePort(cfg.port)}`;
  }

  /** واجهة Harbor الكاملة على المتصفح */
  function webUiUrl(cfg) {
    return `${baseUrl(cfg)}/`;
  }

  /** واجهة الريموت المخصّصة للجوال */
  function remoteUiUrl(cfg) {
    return `${baseUrl(cfg)}/remote`;
  }

  function remoteWsUrl(cfg) {
    return `ws://${normalizeHost(cfg.host)}:${normalizePort(cfg.port)}${REMOTE_WS_PATH}`;
  }

  /**
   * رابط عميق لفتح صفحة العمل داخل Harbor.
   * Harbor يسجّل مخطط stremio:// ويحلّله في parseStremioOpen (src/lib/deep-link.ts)
   * بالصيغة: stremio://detail/<type>/<id>[/<videoId>]
   */
  function detailDeepLink(mediaType, id, videoId) {
    const type = encodeURIComponent(mediaType || 'movie');
    const itemId = encodeURIComponent(id);
    // ثلاث شرطات = الصيغة القياسية التي يستعملها تطبيق Stremio، و Harbor يقبلها
    const base = `stremio:///detail/${type}/${itemId}`;
    return videoId ? `${base}/${encodeURIComponent(videoId)}` : base;
  }

  /**
   * رابط تثبيت إضافة في Harbor.
   * أي رابط يبدأ بـ harbor:// يمرّره Harbor إلى نافذة تثبيت الإضافات،
   * وكذلك أي رابط يحتوي على manifest.json (shouldForward في deep-link.ts).
   */
  function addonInstallLink(manifestUrl) {
    const url = String(manifestUrl || '').trim();
    if (!url) return null;
    return 'harbor://' + url.replace(/^[a-z]+:\/\//i, '');
  }

  /**
   * يستخرج معرّف العمل ونوعه من رابط موقع مدعوم.
   * IMDb يعطينا المعرّف مباشرةً؛ بقية المواقع نأخذ منها العنوان للبحث.
   */
  function parseMediaLink(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      const path = u.pathname;
  
      const imdb = path.match(/\/title\/(tt\d+)/);
      if (host.endsWith('imdb.com') && imdb) {
        return { imdbId: imdb[1] };
      }
  
      if (host.endsWith('themoviedb.org')) {
        const m = path.match(/\/(movie|tv)\/\d+-([^/]+)/);
        if (m) {
          return {
            mediaType: m[1] === 'tv' ? 'series' : 'movie',
            query: decodeURIComponent(m[2]).replace(/-/g, ' ')
          };
        }
      }
  
      if (host.endsWith('letterboxd.com')) {
        const m = path.match(/\/film\/([^/]+)/);
        if (m) return { mediaType: 'movie', query: m[1].replace(/-/g, ' ') };
      }
  
      if (host.endsWith('trakt.tv')) {
        const m = path.match(/\/(movies|shows)\/([^/]+)/);
        if (m) {
          return {
            mediaType: m[1] === 'shows' ? 'series' : 'movie',
            // Trakt يلحق سنة بالـ slug أحياناً: the-matrix-1999
            query: m[2].replace(/-\d{4}$/, '').replace(/-/g, ' ')
          };
        }
      }
    } catch { /* رابط غير صالح */ }
    return null;
  }
  
  chrome.runtime.onInstalled.addListener(() => {
    updateContextMenu();
    // جدولة فحص التحديثات كل 24 ساعة
    chrome.alarms.create('addon-update-check', { periodInMinutes: 60 * 24 });
  });

  // ==================== فحص الاتصال ====================

  /**
   * يتحقق من أن خادم Harbor المحلي يعمل.
   * الخادم يقدّم واجهة Harbor على "/" لذلك نطلبها بمهلة قصيرة.
   * ملاحظة: الخادم لا يضيف ترويسات CORS، لذلك نستخدم no-cors ونعتبر
   * أي استجابة (حتى opaque) دليلاً على أن المنفذ مفتوح ويستجيب.
   */
  async function probe(cfg, timeoutMs = 2500) {
    const conf = cfg || (await getConfig());
    const url = webUiUrl(conf);
    const started = Date.now();
    try {
      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs)
      });
      return { online: true, ms: Date.now() - started, url };
    } catch (err) {
      return {
        online: false,
        ms: Date.now() - started,
        url,
        error: err?.name === 'TimeoutError' ? 'timeout' : (err?.message || 'unreachable')
      };
    }
  }

  // ==================== عميل الريموت (WebSocket) ====================

  /**
   * عميل بروتوكول ريموت Harbor.
   *
   * الاستعمال:
   *   const remote = HarborCore.createRemote(cfg);
   *   remote.on('snapshot', s => render(s));
   *   remote.connect();
   *   remote.send({ action: 'pause' });
   *
   * الأحداث: 'status' | 'hello' | 'snapshot' | 'error' | 'close'
   */
  function createRemote(cfg, options = {}) {
    const {
      autoReconnect = true,
      pingIntervalMs = 15000,
      maxBackoffMs = 15000
    } = options;

    const listeners = new Map();
    let ws = null;
    let closedByUs = false;
    let attempt = 0;
    let pingTimer = 0;
    let reconnectTimer = 0;
    let lastSnapshot = null;
    let status = 'idle'; // idle | connecting | connected | reconnecting | closed | error

    function emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const fn of set) {
        try { fn(payload); } catch (err) { console.warn('[HarborCore] listener failed', err); }
      }
    }

    function setStatus(next, detail) {
      status = next;
      emit('status', { status: next, detail });
    }

    function clearTimers() {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = 0; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = 0; }
    }

    function scheduleReconnect() {
      if (!autoReconnect || closedByUs) return;
      attempt += 1;
      const delay = Math.min(500 * Math.pow(2, attempt - 1), maxBackoffMs);
      setStatus('reconnecting', { attempt, delay });
      reconnectTimer = setTimeout(() => { reconnectTimer = 0; open(); }, delay);
    }

    function open() {
      clearTimers();
      let url;
      try {
        url = remoteWsUrl(cfg);
      } catch (err) {
        setStatus('error', { message: 'bad_url' });
        return;
      }
      setStatus('connecting');
      try {
        ws = new WebSocket(url);
      } catch (err) {
        setStatus('error', { message: err?.message || 'ws_failed' });
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        setStatus('connected');
        rawSend({ t: 'hello', client: 'harbor-remote', proto: REMOTE_PROTO });
        pingTimer = setInterval(() => send({ action: 'ping' }), pingIntervalMs);
      };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'snapshot' && msg.snapshot) {
          lastSnapshot = msg.snapshot;
          emit('snapshot', msg.snapshot);
        } else if (msg.t === 'hello') {
          emit('hello', msg);
        } else if (msg.t === 'error') {
          emit('error', msg);
        }
        // 'pong' لا يحتاج معالجة، وجوده وحده يكفي كإشارة حياة
      };

      ws.onerror = () => {
        // onclose سيُستدعى بعدها ويتكفّل بإعادة المحاولة
        setStatus('error', { message: 'socket_error' });
      };

      ws.onclose = () => {
        clearTimers();
        ws = null;
        if (closedByUs) {
          setStatus('closed');
          emit('close', { byUs: true });
          return;
        }
        emit('close', { byUs: false });
        scheduleReconnect();
      };
    }

    function rawSend(obj) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify(obj));
        return true;
      } catch {
        return false;
      }
    }

    return {
      connect() {
        closedByUs = false;
        attempt = 0;
        open();
        return this;
      },
      close() {
        closedByUs = true;
        clearTimers();
        if (ws) { try { ws.close(); } catch { /* تم إغلاقه أصلاً */ } }
        ws = null;
        setStatus('closed');
      },
      /** إرسال أمر واحد من RemoteCommand في بروتوكول Harbor */
      send(command) {
        return rawSend({ t: 'cmd', command });
      },
      on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return () => listeners.get(event)?.delete(fn);
      },
      get status() { return status; },
      get snapshot() { return lastSnapshot; },
      get connected() { return status === 'connected'; }
    };
  }

  // ==================== أوامر لمرة واحدة ====================

  /**
   * يفتح اتصالاً قصيراً، ينفّذ steps، ثم يغلق.
   * مفيد من الـ background حيث لا نريد إبقاء WebSocket مفتوحاً.
   * steps: مصفوفة من { command, delay } تُرسَل بالترتيب.
   */
  function runOnce(cfg, steps, timeoutMs = 6000) {
    return new Promise((resolve) => {
      let ws;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        if (ws) { try { ws.close(); } catch { /* لا شيء */ } }
        resolve(result);
      };
      const guard = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);

      try {
        ws = new WebSocket(remoteWsUrl(cfg));
      } catch (err) {
        finish({ ok: false, error: err?.message || 'ws_failed' });
        return;
      }

      ws.onerror = () => finish({ ok: false, error: 'unreachable' });
      ws.onclose = () => finish({ ok: false, error: 'closed_early' });

      ws.onopen = async () => {
        try {
          ws.send(JSON.stringify({ t: 'hello', client: 'harbor-remote', proto: REMOTE_PROTO }));
          for (const step of steps) {
            if (step.delay) await sleep(step.delay);
            if (!ws || ws.readyState !== WebSocket.OPEN) {
              finish({ ok: false, error: 'closed_early' });
              return;
            }
            ws.send(JSON.stringify({ t: 'cmd', command: step.command }));
          }
          // امنح Harbor لحظة لتنفيذ آخر أمر قبل الإغلاق
          await sleep(200);
          finish({ ok: true });
        } catch (err) {
          finish({ ok: false, error: err?.message || 'send_failed' });
        }
      };
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * يدفع عبارة بحث إلى Harbor:
   *   openSearch → (مهلة ليركّب الحقل) → setText → submitText
   * يقابل: harbor/src/lib/remote/session.ts → dispatchRemoteCommand
   */
  function pushSearch(cfg, query) {
    const q = String(query || '').trim();
    if (!q) return Promise.resolve({ ok: false, error: 'empty_query' });
    return runOnce(cfg, [
      { command: { action: 'openSearch' } },
      { command: { action: 'setText', value: q }, delay: 450 },
      { command: { action: 'submitText', value: q }, delay: 250 }
    ]);
  }

  /**
   * يفتح اتصالاً قصيراً، ينتظر أول لقطة من Harbor، ثم يمرّرها إلى decide
   * ليقرّر الأمر المناسب. مفيد للأوامر التي تعتمد على الحالة الحالية —
   * مثل "تشغيل/إيقاف" الذي يحتاج معرفة إن كان يعمل الآن.
   *
   * decide(snapshot) يرجّع أمراً، أو null لإلغاء الإرسال.
   * يرجّع { ok, snapshot?, command?, error? }
   */
  function withSnapshot(cfg, decide, timeoutMs = 6000) {
    return new Promise((resolve) => {
      let ws;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        if (ws) { try { ws.close(); } catch { /* لا شيء */ } }
        resolve(result);
      };
      const guard = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);

      try {
        ws = new WebSocket(remoteWsUrl(cfg));
      } catch (err) {
        finish({ ok: false, error: err?.message || 'ws_failed' });
        return;
      }

      ws.onerror = () => finish({ ok: false, error: 'unreachable' });
      ws.onclose = () => finish({ ok: false, error: 'closed_early' });

      ws.onopen = () => {
        // Harbor يبثّ لقطة فور انضمام أي عميل، والـ hello يطلبها صراحةً أيضاً
        ws.send(JSON.stringify({ t: 'hello', client: 'harbor-remote', proto: REMOTE_PROTO }));
      };

      // Harbor يرسل أكثر من لقطة على الاتصال الواحد (واحدة عند الانضمام
      // وأخرى رداً على hello). نتصرّف على أول لقطة فقط: القرار يعتمد على
      // الحالة، فلو أعدنا التقييم على لقطة تالية لأرسلنا أمراً يُلغي الأول
      // — "أوقف" ثم "شغّل" مثلاً، فلا يحدث شيء.
      let acted = false;

      ws.onmessage = async (event) => {
        if (acted || settled) return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg?.t !== 'snapshot' || !msg.snapshot) return;
        acted = true;

        let command;
        try {
          command = decide(msg.snapshot);
        } catch (err) {
          finish({ ok: false, error: err?.message || 'decide_failed', snapshot: msg.snapshot });
          return;
        }
        if (!command) {
          finish({ ok: true, snapshot: msg.snapshot, command: null });
          return;
        }
        ws.send(JSON.stringify({ t: 'cmd', command }));
        // امنح Harbor لحظة لتنفيذ الأمر قبل الإغلاق
        await sleep(200);
        finish({ ok: true, snapshot: msg.snapshot, command });
      };
    });
  }

  /** تبديل التشغيل/الإيقاف اعتماداً على حالة Harbor الحالية */
  function togglePlayback(cfg) {
    return withSnapshot(cfg, (snap) => {
      if (snap.idle) return null;
      return { action: snap.playing ? 'pause' : 'play' };
    });
  }

  /** أمر ريموت واحد (تشغيل/إيقاف/... ) من سياق لا يبقي اتصالاً مفتوحاً */
  function sendCommandOnce(cfg, command) {
    return runOnce(cfg, [{ command }]);
  }

  // ==================== التصدير ====================

  globalThis.HarborCore = {
    REMOTE_PROTO,
    REMOTE_WS_PATH,
    DEFAULT_HOST,
    DEFAULT_PORT,
    DEFAULT_CONFIG,
    STORAGE_KEY,
    getConfig,
    setConfig,
    normalizeHost,
    normalizePort,
    baseUrl,
    webUiUrl,
    remoteUiUrl,
    remoteWsUrl,
    detailDeepLink,
    addonInstallLink,
    parseMediaLink,
    probe,
    createRemote,
    runOnce,
    pushSearch,
    sendCommandOnce,
    withSnapshot,
    togglePlayback
  };
})();
