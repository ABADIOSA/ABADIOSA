# التحديث التلقائي

> كيف تُحدَّث هذه الإضافة، ولماذا يختلف الجواب بين فايرفوكس وكروم.
> *(English version below)*

---

## الخلاصة أولاً

| الطريقة | تحديث تلقائي كامل؟ | ما تحتاجه |
| --- | --- | --- |
| **فايرفوكس + XPI موقّع** | ✅ نعم — فايرفوكس يحدّثها وحده | حساب AMO مجاني لتوقيع النسخة |
| **كروم + متجر Chrome** | ✅ نعم | حساب مطوّر ($5 مرة واحدة) + مراجعة |
| **كروم + CRX مستضاف ذاتياً** | ⚠️ على لينكس فقط، أو بسياسة مؤسسات على ويندوز/ماك | مفتاح توقيع CRX |
| **تحميل يدوي (Load unpacked)** | ❌ لا يحدّثها المتصفح إطلاقاً | — |

**الوضع الحالي**: أنت تستعمل الطريقة الأخيرة. لهذا أضفنا شيئين:

1. **فاحص تحديثات مدمج** يعمل في كل الحالات — يفحص إصدارات GitHub كل ٦ ساعات، ويضع علامة ↑ على أيقونة الإضافة، ويعرض شريطاً فيه زر تنزيل. لا يلغي خطوة التنزيل لكنه يلغي حاجتك للتفقّد اليدوي.
2. **بنية إصدار كاملة** تجعل التحديث التلقائي الحقيقي على فايرفوكس جاهزاً بخطوة إعداد واحدة.

---

## فايرفوكس: تحديث تلقائي حقيقي (موصى به)

فايرفوكس يسمح بالتوزيع الذاتي مع تحديث تلقائي كامل. الشرط الوحيد أن تكون النسخة موقّعة من موزيلا — والتوقيع مجاني وآلي.

### إعداد لمرة واحدة

1. أنشئ حساباً على [addons.mozilla.org](https://addons.mozilla.org/developers/)، ثم من [إدارة المفاتيح](https://addons.mozilla.org/developers/addon/api/key/) أنشئ **JWT issuer** و**JWT secret**.

2. في مستودعك على GitHub: `Settings → Secrets and variables → Actions`، أضف:
   - `AMO_JWT_ISSUER`
   - `AMO_JWT_SECRET`

3. ادفع وسم نسخة:
   ```bash
   git tag v1.8.0
   git push origin v1.8.0
   ```

سير العمل في `.github/workflows/release.yml` يتكفّل بالباقي: يبني الحزمتين، يوقّع نسخة فايرفوكس بقناة `unlisted`، ينشر إصداراً على GitHub، ثم يحدّث `updates/updates.json` على فرع `main`.

4. ثبّت ملف `.xpi` من صفحة الإصدار **مرة واحدة**. بعدها يتفقّد فايرفوكس بيان التحديث تلقائياً (كل ٢٤ ساعة تقريباً) ويحدّثها وحده. لن تنزّل ملفاً بعد ذلك أبداً.

### كيف يعمل

`extension-firefox/manifest.json` يحمل:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "stremiohub-harbor@abadiosa",
    "update_url": "https://raw.githubusercontent.com/ABADIOSA/ABADIOSA/main/updates/updates.json"
  }
}
```

فايرفوكس يقرأ ذلك الملف، يقارن رقم النسخة، وينزّل `update_link` إن كان أحدث.

> **لماذا تغيّر معرّف الإضافة؟** المعرّف الأصلي `stremiohub@yasser.dev` يخصّ الإضافة المنشورة على AMO باسم مطوّرها. لا يمكن توقيع نسخة ذاتية التوزيع بمعرّف لا تملكه، ولو أمكن لتعارضت النسختان. المعرّف الجديد يجعلها إضافة مستقلة — ويمكن تثبيتها جنباً إلى جنب مع الأصلية.

---

## كروم: الخيارات الحقيقية

كروم شدّد على الإضافات المثبّتة من خارج المتجر. **على ويندوز وماك، النسخ المستضافة ذاتياً تُثبَّت عبر سياسة المؤسسات فقط** — التثبيت العادي من ملف `.crx` محجوب.

### الخيار ١ — متجر Chrome (الوحيد الذي يعطي تحديثاً تلقائياً للجميع)

رسوم مطوّر $5 مرة واحدة، ومراجعة لكل إصدار. بعد النشر يحدّث كروم الإضافة تلقائياً كأي إضافة أخرى. `scripts/build.mjs` ينتج حزمة `-chrome.zip` جاهزة للرفع.

### الخيار ٢ — CRX مستضاف ذاتياً

يعمل مباشرةً على **لينكس**. وعلى ويندوز وماك يحتاج سياسة `ExtensionSettings` تسمح بمعرّف الإضافة ورابط تحديثها. البنية جاهزة: `updates/updates.xml` يُولَّد آلياً، ويبقى أن تضع معرّف CRX الخاص بك في متغيّر البيئة `CHROME_APP_ID` عند البناء.

### الخيار ٣ — الوضع الحالي: فاحص مدمج

يعمل الآن بلا أي إعداد:

- فحص كل ٦ ساعات لإصدارات GitHub (وعند تثبيت الإضافة).
- علامة **↑** خضراء على أيقونة الإضافة عند توفّر نسخة أحدث — ولها أولوية على عدّاد تحديثات إضافات Stremio البنفسجي.
- شريط أعلى الإضافة فيه رقم النسخة وأول سطر من ملاحظات الإصدار وزر تنزيل، مع زر "لاحقاً" يُخفيه حتى تصدر نسخة أحدث.
- في الإعدادات ← عام: نسختك الحالية، زر **تحقق الآن**، ومفتاح لإيقاف الفحص التلقائي.

الفاحص يكتشف وحده إن كان المتصفح يحدّث الإضافة تلقائياً (عبر `update_url` أو `management.getSelf().installType`)، وعندها لا يعرض شريط التنزيل أصلاً — لأنه سيكون مزعجاً بلا فائدة.

---

## إصدار نسخة جديدة

```bash
# ١. ارفع الرقم في المانيفستين (لا بد أن يتطابقا)
#    extension/manifest.json و extension-firefox/manifest.json

