# ☁️ تشغيل التطبيق على سيرفر ٢٤/٧

هذا الدليل ينشر نسخة ويب من التطبيق تعمل دائمًا، فتصلك الرسائل والجهاز مطفي،
وتفتحها من الجوال أو أي متصفح.

> **متى يستحق النشر؟**
> عندما تستخدم **دومينك الخاص**. مع الدومينات الجاهزة لا فائدة تُذكر — العناوين
> مؤقتة أصلًا. ومع خيار الاسم البديل (Gmail/Outlook) رسائلك تصلك في صندوقك
> المعتاد بأي حال.

---

## 📋 ما تحتاجه

| العنصر | التفاصيل |
|---|---|
| سيرفر (VPS) | أصغر خطة تكفي — ٥١٢ ميجابايت رام (~٥ دولار/شهر) |
| دومين | يشير إلى عنوان السيرفر بسجل `A` |
| دومينك للبريد | مع catch-all مفعّلة (انظر `README.md`) |

⚠️ **لا تنشر التطبيق بلا HTTPS ولا بلا كلمة مرور.** التطبيق يرفض العمل على
عنوان عام بلا `TEMPMAIL_PASSWORD`، لكنه لا يستطيع فرض HTTPS بنفسه — الوكيل
العكسي أدناه هو من يوفّرها.

---

## 🚀 الطريقة الأولى: Docker + Caddy (الأسهل، HTTPS تلقائية)

### ١. جهّز السيرفر

```bash
# على أوبنتو/ديبيان
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

### ٢. أنزل المشروع واضبط كلمة المرور

```bash
git clone -b claude/windows-temp-email-app-mtx1oq \
    https://github.com/ABADIOSA/ABADIOSA.git tempmail
cd tempmail

cp .env.example .env
# ولّد كلمة مرور قوية واحفظها عندك:
echo "TEMPMAIL_PASSWORD=$(openssl rand -base64 24)" > .env
cat .env      # انسخها الآن — ستحتاجها للدخول
```

### ٣. شغّل التطبيق

```bash
docker compose up -d --build
docker compose logs -f       # للتأكد من الإقلاع
```

التطبيق الآن يعمل على `127.0.0.1:8080` — **غير مكشوف على الإنترنت بعد**، وهذا
مقصود. الخطوة التالية تنشره بأمان.

### ٤. أضف Caddy لشهادة HTTPS تلقائية

أنشئ ملف `Caddyfile`:

```caddyfile
mail.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

ثم:

```bash
sudo apt install -y caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

Caddy يستخرج شهادة Let's Encrypt ويجدّدها تلقائيًا. افتح
`https://mail.example.com` وأدخل كلمة المرور. **انتهى.**

<details>
<summary>بديل: nginx بدل Caddy</summary>

```nginx
server {
    listen 443 ssl http2;
    server_name mail.example.com;

    ssl_certificate     /etc/letsencrypt/live/mail.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        # هاتان الترويستان ضروريتان: الأولى لتفعيل كوكي Secure،
        # والثانية ليطابق التطبيق أصل الطلب بشكل صحيح.
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name mail.example.com;
    return 301 https://$host$request_uri;
}
```

الشهادة عبر `sudo certbot --nginx -d mail.example.com`.
</details>

---

## 🔧 الطريقة الثانية: بلا Docker (systemd)

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin tempmail
sudo git clone -b claude/windows-temp-email-app-mtx1oq \
    https://github.com/ABADIOSA/ABADIOSA.git /opt/tempmail
sudo chown -R tempmail:tempmail /opt/tempmail
```

أنشئ `/etc/systemd/system/tempmail.service`:

```ini
[Unit]
Description=TempMailWin
After=network-online.target

[Service]
Type=simple
User=tempmail
WorkingDirectory=/opt/tempmail
Environment=TEMPMAIL_PASSWORD=ضع-كلمة-المرور-هنا
Environment=XDG_DATA_HOME=/var/lib/tempmail
ExecStart=/usr/bin/python3 run.py --host 127.0.0.1 --port 8080 --server-mode --no-open
Restart=always
RestartSec=5

# تقييد الصلاحيات
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
StateDirectory=tempmail

[Install]
WantedBy=multi-user.target
```

```bash
sudo chmod 600 /etc/systemd/system/tempmail.service   # الملف يحوي كلمة المرور
sudo systemctl daemon-reload
sudo systemctl enable --now tempmail
sudo systemctl status tempmail
```

ثم أضف الوكيل العكسي كما في الطريقة الأولى.

---

## 🔐 ما الذي يحميك؟

| الطبقة | التفاصيل |
|---|---|
| **كلمة مرور** | PBKDF2-SHA256 بـ ٢٤٠٬٠٠٠ دورة وملح عشوائي — لا تُحفظ الكلمة نفسها أبدًا |
| **جلسات** | كوكي `HttpOnly` + `SameSite=Lax` + `Secure` خلف HTTPS، صلاحيتها ١٢ ساعة |
| **حماية CSRF** | كل طلب يحتاج ترويسة `X-Auth-Token` إضافة للكوكي — والمواقع الأخرى لا تستطيع إضافة ترويسات مخصّصة |
| **حدّ المحاولات** | ٨ محاولات فاشلة لكل IP ثم منع ١٥ دقيقة |
| **رفض التشغيل الخطر** | التطبيق يرفض الاستماع على عنوان عام بلا كلمة مرور |
| **مستخدم غير جذر** | الحاوية تعمل بمستخدم `uid 10001` |
| **إيقاف عن بُعد معطّل** | زر «إغلاق التطبيق» لا يعمل في وضع السيرفر |

### قائمة تحقّق قبل النشر

- [ ] كلمة مرور عشوائية طولها ٢٠ محرفًا فأكثر
- [ ] HTTPS تعمل، و`http` يعيد التوجيه إليها
- [ ] المنفذ `8080` **غير** مفتوح في الجدار الناري (الوكيل فقط يصل إليه)
- [ ] `.env` غير مرفوع إلى git (مستثنى في `.gitignore`)
- [ ] كلمة مرور IMAP هي **كلمة مرور تطبيق** لا كلمة مرور حسابك الأساسية

```bash
# جدار ناري بسيط
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

---

## 🔄 التشغيل اليومي

```bash
docker compose logs -f              # السجلات
docker compose restart              # إعادة تشغيل
docker compose down                 # إيقاف

# تحديث لأحدث نسخة
git pull && docker compose up -d --build

# نسخة احتياطية من العناوين والإعدادات
docker run --rm -v tempmail_tempmail-data:/data -v "$PWD":/backup \
    alpine tar czf /backup/tempmail-backup.tar.gz -C /data .
```

---

## 🛠️ حل المشاكل

| المشكلة | الحل |
|---|---|
| «رُفض التشغيل: لم تُحدَّد كلمة مرور» | `.env` مفقود أو فارغ — أعد إنشاءه ثم `docker compose up -d` |
| الدخول ينجح ثم يعيدك لصفحة الدخول | الكوكي `Secure` لا يصل عبر http — فعّل HTTPS وتأكد من ترويسة `X-Forwarded-Proto` |
| «طلب غير مصرّح به» بعد الدخول | الوكيل لا يمرّر ترويسة `Host` — أضف `proxy_set_header Host $host;` |
| «محاولات كثيرة» | حدّ المحاولات فعّل نفسه — انتظر ١٥ دقيقة أو أعد تشغيل الحاوية |
| لا تصل رسائل | جرّب **اختبار الاتصال** في الإعدادات؛ بعض مزوّدي VPS يحجبون منفذ ٩٩٣ الصادر |
