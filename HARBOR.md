# StremioHub × Harbor

> دليل التكامل بين إضافة **StremioHub** ومشغّل **[Harbor](https://github.com/harborstremio/harbor)**.
> *(English version below)*

---

## لماذا هذا التكامل؟

[Harbor](https://github.com/harborstremio/harbor) مشغّل سطح مكتب مفتوح المصدر (Tauri + React) لمنظومة إضافات Stremio، وفيه مشغّل mpv أصلي ومحرّك ترتيب مصادر ومزامنة مشاهدة جماعية ومحرّك ثيمات.

الأهم: **Harbor يسجّل الدخول بنفس حساب Stremio** ويستعمل نفس واجهة `api.strem.io`. وهذه بالضبط الواجهة التي تعمل عليها StremioHub. النتيجة أن كل شيء موجود مسبقاً في الإضافة يعمل مع Harbor بلا أي عمل إضافي:

| ما تفعله StremioHub | أين يظهر في Harbor |
| --- | --- |
| "حفظ في المكتبة" من IMDb / TMDB / Letterboxd / … | غرفة **Library** في Harbor |
| "تم المشاهدة" وتقدّم المشاهدة | صفّ **Continue Watching** |
| تثبيت / حذف / إعادة ترتيب الإضافات | غرفة **Addons** |
| فحص تحديثات الإضافات | نفس مجموعة الإضافات |

ما كان ناقصاً هو الطرف الآخر: **فتح عمل في Harbor** و**التحكم بما يعمل الآن**. هذا ما يضيفه هذا الإصدار.

---

## ما الذي أُضيف

### ١. فتح الأعمال في Harbor

ثلاث طرق، تُختار من **الإعدادات ← Harbor ← طريقة الفتح**:

| الوضع | كيف يعمل | ما يحتاجه |
| --- | --- | --- |
| **رابط عميق** (افتراضي) | يفتح `stremio:///detail/<type>/<id>` وHarbor يلتقطه ويفتح صفحة العمل | أن يكون Harbor هو المسجَّل لفتح روابط `stremio://` |
| **ريموت** | يفتح بحث Harbor ويكتب الاسم ويرسله عبر WebSocket | خادم Harbor المحلي شغّال |
| **واجهة الويب** | يفتح `http://<host>:11471/` في تبويب جديد | خادم Harbor المحلي شغّال |

نقاط الدخول:

- زر **Harbor** في شاشة تفاصيل العمل داخل الإضافة.
- خيار **Harbor** في "طريقة الفتح في Stremio" — يجعل زر "مشاهدة الآن" يفتح في Harbor.
- خيار **Harbor** لكل موقع على حدة في تبويب "المواقع" — يجعل الزر المحقون في IMDb/TMDB/… يفتح في Harbor مباشرةً.
- عنصر **"⚓ ابحث عن … في Harbor"** في قائمة النقر الأيمن عند تحديد نص.

### ٢. شاشة ريموت كاملة

زر المرساة في ترويسة الإضافة يفتح شاشة تتصل بـ Harbor عبر WebSocket وتعرض:

- **الآن قيد التشغيل**: البوستر، العنوان، رقم الحلقة واسمها، ومصدر البثّ (الدقة · الجودة · مجموعة الإصدار)، ووجهة التشغيل (الجهاز أو جهاز بثّ).
- **شريط تقدّم** قابل للسحب مع الوقت والمدة.
- **أزرار التحكم**: الحلقة السابقة/التالية، ‎−10/+10 ثوانٍ، تشغيل/إيقاف.
- **الصوت والترجمة**: كتم، مستوى الصوت، تبديل الترجمة.
- **بحث ولوحة تنقّل** (أسهم + اختيار + رجوع) لقيادة واجهة Harbor عن بُعد.

الحالة تتحدّث لحظياً من اللقطات (`snapshot`) التي يبثّها Harbor.

### ٣. نسخ تثبيت الإضافات

عند تفعيل الخيار، أي إضافة تُثبّتها من مدير الإضافات في StremioHub تفتح أيضاً رابط `harbor://…` ليعرضها Harbor في نافذة التثبيت عنده.

---

## التشغيل خطوة بخطوة

1. **في Harbor**: الإعدادات ← فعّل **Remote Control** (أو **Serve Web UI**). هذا يشغّل الخادم المحلي على المنفذ **11471**.
2. **في StremioHub**: الإعدادات ← تبويب **Harbor** ← فعّل **تفعيل التكامل**.
3. اضغط **اختبار** للتأكد من الوصول. العنوان الافتراضي `127.0.0.1:11471`.
4. اختر **طريقة الفتح** التي تناسبك.

### Harbor على جهاز آخر

خادم Harbor يستمع على `0.0.0.0`، فيمكن وضع عنوان الجهاز في الشبكة المحلية (مثل `192.168.1.50`) بدل `127.0.0.1`. مفيد إن كان Harbor على حاسوب غرفة المعيشة والمتصفح على جهاز آخر.

> **تنبيه**: خادم Harbor لا يطلب أي توثيق. لا تفتح المنفذ 11471 خارج شبكتك المحلية.

---

## التفاصيل التقنية

### الملفات

| الملف | الدور |
| --- | --- |
| `extension/modules/harbor-core.js` | الجسر كاملاً: الإعدادات، بناء الروابط، فحص الاتصال، عميل الريموت |
| `extension/background.js` | معالجات الرسائل، توجيه الفتح، عنصر قائمة السياق |
| `extension/popup/popup.js` | كائن `Harbor`: تبويب الإعدادات وشاشة الريموت |
| `extension/popup/popup.html` + `popup.css` | واجهة التبويب والشاشة |
| `extension/content.js` | إجراء `harbor` لكل موقع |

الملف `harbor-core.js` مكتوب بلا `import`/`export` ليعمل في السياقين: يُستورد من `background.js` (وهو ES module) ويُحمَّل بوسم `<script>` في الـ popup. وفي الحالتين يضع الواجهة على `globalThis.HarborCore`.

### بروتوكول الريموت

مطابق لـ [`harbor/src/lib/remote/protocol.ts`](https://github.com/harborstremio/harbor/blob/main/src/lib/remote/protocol.ts):

```
ws://<host>:11471/api/remote

← { "t": "hello",  "client": "harbor-remote", "proto": 1 }
→ { "t": "hello",  "proto": 1, "server": "harbor-remote" }
→ { "t": "snapshot", "snapshot": { … } }
← { "t": "cmd",    "command": { "action": "pause" } }
```

الأوامر المستعملة: `play` · `pause` · `seek` · `setVolume` · `setMuted` · `prevEpisode` · `nextEpisode` · `toggleSubtitles` · `nav` · `setText` · `submitText` · `openSearch` · `ping`.

اتصال الـ WebSocket يعيش في الـ **popup** وليس في الـ service worker، لأن الـ popup حيّ ما دام مفتوحاً بينما الـ service worker قد يُوقَف في أي لحظة. الأوامر التي تُطلَق من الخلفية (قائمة السياق مثلاً) تستعمل اتصالاً قصيراً يُفتح ويُغلق فوراً.

### تغييرات المانيفست

- `host_permissions`: أُضيف `http://127.0.0.1/*` و `http://localhost/*`.
- نسخة فايرفوكس: كان `connect-src` محصوراً بـ `https:` وهو ما يمنع الوصول إلى `http://127.0.0.1:11471` و `ws://`، فوُسّع ليشمل `http:` و `ws:` و `wss:`.

### حدود معروفة

- **الرابط العميق** يعتمد على تسجيل مخطط `stremio://` في النظام. إن كان تطبيق Stremio الرسمي مثبتاً فقد يلتقط الرابط بدل Harbor — هذا إعداد على مستوى نظام التشغيل خارج سيطرة الإضافة. استعمل وضع **الريموت** أو **واجهة الويب** في هذه الحالة.
- **`harbor://`** يمرّره Harbor حالياً إلى نافذة تثبيت الإضافات فقط (`shouldForward` في `deep-link.ts`)، ولا يحلّل مسارات `detail/`. لذلك يستعمل هذا التكامل `stremio://` لفتح الأعمال و`harbor://` لتثبيت الإضافات فقط.
- **وضع الريموت** يدفع بحثاً بالاسم، لا يفتح صفحة العمل بمعرّفه، لأن بروتوكول ريموت Harbor لا يحوي أمر "افتح هذا العمل".
- **واجهة Harbor على الويب** تستعمل `createMemoryHistory`، فلا يمكن الوصول إلى صفحة عمل بعينها عبر رابط URL.

### الاختبارات

في `tests/harbor/` اختبار تكامل من طرف إلى طرف: يشغّل خادم Harbor وهمياً على المنفذ 11471 يتكلّم البروتوكول الحقيقي، ويحمّل الإضافة في Chromium فعلي، ثم يتحقق من الوحدة الأساسية وتبويب الإعدادات وفحص الاتصال وشاشة الريموت ووصول الأوامر ودفع البحث وحالة الانقطاع.

```bash
cd tests/harbor
npm install
npx playwright install chromium
node harbor-integration.test.mjs
```

---
---

# English

Integration guide between the **StremioHub** browser extension and the **[Harbor](https://github.com/harborstremio/harbor)** player.

## Why

Harbor is an open-source Tauri + React desktop player for the Stremio addon ecosystem, and it **signs in with the same Stremio account** through the same `api.strem.io` endpoints StremioHub already uses. So library saves, watched state, and the addon collection are shared between the two out of the box.

What was missing was the other direction: **opening a title in Harbor** and **controlling playback**. That is what this release adds.

## What was added

**1. Opening titles in Harbor** — three modes, picked in *Settings → Harbor → How to open*:

| Mode | How | Requires |
| --- | --- | --- |
| **Deep link** (default) | Opens `stremio:///detail/<type>/<id>`, which Harbor parses into its detail view | Harbor registered as the `stremio://` handler |
| **Remote** | Opens Harbor's search, types the title and submits it over WebSocket | Harbor's local server running |
| **Web UI** | Opens `http://<host>:11471/` in a new tab | Harbor's local server running |

Entry points: a **Harbor** button on the detail screen, a **Harbor** choice in *How to open in Stremio*, a per-site **Harbor** action for the injected buttons on IMDb/TMDB/Letterboxd/…, and an **"⚓ Search Harbor for …"** context-menu item.

**2. A full remote screen** — the anchor button in the header opens a WebSocket-backed screen showing now-playing (poster, title, episode, stream source, cast target), a draggable seek bar, transport controls (prev/next episode, ±10s, play/pause), volume, mute, subtitle toggle, plus a search box and a D-pad for driving Harbor's UI.

**3. Addon install mirroring** — optionally also open a `harbor://…` link when installing an addon from StremioHub's addon manager.

## Setup

1. In **Harbor**: Settings → enable **Remote Control** (or **Serve Web UI**). This starts the local server on port **11471**.
2. In **StremioHub**: Settings → **Harbor** tab → turn on **Enable integration**.
3. Press **Test**. Default endpoint is `127.0.0.1:11471`.
4. Pick the open mode you want.

Harbor's server binds `0.0.0.0`, so you can point the extension at a LAN address (e.g. `192.168.1.50`) if Harbor runs on another machine.

> **Warning**: Harbor's remote server has no authentication. Do not expose port 11471 outside your local network.

## Technical notes

`extension/modules/harbor-core.js` holds the whole bridge — config, URL building, connection probing, and the remote client. It deliberately uses no `import`/`export` so the same file works both as an ES-module import from `background.js` and as a classic `<script>` in the popup; either way it exposes `globalThis.HarborCore`.

The remote protocol mirrors [`harbor/src/lib/remote/protocol.ts`](https://github.com/harborstremio/harbor/blob/main/src/lib/remote/protocol.ts) — a `hello` handshake, `snapshot` pushes from the host, and `{"t":"cmd","command":{…}}` frames going the other way. The WebSocket lives in the popup rather than the service worker, since the popup stays alive while open and an MV3 service worker can be torn down at any moment; background-triggered commands open a short-lived connection instead.

Manifest changes: `http://127.0.0.1/*` and `http://localhost/*` added to `host_permissions`, and the Firefox build's `connect-src` widened from `https:` only to also allow `http:`, `ws:` and `wss:` — without that, the local Harbor server is unreachable.

### Known limits

- Deep links depend on the OS-level `stremio://` handler; with the official Stremio app installed it may win over Harbor. Use **Remote** or **Web UI** mode instead.
- Harbor currently forwards `harbor://` URLs only to its addon installer and does not parse `detail/` paths from that scheme, so this integration uses `stremio://` for opening titles and `harbor://` only for addon installs.
- Remote mode pushes a *search by title*, not an open-by-id, because Harbor's remote protocol has no "open this title" command.
- Harbor's web UI uses `createMemoryHistory`, so a specific title cannot be reached by URL.

## Tests

`tests/harbor/` holds an end-to-end integration test: it starts a mock Harbor server on port 11471 speaking the real protocol, loads the extension into a real Chromium, and asserts the core module, the settings tab, connection probing, the remote screen rendering, command delivery, search push, and the offline state.

```bash
cd tests/harbor
npm install
npx playwright install chromium
node harbor-integration.test.mjs
```
