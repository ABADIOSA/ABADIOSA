"""مزوّد الدومين الخاص عبر IMAP (catch-all).

الفكرة: توجّه دومينك بحيث تذهب كل الرسائل الواردة إلى صندوق واحد
(Cloudflare Email Routing أو أي مزوّد يدعم catch-all)، ثم يقرأ التطبيق ذلك
الصندوق عبر IMAP ويعرض فقط الرسائل الموجّهة إلى العنوان الذي أنشأته.

بهذا تختار أي عنوان تريده على دومينك: anything@yourdomain.com
"""

from __future__ import annotations

import datetime as dt
import email
import email.policy
import imaplib
import re
import threading
import time
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import parsedate_to_datetime, parseaddr
from typing import Any

from .base import Provider, ProviderError

# أقصى عدد رسائل تُعرض في القائمة.
MAX_MESSAGES = 60
# مهلة إبقاء اتصال IMAP مفتوحًا بين التحديثات (ثانية).
CONNECTION_IDLE_TTL = 120

_UID_RE = re.compile(rb"UID\s+(\d+)")
_FLAGS_RE = re.compile(rb"FLAGS\s+\(([^)]*)\)")


class ImapCatchAllProvider(Provider):
    id = "imap"
    name = "دومينك الخاص (IMAP)"
    description = "استخدم دومينك أنت — أي عنوان عليه، عبر صندوق catch-all."
    requires_setup = True

    def __init__(self, settings_loader) -> None:
        # دالة تُعيد الإعدادات الحالية، حتى نلتقط أي تعديل فورًا.
        self._settings_loader = settings_loader
        self._conn: imaplib.IMAP4 | None = None
        self._conn_key: tuple | None = None
        self._conn_used_at = 0.0
        self._lock = threading.RLock()

    # ------------------------------------------------------------ الإعداد
    def _config(self) -> dict:
        return (self._settings_loader() or {}).get("imap", {}) or {}

    def is_ready(self) -> bool:
        config = self._config()
        return bool(
            config.get("host") and config.get("username")
            and config.get("password") and config.get("domain")
        )

    def setup_hint(self) -> str:
        return (
            "افتح الإعدادات وأدخل بيانات صندوق الـ catch-all (الخادم، المستخدم، "
            "كلمة المرور، ودومينك)."
        )

    def list_domains(self) -> list[str]:
        raw = self._config().get("domain", "")
        domains = [d.strip().lstrip("@").lower() for d in re.split(r"[,\s]+", raw) if d.strip()]
        if not domains:
            raise ProviderError(
                "لم تحدّد دومينًا بعد. افتح الإعدادات وأضف دومينك في خانة «الدومينات»."
            )
        # إزالة التكرار مع الحفاظ على الترتيب.
        return list(dict.fromkeys(domains))

    # ------------------------------------------------------------ الاتصال
    def _connect(self, config: dict) -> imaplib.IMAP4:
        host = config.get("host", "").strip()
        port = int(config.get("port") or (993 if config.get("use_ssl", True) else 143))
        try:
            if config.get("use_ssl", True):
                conn: imaplib.IMAP4 = imaplib.IMAP4_SSL(host, port, timeout=25)
            else:
                conn = imaplib.IMAP4(host, port, timeout=25)
                try:
                    conn.starttls()
                except Exception:
                    # الخادم لا يدعم STARTTLS — نُكمل، لكن ننبّه المستخدم في الإعدادات.
                    pass
        except OSError as exc:
            raise ProviderError(f"تعذّر الوصول إلى خادم IMAP ({host}:{port}): {exc}") from exc

        try:
            conn.login(config.get("username", ""), config.get("password", ""))
        except imaplib.IMAP4.error as exc:
            try:
                conn.logout()
            except Exception:
                pass
            raise ProviderError(
                "فشل تسجيل الدخول إلى صندوق البريد. تحقّق من اسم المستخدم وكلمة المرور "
                "(في Gmail استخدم «كلمة مرور التطبيقات»)."
            ) from exc
        return conn

    def _session(self) -> imaplib.IMAP4:
        """يعيد اتصالًا صالحًا، مع إعادة استخدام الاتصال القائم إن أمكن."""
        config = self._config()
        if not self.is_ready():
            raise ProviderError(self.setup_hint())

        key = (
            config.get("host"), int(config.get("port") or 993), bool(config.get("use_ssl", True)),
            config.get("username"), config.get("password"), config.get("mailbox") or "INBOX",
        )
        now = time.time()
        if self._conn is not None:
            expired = now - self._conn_used_at > CONNECTION_IDLE_TTL
            if self._conn_key == key and not expired:
                try:
                    self._conn.noop()
                    self._conn_used_at = now
                    return self._conn
                except Exception:
                    pass
            self._close()

        conn = self._connect(config)
        mailbox = config.get("mailbox") or "INBOX"
        status, _data = conn.select(f'"{mailbox}"', readonly=False)
        if status != "OK":
            try:
                conn.logout()
            except Exception:
                pass
            raise ProviderError(f"تعذّر فتح المجلد «{mailbox}» — تأكد من اسمه.")

        self._conn, self._conn_key, self._conn_used_at = conn, key, now
        return conn

    def _close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.logout()
            except Exception:
                pass
        self._conn, self._conn_key = None, None

    def close(self) -> None:
        with self._lock:
            self._close()

    # ------------------------------------------------------------ الحسابات
    def create_account(self, local: str, domain: str) -> dict[str, Any]:
        if domain.lower() not in self.list_domains():
            raise ProviderError("هذا الدومين غير مضاف في الإعدادات.")
        return {
            "address": f"{local}@{domain}".lower(),
            "domain": domain.lower(),
            "local": local.lower(),
            "password": "",
            "token": "",
        }

    # ------------------------------------------------------------- الرسائل
    def _search_uids(self, conn: imaplib.IMAP4, address: str) -> list[bytes]:
        """يبحث عن الرسائل الموجّهة للعنوان في الترويسات الشائعة."""
        safe = address.replace('"', "")
        criteria = (
            '(OR (OR (OR (HEADER TO "{a}") (HEADER CC "{a}")) '
            '(HEADER DELIVERED-TO "{a}")) (HEADER X-ORIGINAL-TO "{a}"))'
        ).format(a=safe)
        try:
            status, data = conn.uid("SEARCH", None, criteria)
        except imaplib.IMAP4.error as exc:
            raise ProviderError(f"فشل البحث في الصندوق: {exc}") from exc

        uids = data[0].split() if (status == "OK" and data and data[0]) else []
        if uids:
            return uids

        # Gmail لا يطابق ترويسات العناوين دائمًا بالبحث القياسي — نستخدم بحثه الأصلي.
        if "X-GM-EXT-1" in (conn.capabilities or ()):
            try:
                status, data = conn.uid("SEARCH", "X-GM-RAW", f'"to:{safe} OR deliveredto:{safe}"')
                if status == "OK" and data and data[0]:
                    return data[0].split()
            except imaplib.IMAP4.error:
                pass
        return []

    def list_messages(self, account: dict) -> list[dict]:
        with self._lock:
            conn = self._session()
            uids = self._search_uids(conn, account["address"])
            if not uids:
                return []
            # الأحدث أولًا — الـ UID يتزايد مع الوصول.
            recent = uids[-MAX_MESSAGES:]
            uid_set = b",".join(recent).decode("ascii")
            status, data = conn.uid(
                "FETCH",
                uid_set,
                "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE TO)])",
            )
            if status != "OK":
                raise ProviderError("تعذّر جلب قائمة الرسائل")
            self._conn_used_at = time.time()
            messages = [self._summary_from_fetch(item) for item in data if isinstance(item, tuple)]
            messages = [m for m in messages if m]
            messages.sort(key=lambda m: int(m["id"]), reverse=True)
            return messages

    def get_message(self, account: dict, message_id: str) -> dict:
        _require_uid(message_id)
        with self._lock:
            conn = self._session()
            status, data = conn.uid("FETCH", message_id, "(RFC822)")
            if status != "OK" or not data or not isinstance(data[0], tuple):
                raise ProviderError("الرسالة غير موجودة")
            raw = data[0][1]
            # وسم الرسالة كمقروءة بعد فتحها.
            try:
                conn.uid("STORE", message_id, "+FLAGS", "(\\Seen)")
            except Exception:
                pass
            self._conn_used_at = time.time()

        parsed = email.message_from_bytes(raw, policy=email.policy.default)
        return self._detail_from_message(parsed, message_id)

    def delete_message(self, account: dict, message_id: str) -> None:
        _require_uid(message_id)
        with self._lock:
            conn = self._session()
            try:
                conn.uid("STORE", message_id, "+FLAGS", "(\\Deleted)")
                conn.expunge()
            except imaplib.IMAP4.error as exc:
                raise ProviderError(f"تعذّر حذف الرسالة: {exc}") from exc
            self._conn_used_at = time.time()

    def get_attachment(self, account: dict, message_id: str, attachment_id: str) -> tuple[str, str, bytes]:
        _require_uid(message_id)
        with self._lock:
            conn = self._session()
            status, data = conn.uid("FETCH", message_id, "(RFC822)")
            if status != "OK" or not data or not isinstance(data[0], tuple):
                raise ProviderError("الرسالة غير موجودة")
            self._conn_used_at = time.time()
            raw = data[0][1]

        parsed = email.message_from_bytes(raw, policy=email.policy.default)
        for index, part in enumerate(_attachment_parts(parsed)):
            if str(index) == str(attachment_id):
                filename = part.get_filename() or f"attachment-{index}"
                return (
                    _decode_header(filename),
                    part.get_content_type() or "application/octet-stream",
                    part.get_payload(decode=True) or b"",
                )
        raise ProviderError("المرفق غير موجود")

    # -------------------------------------------------------------- أدوات
    @staticmethod
    def _summary_from_fetch(item: tuple) -> dict | None:
        meta, header_bytes = item[0], item[1]
        uid_match = _UID_RE.search(meta or b"")
        if not uid_match:
            return None
        flags = (_FLAGS_RE.search(meta or b"") or [None, b""])[1]
        headers = email.message_from_bytes(header_bytes or b"", policy=email.policy.default)
        name, address = parseaddr(_decode_header(headers.get("From", "")))
        return {
            "id": uid_match.group(1).decode("ascii"),
            "from_name": name,
            "from_address": address,
            "subject": _decode_header(headers.get("Subject", "")) or "(بدون عنوان)",
            "date": _header_date(headers.get("Date")),
            "seen": b"\\Seen" in flags,
            "intro": "",
            "has_attachments": False,  # يتطلب تحميل الجسم — يُحدَّد عند الفتح.
        }

    @staticmethod
    def _detail_from_message(parsed: EmailMessage, uid: str) -> dict:
        name, address = parseaddr(_decode_header(parsed.get("From", "")))
        html, text = "", ""
        try:
            html_part = parsed.get_body(preferencelist=("html",))
            if html_part is not None:
                html = html_part.get_content()
            text_part = parsed.get_body(preferencelist=("plain",))
            if text_part is not None:
                text = text_part.get_content()
        except Exception:
            # رسائل مشوّهة — نرجع لأبسط تمثيل ممكن.
            payload = parsed.get_payload(decode=True)
            if isinstance(payload, bytes):
                text = payload.decode("utf-8", "replace")

        attachments = []
        for index, part in enumerate(_attachment_parts(parsed)):
            payload = part.get_payload(decode=True) or b""
            attachments.append(
                {
                    "id": str(index),
                    "filename": _decode_header(part.get_filename() or f"attachment-{index}"),
                    "size": len(payload),
                    "content_type": part.get_content_type() or "application/octet-stream",
                }
            )

        return {
            "id": str(uid),
            "from_name": name,
            "from_address": address,
            "subject": _decode_header(parsed.get("Subject", "")) or "(بدون عنوان)",
            "date": _header_date(parsed.get("Date")),
            "seen": True,
            "intro": "",
            "has_attachments": bool(attachments),
            "to": [_decode_header(parsed.get("To", ""))],
            "html": html or "",
            "text": text or "",
            "attachments": attachments,
        }


