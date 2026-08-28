/* واجهة تطبيق البريد المؤقت — بلا أي مكتبات خارجية. */
"use strict";

const TOKEN = window.__AUTH_TOKEN__;
const $ = (id) => document.getElementById(id);

const state = {
  providers: [],
  accounts: [],
  settings: null,
  activeAccountId: null,
  messages: [],
  activeMessageId: null,
  activeMessage: null,
  seenIds: {},        // معرّفات الرسائل المقروءة محليًا: { accountId: Set }
  knownIds: {},       // لاكتشاف الجديد دون تنبيه كاذب عند أول تحميل
  showImages: false,
  timer: null,
  countdownTimer: null,
  nextRefreshAt: 0,
  loadingMessages: false,
};

/* ============================ طبقة الاتصال ============================ */

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "X-Auth-Token": TOKEN,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    /* رد بلا محتوى */
  }
  if (!response.ok) {
    throw new Error((data && data.error) || `فشل الطلب (${response.status})`);
  }
  return data;
}

/* ================================ أدوات ================================ */

function toast(message, kind = "info", ms = 3600) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function formatTime(iso) {
  const date = new Date(iso);
  if (isNaN(date)) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ar", { day: "numeric", month: "short" });
}

function formatFullDate(iso) {
  const date = new Date(iso);
  if (isNaN(date)) return "";
  return date.toLocaleString("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatSize(bytes) {
  if (!bytes) return "";
  const units = ["بايت", "ك.ب", "م.ب"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // بديل يعمل حتى بدون صلاحية الحافظة.
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand("copy");
    helper.remove();
    return ok;
  }
}

function beep() {
  if (!state.settings || !state.settings.notify_sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    setTimeout(() => ctx.close(), 600);
  } catch (_) {
    /* الصوت ليس ضروريًا */
  }
}

/** يستخرج رمز تحقق من نص الرسالة إن وُجد — مفيد جدًا لرسائل التسجيل. */
function extractCode(message) {
  const haystack = `${message.subject || ""}\n${message.text || stripHtml(message.html || "")}`;
  const patterns = [
    /(?:رمز|كود|code|otp|pin|verification)[^0-9]{0,24}(\d{4,8})/i,
    /\b(\d{6})\b/,
    /\b(\d{4,8})\b(?=[^\d]{0,40}(?:رمز|code|verify|تحقق))/i,
  ];
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* ============================ حالة القراءة ============================ */

function seenSet(accountId) {
  if (!state.seenIds[accountId]) {
    try {
      const raw = localStorage.getItem(`seen:${accountId}`);
      state.seenIds[accountId] = new Set(raw ? JSON.parse(raw) : []);
    } catch (_) {
      state.seenIds[accountId] = new Set();
    }
  }
  return state.seenIds[accountId];
}

function markSeen(accountId, messageId) {
  const set = seenSet(accountId);
  if (set.has(messageId)) return;
  set.add(messageId);
  try {
    // نحتفظ بآخر 500 معرّف فقط حتى لا ينتفخ التخزين.
    localStorage.setItem(`seen:${accountId}`, JSON.stringify([...set].slice(-500)));
  } catch (_) {
    /* التخزين قد يكون معطّلًا */
  }
}

function isUnread(accountId, message) {
  return !message.seen && !seenSet(accountId).has(message.id);
}

/* ============================== المزوّدات ============================== */

function renderProviders() {
  const select = $("provider-select");
  select.innerHTML = "";
  for (const provider of state.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.ready ? provider.name : `${provider.name} (يحتاج إعداد)`;
    select.appendChild(option);
  }
  // نتحقّق أن المزوّد المحفوظ ما زال موجودًا، وإلا وقع الاختيار على الأول.
  const ids = state.providers.map((p) => p.id);
  const saved = state.settings && state.settings.last_provider;
  const preferred = ids.includes(saved) ? saved : ids[0];
  if (preferred) select.value = preferred;
  onProviderChange();
}

function currentProvider() {
  return state.providers.find((p) => p.id === $("provider-select").value) || null;
}

async function onProviderChange() {
  const provider = currentProvider();
  const hint = $("provider-hint");
  if (!provider) return;

  hint.textContent = provider.ready ? provider.description : provider.setup_hint;
  $("local-input").disabled = !provider.supports_custom_local;
  await loadDomains();
  updatePreview();
}

async function loadDomains() {
  const provider = currentProvider();
  const select = $("domain-select");
  if (!provider) return;

  select.innerHTML = `<option value="">جارٍ التحميل…</option>`;
  if (!provider.ready) {
    select.innerHTML = `<option value="">أكمل الإعداد أولًا</option>`;
    return;
  }
  try {
    const data = await api(`/api/domains?provider=${encodeURIComponent(provider.id)}`);
    select.innerHTML = "";
    if (!data.domains.length) {
      select.innerHTML = `<option value="">لا توجد دومينات متاحة</option>`;
      return;
    }
    for (const domain of data.domains) {
      const option = document.createElement("option");
      option.value = domain;
      option.textContent = domain;
      select.appendChild(option);
    }
  } catch (error) {
    select.innerHTML = `<option value="">تعذّر جلب الدومينات</option>`;
    toast(error.message, "err", 6000);
  }
  updatePreview();
}

function updatePreview() {
  const preview = $("address-preview");
  const domain = $("domain-select").value;
  const local = $("local-input").value.trim();
  preview.textContent = "";

  if (!domain) {
    preview.textContent = "—";
    return;
  }
  // نبقي المعاينة لاتينية بالكامل: خلط العربية داخل سطر LTR يكسر ترتيب الحروف.
  // شرح «اتركه فارغًا للعشوائي» موجود أصلًا في حقل الإدخال.
  const prefix = (currentProvider() || {}).address_prefix || "";
  preview.textContent = `${prefix}${local || "random"}@${domain}`;
}

/* ============================== العناوين ============================== */

function providerName(id) {
  return (state.providers.find((p) => p.id === id) || {}).name || id;
}

function renderAccounts() {
  const list = $("accounts-list");
  list.innerHTML = "";
  $("accounts-count").textContent = state.accounts.length;
  $("accounts-empty").hidden = state.accounts.length > 0;

  for (const account of state.accounts) {
    const item = document.createElement("li");
    item.className = "account-item" + (account.id === state.activeAccountId ? " active" : "");

    const main = document.createElement("div");
    main.className = "account-main";
    main.innerHTML =
      `<span class="account-address">${escapeHtml(account.address)}</span>` +
      `<span class="account-provider">${escapeHtml(providerName(account.provider))}</span>`;
    main.addEventListener("click", () => selectAccount(account.id));

    const del = document.createElement("button");
    del.className = "account-del";
    del.textContent = "🗑";
    del.title = "حذف العنوان";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      removeAccount(account);
    });

    item.appendChild(main);

    const unread = (state.unreadCounts || {})[account.id] || 0;
    if (unread > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = unread;
      item.appendChild(badge);
    }

    item.appendChild(del);
    list.appendChild(item);
  }
}