# ٢. جدّد بيانات التحديث وابنِ الحزم محلياً للتأكد
node scripts/build.mjs --manifests

# ٣. ادفع الوسم — سير العمل يتولّى النشر
git commit -am "v1.8.0"
git tag v1.8.0
git push origin main --tags
```

سير العمل يرفض الوسم إن لم يطابق رقم المانيفست، حتى لا يصدر إصدار برقم خاطئ.

---
---

# English

## Summary

| Method | Fully automatic? | Requires |
| --- | --- | --- |
| **Firefox + signed XPI** | ✅ Yes | A free AMO account for signing |
| **Chrome Web Store** | ✅ Yes | $5 one-time developer fee + review |
| **Chrome self-hosted CRX** | ⚠️ Linux only, or enterprise policy on Windows/macOS | A CRX signing key |
| **Load unpacked** | ❌ Never auto-updates | — |

You are currently on the last row. So this release adds two things: a **built-in update checker** that works everywhere, and the **release infrastructure** that makes true Firefox auto-update one setup step away.

## Firefox: real auto-update (recommended)

Firefox supports self-distribution with full auto-update; the only requirement is that the XPI is signed by Mozilla, which is free and automated.

1. Create an [AMO account](https://addons.mozilla.org/developers/) and generate a **JWT issuer** and **JWT secret** at [the API key page](https://addons.mozilla.org/developers/addon/api/key/).
2. Add them as GitHub Actions secrets: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`.
3. Push a version tag (`git tag v1.8.0 && git push origin v1.8.0`). The workflow builds, signs on the `unlisted` channel, publishes a GitHub Release, and updates `updates/updates.json` on `main`.
4. Install the `.xpi` from the release page **once**. Firefox polls the update manifest from then on and updates itself. No more downloading files.

The Firefox manifest carries `browser_specific_settings.gecko.update_url` pointing at that manifest.

> **Why the add-on ID changed**: the original `stremiohub@yasser.dev` belongs to the AMO-listed add-on published under its author's account. A self-distributed build cannot be signed with an ID you do not own, and if it could, the two would collide. The new ID makes this a separate add-on that can live alongside the original.

## Chrome: the real options

Chrome has tightened on extensions installed outside the Web Store. **On Windows and macOS, self-hosted extensions install only via enterprise policy** — plain `.crx` installs are blocked.

1. **Chrome Web Store** — the only path that gives every user automatic updates. `scripts/build.mjs` produces an upload-ready `-chrome.zip`.
2. **Self-hosted CRX** — works directly on Linux; needs an `ExtensionSettings` policy on Windows/macOS. `updates/updates.xml` is generated for you; set `CHROME_APP_ID` when building.
3. **The built-in checker** — works today with zero setup: a check every 6 hours, a green **↑** badge (which takes priority over the purple Stremio-addon counter), a banner with the version and the first line of the release notes, and a *Check now* button plus an on/off switch under Settings → General.

The checker detects whether the browser already updates the extension itself — via `update_url` or `management.getSelf().installType` — and in that case suppresses the download banner entirely.

## Cutting a release

Bump the version in **both** manifests (they must match), run `node scripts/build.mjs --manifests`, then push a matching tag. The workflow refuses a tag that does not match the manifest version.
