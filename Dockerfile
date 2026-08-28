# صورة صغيرة — التطبيق يعمل بمكتبات بايثون القياسية فقط، بلا أي pip install.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TEMPMAIL_PORT=8080

WORKDIR /app

# نسخ الكود فقط — لا اعتماديات تحتاج بناءً.
COPY tempmail/ ./tempmail/
COPY run.py ./

# مستخدم غير جذر، ومجلد بيانات دائم يُركَّب كـ volume.
RUN useradd --create-home --uid 10001 tempmail \
    && mkdir -p /data \
    && chown -R tempmail:tempmail /app /data
USER tempmail

# مسار بيانات التطبيق داخل الحاوية.
ENV XDG_DATA_HOME=/data
VOLUME ["/data"]

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,os,sys; \
        sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.environ['TEMPMAIL_PORT']+'/', timeout=4).status==200 else 1)"

# وضع السيرفر يفرض وجود TEMPMAIL_PASSWORD وإلا رفض التشغيل.
CMD ["sh", "-c", "python run.py --host 0.0.0.0 --port ${TEMPMAIL_PORT} --server-mode --no-open"]