async function createAccount() {
  const provider = currentProvider();
  const domain = $("domain-select").value;
  if (!provider) return;
  if (!domain) {
    toast("اختر دومينًا أولًا", "err");
    return;
  }

  const button = $("create-btn");
  button.disabled = true;
  button.textContent = "جارٍ الإنشاء…";
  try {
    const data = await api("/api/accounts", {
      method: "POST",
      body: JSON.stringify({
        provider: provider.id,
        domain,
        local: $("local-input").value.trim(),
      }),
    });
    state.accounts.unshift(data.account);
    $("local-input").value = "";
    updatePreview();
    renderAccounts();
    await selectAccount(data.account.id);
    await saveSettingsPartial({ last_provider: provider.id });
    toast(`تم إنشاء ${data.account.address}`, "ok");
    await copyText(data.account.address);
  } catch (error) {
    toast(error.message, "err", 7000);
  } finally {
    button.disabled = false;
    button.textContent = "إنشاء العنوان";
  }
}

async function removeAccount(account) {
  if (!confirm(`حذف العنوان ${account.address}؟\nلن تتمكن من استقبال رسائله بعد ذلك.`)) return;
  try {
    await api(`/api/accounts/${account.id}`, { method: "DELETE" });
    state.accounts = state.accounts.filter((a) => a.id !== account.id);
    if (state.activeAccountId === account.id) {
      state.activeAccountId = null;
      state.messages = [];
      clearMessageView();
      renderMessages();
      $("current-address").textContent = "اختر عنوانًا";
      $("copy-address").hidden = true;
    }
    renderAccounts();
    toast("تم حذف العنوان", "ok");
  } catch (error) {
    toast(error.message, "err");
  }
}