def test_connection(config: dict) -> dict:
    """يختبر بيانات IMAP ويعيد نتيجة مفهومة للمستخدم."""
    probe = ImapCatchAllProvider(lambda: {"imap": config})
    if not (config.get("host") and config.get("username") and config.get("password")):
        raise ProviderError("أدخل الخادم واسم المستخدم وكلمة المرور أولًا.")
    conn = probe._connect(config)
    try:
        mailbox = config.get("mailbox") or "INBOX"
        status, data = conn.select(f'"{mailbox}"', readonly=True)
        if status != "OK":
            raise ProviderError(f"تم تسجيل الدخول، لكن تعذّر فتح المجلد «{mailbox}».")
        count = int(data[0]) if data and data[0] and data[0].isdigit() else 0
        return {"ok": True, "message": f"تم الاتصال بنجاح — {count} رسالة في «{mailbox}»."}
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def _attachment_parts(parsed: EmailMessage) -> list:
    """يعيد الأجزاء التي تُعد مرفقات (تتجاهل أجسام النص والصور المضمّنة)."""
    parts = []
    if not parsed.is_multipart():
        return parts
    for part in parsed.walk():
        if part.get_content_maintype() == "multipart":
            continue
        disposition = (part.get_content_disposition() or "").lower()
        if disposition == "attachment" or (disposition == "inline" and part.get_filename()):
            parts.append(part)
    return parts


def _decode_header(value: Any) -> str:
    """يفك ترميز الترويسات المشفّرة (=?UTF-8?B?...?=) بأمان."""
    if not value:
        return ""
    try:
        return str(make_header(decode_header(str(value))))
    except Exception:
        return str(value)


def _header_date(value: Any) -> str:
    if not value:
        return dt.datetime.now(dt.timezone.utc).isoformat()
    try:
        parsed = parsedate_to_datetime(str(value))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.isoformat()
    except (TypeError, ValueError):
        return dt.datetime.now(dt.timezone.utc).isoformat()


def _require_uid(message_id: str) -> None:
    """يمنع حقن أوامر IMAP عبر معرّف الرسالة."""
    if not str(message_id).isdigit():
        raise ProviderError("معرّف رسالة غير صالح")
