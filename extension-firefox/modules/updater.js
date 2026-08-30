// modules/updater.js — فحص تحديثات الإضافة نفسها
//
// مكتوب بلا import/export مثل harbor-core.js ليعمل في السياقين:
//   • background.js (ES module) → import './modules/updater.js'
//   • popup.html (سكربت كلاسيكي) → <script src="../modules/updater.js">
// ويضع الواجهة على globalThis.ExtUpdater
//
// ── لماذا يوجد هذا الملف؟ ──
// التحديث التلقائي الحقيقي متاح في حالتين فقط:
//   • فايرفوكس: عبر browser_specific_settings.gecko.update_url + نسخة XPI
//     موقّعة من موزيلا. عندها يحدّث فايرفوكس الإضافة وحده، وهذا الملف
//     يصبح مجرد شاشة عرض لرقم النسخة.
//   • كروم: عبر متجر Chrome، أو نسخة CRX مستضافة ذاتياً (على لينكس فقط،
//     أو عبر سياسة المؤسسات على ويندوز وماك).
// أما النسخة المحمَّلة يدوياً (Load unpacked) فلا تُحدَّث تلقائياً أبداً،
// ولهذا نفحص إصدارات GitHub ونُعلم المستخدم بدل أن يتفقّدها بنفسه.

(function () {
  'use strict';

  const REPO = 'ABADIOSA/ABADIOSA';
  const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
  const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

  const STATE_KEY = 'updateState';
  const SETTING_KEY = 'autoUpdateCheck';
  const ALARM = 'extension-update-check';
  const CHECK_INTERVAL_MIN = 60 * 6;
  // لا نُرهق واجهة GitHub: فحص واحد كل ساعتين كحدّ أقصى ما لم يُطلب صراحةً
  const MIN_GAP_MS = 1000 * 60 * 120;

  // ==================== مقارنة الإصدارات ====================

  /** "v1.7.0" أو "1.7.0.2" → [1, 7, 0, 2] */
  function parseVersion(value) {
    return String(value || '')
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });
  }

  /** يرجّع 1 إذا a أحدث، ‎-1 إذا b أحدث، 0 إذا متساويتان */
  function compareVersions(a, b) {
    const va = parseVersion(a);
    const vb = parseVersion(b);
    const len = Math.max(va.length, vb.length);
    for (let i = 0; i < len; i++) {
      const x = va[i] ?? 0;
      const y = vb[i] ?? 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  function currentVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return '0.0.0';
    }
  }

  /**
   * هل يحدّث المتصفح هذه النسخة وحده؟
   * وجود update_url (فايرفوكس) أو installType === 'normal' (متجر/CRX)
   * يعني أن التحديث تلقائي فعلاً ولا داعي لمطالبة المستخدم بتنزيل ملف.
   */
  async function isSelfUpdating() {
    try {
      const manifest = chrome.runtime.getManifest();
      if (manifest.update_url) return true;
      if (manifest.browser_specific_settings?.gecko?.update_url) return true;
    } catch { /* نكمل */ }

    try {
      const info = await chrome.management.getSelf();
      // 'development' = محمَّلة يدوياً، 'normal' = من متجر أو رابط تحديث
      return info?.installType === 'normal';
    } catch {
      // صلاحية management غير مطلوبة — غيابها ليس خطأً
      return false;
    }
  }

  // ==================== الحالة المحفوظة ====================

  async function getState() {
    try {
      const stored = await chrome.storage.local.get([STATE_KEY, SETTING_KEY, 'dismissedUpdate']);
      return {
        enabled: stored[SETTING_KEY] !== false,
        dismissedUpdate: stored.dismissedUpdate || null,
        ...(stored[STATE_KEY] || {})
      };
    } catch {
      return { enabled: true, dismissedUpdate: null };
    }
  }

  async function setEnabled(enabled) {
    await chrome.storage.local.set({ [SETTING_KEY]: !!enabled });
    if (!enabled) {
      await chrome.storage.local.remove(STATE_KEY);
      await refreshBadge();
    }
  }

  /** يُخفي شارة نسخة بعينها حتى تصدر نسخة أحدث منها */
  async function dismiss(version) {
    await chrome.storage.local.set({ dismissedUpdate: version });
    await refreshBadge();
  }

  // ==================== الفحص ====================

  /**
   * يفحص أحدث إصدار على GitHub.
   * force = true يتجاوز مهلة التهدئة (زر "تحقق الآن").
   * يرجّع { current, latest, hasUpdate, url, notes, publishedAt, checkedAt, error? }
   */
  async function check({ force = false } = {}) {
    const state = await getState();
    const current = currentVersion();

    if (!state.enabled && !force) {
      return { current, hasUpdate: false, disabled: true };
    }

    if (!force && state.checkedAt && Date.now() - state.checkedAt < MIN_GAP_MS) {
      return { ...state, current, fromCache: true };
    }

    let result;
    try {
      const res = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });

      if (res.status === 404) {
        // لا توجد إصدارات منشورة بعد — ليست حالة خطأ
        result = { current, latest: null, hasUpdate: false, checkedAt: Date.now() };
      } else if (!res.ok) {
        throw new Error(`http_${res.status}`);
      } else {
        const data = await res.json();
        const latest = String(data.tag_name || data.name || '').replace(/^v/i, '');
        result = {
          current,
          latest,
          hasUpdate: !!latest && compareVersions(latest, current) > 0,
          url: data.html_url || RELEASES_PAGE,
          notes: typeof data.body === 'string' ? data.body.slice(0, 2000) : '',
          publishedAt: data.published_at || null,
          checkedAt: Date.now()
        };
      }
    } catch (err) {
      result = {
        current,
        hasUpdate: false,
        checkedAt: Date.now(),
        error: err?.name === 'TimeoutError' ? 'timeout' : (err?.message || 'unreachable')
      };
    }

    try {
      await chrome.storage.local.set({ [STATE_KEY]: result });
    } catch { /* التخزين اختياري هنا */ }

    await refreshBadge();
    return result;
  }

  // ==================== الشارة ====================

  /**
   * شارة أيقونة الإضافة مشتركة بين تحديثات الإضافة وتحديثات إضافات Stremio.
   * تحديث الإضافة نفسها له الأولوية لأنه يخصّ الأداة التي يستعملها المستخدم.
   */
  async function refreshBadge() {
    try {
      const { updateState, addonUpdates = [], dismissedUpdate } =
        await chrome.storage.local.get(['updateState', 'addonUpdates', 'dismissedUpdate']);

      const pendingSelf =
        updateState?.hasUpdate &&
        (!dismissedUpdate || compareVersions(updateState.latest, dismissedUpdate) > 0);

      if (pendingSelf) {
        await chrome.action.setBadgeText({ text: '↑' });
        await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
        return;
      }

      const count = addonUpdates.length;
      if (count > 0) {
        await chrome.action.setBadgeText({ text: String(count) });
        await chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
      } else {
        await chrome.action.setBadgeText({ text: '' });
      }
    } catch { /* الشارة غير متاحة في بعض السياقات */ }
  }

  // ==================== التصدير ====================

  globalThis.ExtUpdater = {
    REPO,
    RELEASES_API,
    RELEASES_PAGE,
    STATE_KEY,
    SETTING_KEY,
    ALARM,
    CHECK_INTERVAL_MIN,
    parseVersion,
    compareVersions,
    currentVersion,
    isSelfUpdating,
    getState,
    setEnabled,
    dismiss,
    check,
    refreshBadge
  };
})();