async function selectAccount(accountId) {
  state.activeAccountId = accountId;
  state.messages = [];
  state.activeMessageId = null;
  clearMessageView();
  renderAccounts();

  const account = state.accounts.find((a) => a.id === accountId);
  $("current-address").textContent = account ? account.address : "اختر عنوانًا";
  $("copy-address").hidden = !account;
  $("messages-placeholder-text").textContent = "لا توجد رسائل بعد — سيصلك التنبيه فور وصول رسالة";
  renderMessages();
  await refreshMessages();
  scheduleRefresh();
}

/* =============================== الرسائل =============================== */

function renderMessages() {
  const list = $("messages-list");
  const placeholder = $("messages-placeholder");
  list.innerHTML = "";

  if (!state.activeAccountId) {
    placeholder.hidden = false;
    $("messages-placeholder-text").textContent = "أنشئ عنوانًا لتبدأ باستقبال الرسائل";
    return;
  }
  if (!state.messages.length) {
    placeholder.hidden = false;
    return;
  }
  placeholder.hidden = true;

  for (const message of state.messages) {
    const item = document.createElement("li");
    const unread = isUnread(state.activeAccountId, message);
    item.className =
      "message-item" + (unread ? " unread" : "") +
      (message.id === state.activeMessageId ? " active" : "");

    const sender = message.from_name || message.from_address || "مُرسل غير معروف";
    item.innerHTML =
      `<div class="msg-row">` +
      `<span class="msg-sender">${escapeHtml(sender)}</span>` +
      `<span class="msg-time">${formatTime(message.date)}</span>` +
      `</div>` +
      `<span class="msg-subject">${escapeHtml(message.subject)}</span>` +
      (message.intro ? `<span class="msg-intro">${escapeHtml(message.intro)}</span>` : "") +
      (message.has_attachments ? `<span class="clip">📎 مرفقات</span>` : "");

    item.addEventListener("click", () => openMessage(message.id));
    list.appendChild(item);
  }
  updateUnreadCounts();
}

function updateUnreadCounts() {
  if (!state.activeAccountId) return;
  state.unreadCounts = state.unreadCounts || {};
  state.unreadCounts[state.activeAccountId] =
    state.messages.filter((m) => isUnread(state.activeAccountId, m)).length;
  renderAccountsBadgesOnly();
}

function renderAccountsBadgesOnly() {
  // إعادة رسم القائمة كاملة أبسط وأدق من تتبّع كل شارة على حدة.
  const list = $("accounts-list");
  if (!list) return;
  const scroll = list.scrollTop;
  renderAccounts();
  list.scrollTop = scroll;
}

async function refreshMessages({ silent = false } = {}) {
  if (!state.activeAccountId || state.loadingMessages) return;
  state.loadingMessages = true;
  const accountId = state.activeAccountId;

  try {
    const data = await api(`/api/accounts/${accountId}/messages`);
    if (state.activeAccountId !== accountId) return;  // بدّل المستخدم العنوان أثناء الجلب

    $("list-error").hidden = true;
    const incoming = data.messages || [];

    // اكتشاف الرسائل الجديدة (بعد أول تحميل فقط).
    const known = state.knownIds[accountId];
    const freshIds = incoming.map((m) => m.id);
    if (known) {
      const added = freshIds.filter((id) => !known.has(id));
      if (added.length) {
        beep();
        toast(`وصلت ${added.length} رسالة جديدة`, "ok");
      }
    }
    state.knownIds[accountId] = new Set(freshIds);
    state.messages = incoming;
    renderMessages();
  } catch (error) {
    if (!silent) {
      const banner = $("list-error");
      banner.textContent = error.message;
      banner.hidden = false;
    }
  } finally {
    state.loadingMessages = false;
  }
}

function clearMessageView() {
  $("message-view").hidden = true;
  $("view-placeholder").hidden = false;
  $("app").classList.remove("viewing");
  state.activeMessage = null;
}

async function openMessage(messageId) {
  const accountId = state.activeAccountId;
  state.activeMessageId = messageId;
  state.showImages = !!(state.settings && state.settings.load_remote_images);
  renderMessages();

  try {
    const data = await api(`/api/accounts/${accountId}/messages/${encodeURIComponent(messageId)}`);
    if (state.activeMessageId !== messageId) return;
    state.activeMessage = data.message;
    markSeen(accountId, messageId);

    const message = data.message;
    $("view-placeholder").hidden = true;
    $("message-view").hidden = false;
    $("app").classList.add("viewing");

    $("msg-subject").textContent = message.subject;
    $("msg-from").textContent = message.from_name
      ? `${message.from_name} <${message.from_address}>`
      : message.from_address;
    $("msg-date").textContent = formatFullDate(message.date);

    // رمز التحقق — أكثر ما يُنتظر من بريد مؤقت.
    const code = extractCode(message);
    const codeBtn = $("copy-code-btn");
    codeBtn.hidden = !code;
    if (code) {
      codeBtn.textContent = `نسخ الرمز ${code}`;
      codeBtn.onclick = async () => {
        await copyText(code);
        toast(`تم نسخ الرمز ${code}`, "ok");
      };
    }

    renderAttachments(accountId, message);
    renderBody(message);

    // زر الصور يظهر فقط عند وجود صور خارجية.
    const hasRemote = /<img[^>]+src=["']?https?:/i.test(message.html || "");
    $("images-btn").hidden = !hasRemote || state.showImages;

    // تحديث حالة "مقروء" في القائمة.
    const item = state.messages.find((m) => m.id === messageId);
    if (item) item.seen = true;
    renderMessages();
  } catch (error) {
    toast(error.message, "err", 6000);
  }
}

function renderAttachments(accountId, message) {
  const container = $("attachments");
  const attachments = message.attachments || [];
  container.innerHTML = "";
  container.hidden = attachments.length === 0;

  for (const attachment of attachments) {
    const link = document.createElement("a");
    link.className = "attachment";
    // الرمز في الرابط لأن التنزيل ينتقل خارج طبقة fetch.
    link.href =
      `/api/accounts/${accountId}/messages/${encodeURIComponent(message.id)}` +
      `/attachments/${encodeURIComponent(attachment.id)}?t=${encodeURIComponent(TOKEN)}`;
    link.download = attachment.filename;
    link.innerHTML =
      `📎 <span>${escapeHtml(attachment.filename)}</span>` +
      (attachment.size ? `<span class="size">${formatSize(attachment.size)}</span>` : "");
    container.appendChild(link);
  }
}

function renderBody(message) {
  const frame = $("msg-body");
  // سياسة محتوى صارمة داخل الإطار: لا سكربتات، ولا صور خارجية إلا بطلبك.
  const imgSrc = state.showImages ? "data: https: http:" : "data:";
  const csp =
    `default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; ` +
    `font-src data:; form-action 'none'; frame-src 'none';`;

  const content = message.html
    ? message.html
    : `<pre class="plain">${escapeHtml(message.text || "(رسالة فارغة)")}</pre>`;

  frame.srcdoc =
    `<!doctype html><html dir="auto"><head>` +
    `<meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<base target="_blank">` +
    `<style>` +
    `body{margin:0;padding:18px;font-family:"Segoe UI",Tahoma,Arial,sans-serif;` +
    `font-size:14px;line-height:1.7;color:#16202e;background:#fff;word-wrap:break-word;}` +
    `img{max-width:100%;height:auto;}` +
    `table{max-width:100%;}` +
    `pre.plain{white-space:pre-wrap;font-family:inherit;margin:0;}` +
    `a{color:#1f6feb;}` +
    `</style></head><body>${content}</body></html>`;
}

async function deleteActiveMessage() {
  if (!state.activeMessage || !state.activeAccountId) return;
  const provider = state.providers.find(
    (p) => p.id === (state.accounts.find((a) => a.id === state.activeAccountId) || {}).provider
  );
  if (provider && !provider.supports_delete_message) {
    toast("هذا المزوّد لا يدعم حذف الرسائل", "err");
    return;
  }
  try {
    await api(
      `/api/accounts/${state.activeAccountId}/messages/${encodeURIComponent(state.activeMessage.id)}`,
      { method: "DELETE" }
    );
    state.messages = state.messages.filter((m) => m.id !== state.activeMessage.id);
    clearMessageView();
    renderMessages();
    toast("تم حذف الرسالة", "ok");
  } catch (error) {
    toast(error.message, "err");
  }
}

/* ========================== التحديث التلقائي ========================== */

function scheduleRefresh() {
  clearInterval(state.timer);
  clearInterval(state.countdownTimer);
  $("countdown").textContent = "";

  if (!$("auto-refresh").checked || !state.activeAccountId) return;

  const seconds = (state.settings && state.settings.refresh_seconds) || 10;
  state.nextRefreshAt = Date.now() + seconds * 1000;

  state.timer = setInterval(async () => {
    await refreshMessages({ silent: true });
    state.nextRefreshAt = Date.now() + seconds * 1000;
  }, seconds * 1000);

  state.countdownTimer = setInterval(() => {
    const left = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
    $("countdown").textContent = `تحديث بعد ${left} ث`;
  }, 500);
}

/* ============================== الإعدادات ============================== */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}

function fillSettingsForm() {
  const settings = state.settings;
  $("set-refresh").value = settings.refresh_seconds;
  $("set-images").checked = !!settings.load_remote_images;
  $("set-sound").checked = !!settings.notify_sound;

  const imap = settings.imap || {};
  $("imap-host").value = imap.host || "";
  $("imap-port").value = imap.port || 993;
  $("imap-user").value = imap.username || "";
  $("imap-pass").value = "";
  $("imap-pass").placeholder = imap.has_password
    ? "محفوظة — اتركها فارغة للإبقاء عليها"
    : "كلمة مرور التطبيق";
  $("imap-mailbox").value = imap.mailbox || "INBOX";
  $("imap-domains").value = imap.domain || "";
  $("imap-ssl").checked = imap.use_ssl !== false;
  $("imap-result").textContent = "";
  $("imap-result").className = "test-result";
}

const IMAP_PRESETS = {
  gmail: { host: "imap.gmail.com", port: 993, label: "Gmail" },
  outlook: { host: "outlook.office365.com", port: 993, label: "Outlook / Hotmail" },
  yahoo: { host: "imap.mail.yahoo.com", port: 993, label: "Yahoo" },
  icloud: { host: "imap.mail.me.com", port: 993, label: "iCloud" },
  proton: { host: "127.0.0.1", port: 1143, label: "Proton (عبر Bridge)" },
};

function applyImapPreset(key) {
  const preset = IMAP_PRESETS[key];
  if (!preset) return;
  $("imap-host").value = preset.host;
  $("imap-port").value = preset.port;
  $("imap-ssl").checked = key !== "proton";
}

function collectImapForm() {
  return {
    host: $("imap-host").value.trim(),
    port: parseInt($("imap-port").value, 10) || 993,
    username: $("imap-user").value.trim(),
    password: $("imap-pass").value,
    mailbox: $("imap-mailbox").value.trim() || "INBOX",
    domain: $("imap-domains").value.trim(),
    use_ssl: $("imap-ssl").checked,
  };
}

async function saveSettingsPartial(patch) {
  try {
    const data = await api("/api/settings", { method: "POST", body: JSON.stringify(patch) });
    state.settings = data.settings;
    return data.settings;
  } catch (error) {
    toast(error.message, "err");
    return null;
  }
}

async function saveSettingsFromForm() {
  const patch = {
    refresh_seconds: parseInt($("set-refresh").value, 10) || 10,
    load_remote_images: $("set-images").checked,
    notify_sound: $("set-sound").checked,
    imap: collectImapForm(),
  };
  const settings = await saveSettingsPartial(patch);
  if (!settings) return;

  // إعداد IMAP قد يغيّر جاهزية المزوّد — نعيد تحميل الوصف والدومينات.
  const bootstrapData = await api("/api/bootstrap");
  state.providers = bootstrapData.providers;
  renderProviders();

  closeModal();
  scheduleRefresh();
  toast("تم حفظ الإعدادات", "ok");
}

async function testImap() {
  const button = $("imap-test");
  const result = $("imap-result");
  button.disabled = true;
  result.textContent = "جارٍ الاختبار…";
  result.className = "test-result";
  try {
    const data = await api("/api/imap/test", {
      method: "POST",
      body: JSON.stringify(collectImapForm()),
    });
    result.textContent = data.message || "تم الاتصال بنجاح";
    result.className = "test-result ok";
  } catch (error) {
    result.textContent = error.message;
    result.className = "test-result fail";
  } finally {
    button.disabled = false;
  }
}

function openModal() {
  fillSettingsForm();
  $("modal").hidden = false;
}

function closeModal() {
  $("modal").hidden = true;
}

/* =============================== التشغيل =============================== */

async function boot() {
  try {
    const data = await api("/api/bootstrap");
    state.providers = data.providers;
    state.accounts = data.accounts;
    state.settings = data.settings;
    state.unreadCounts = {};

    applyTheme(state.settings.theme);
    $("storage-note").textContent = data.secure_storage
      ? "كلمة المرور تُحفظ مشفّرة بحساب ويندوز الخاص بك (DPAPI)."
      : "تنبيه: التشفير القوي متاح على ويندوز فقط — على هذا النظام تُحفظ الكلمة مموّهة لا مشفّرة.";

    renderProviders();
    renderAccounts();

    if (state.accounts.length) {
      await selectAccount(state.accounts[0].id);
    }
  } catch (error) {
    toast(`تعذّر تشغيل التطبيق: ${error.message}`, "err", 10000);
  }

  wireEvents();
}

function wireEvents() {
  $("provider-select").addEventListener("change", onProviderChange);
  $("reload-domains").addEventListener("click", loadDomains);
  $("domain-select").addEventListener("change", updatePreview);
  $("local-input").addEventListener("input", updatePreview);
  $("local-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createAccount();
  });

  $("shuffle-local").addEventListener("click", async () => {
    try {
      const data = await api("/api/random-local");
      $("local-input").value = data.local;
      updatePreview();
    } catch (error) {
      toast(error.message, "err");
    }
  });

  $("create-btn").addEventListener("click", createAccount);

  $("copy-address").addEventListener("click", async () => {
    const account = state.accounts.find((a) => a.id === state.activeAccountId);
    if (account && (await copyText(account.address))) {
      toast("تم نسخ العنوان", "ok", 1800);
    }
  });

  $("refresh-btn").addEventListener("click", () => refreshMessages());
  $("auto-refresh").addEventListener("change", scheduleRefresh);
  $("delete-msg-btn").addEventListener("click", deleteActiveMessage);

  $("images-btn").addEventListener("click", () => {
    state.showImages = true;
    $("images-btn").hidden = true;
    if (state.activeMessage) renderBody(state.activeMessage);
  });

  $("settings-btn").addEventListener("click", openModal);
  $("modal-close").addEventListener("click", closeModal);
  $("settings-cancel").addEventListener("click", closeModal);
  $("settings-save").addEventListener("click", saveSettingsFromForm);
  $("imap-test").addEventListener("click", testImap);
  $("imap-preset").addEventListener("change", (e) => {
    applyImapPreset(e.target.value);
    e.target.value = "";
  });
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });

  // إيقاف الخادم الخلفي — مهم عند التشغيل في المتصفح بدل النافذة الأصلية.
  $("quit-btn").addEventListener("click", async () => {
    if (!confirm("إغلاق التطبيق وإيقاف استقبال الرسائل؟")) return;
    try {
      await api("/api/quit", { method: "POST" });
    } catch (_) {
      /* الخادم يغلق أثناء الرد أحيانًا */
    }
    clearInterval(state.timer);
    clearInterval(state.countdownTimer);
    document.body.innerHTML =
      '<div style="display:grid;place-items:center;height:100vh;color:#97a3b6;' +
      'font-family:Segoe UI,Tahoma,sans-serif">تم إغلاق التطبيق — يمكنك إغلاق هذه النافذة.</div>';
  });

  $("theme-btn").addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    await saveSettingsPartial({ theme: next });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("modal").hidden) closeModal();
    if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) {
      e.preventDefault();
      refreshMessages();
    }
  });

  // إيقاف التحديث عند إخفاء النافذة، واستئنافه عند العودة.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(state.timer);
      clearInterval(state.countdownTimer);
    } else {
      refreshMessages({ silent: true });
      scheduleRefresh();
    }
  });
}

boot();
