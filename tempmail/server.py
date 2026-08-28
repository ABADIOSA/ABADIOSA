"""خادم محلي صغير يقدّم الواجهة وواجهة برمجية على 127.0.0.1 فقط.

الحماية: المنفذ عشوائي، الاستماع على العنوان المحلي فقط، وكل طلب يتطلب رمزًا
سرّيًا يُولَّد عند التشغيل ويُحقن في الصفحة — حتى لا يستطيع أي موقع مفتوح في
المتصفح أن يقرأ بريدك عبر localhost.
"""

from __future__ import annotations

import json
import mimetypes
import re
import secrets
import threading
import traceback
import urllib.parse
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import __version__, auth, autostart, notifier
from .paths import web_dir
from .providers import ProviderRegistry, ProviderError, imap_test_connection, random_local
from . import store

TOKEN_PLACEHOLDER = "{{TEMPMAIL_AUTH_TOKEN}}"

LOCAL_PART_RE = re.compile(r"^[a-z0-9](?:[a-z0-9._+-]{0,62})$")
DOMAIN_RE = re.compile(r"^[a-z0-9](?:[a-z0-9.-]{0,253})\.[a-z]{2,}$")


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class AppState:
    """يجمع الحالة المشتركة بين الطلبات.

    وضعان: سطح المكتب (رمز واحد يُحقن في الصفحة، استماع محلي فقط)، ووضع
    السيرفر (كلمة مرور وجلسات وحدّ لمحاولات الدخول).
    """

    def __init__(self, password_hash: str = "") -> None:
        self.token = secrets.token_urlsafe(32)
        self.registry = ProviderRegistry(store.load_settings)
        self.shutdown_event = threading.Event()

        self.password_hash = password_hash
        self.server_mode = bool(password_hash)
        self.sessions = auth.SessionStore()
        self.throttle = auth.LoginThrottle()

    def allow_quit(self) -> bool:
        """إيقاف الخادم عن بُعد ممنوع في وضع السيرفر."""
        return not self.server_mode


# ------------------------------------------------------------------ منطق العمل

def _validate_new_address(local: str, domain: str) -> tuple[str, str]:
    local = (local or "").strip().lower()
    domain = (domain or "").strip().lower().lstrip("@")
    if not local:
        local = random_local()
    if not LOCAL_PART_RE.match(local):
        raise ApiError(
            "اسم غير صالح. استخدم حروفًا إنجليزية صغيرة وأرقامًا و . _ + - فقط "
            "(ويبدأ بحرف أو رقم)."
        )
    if not DOMAIN_RE.match(domain):
        raise ApiError("دومين غير صالح.")
    return local, domain


def create_account(state: AppState, payload: dict) -> dict:
    provider_id = payload.get("provider") or ""
    provider = state.registry.get(provider_id)
    local, domain = _validate_new_address(payload.get("local", ""), payload.get("domain", ""))

    available = provider.list_domains()
    if domain not in [d.lower() for d in available]:
        raise ApiError("هذا الدومين غير متاح لدى هذا المزوّد.")

    fields = provider.create_account(local, domain)
    account = {
        "id": uuid.uuid4().hex,
        "provider": provider_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "label": (payload.get("label") or "").strip()[:60],
        **fields,
    }
    if any(a["address"].lower() == account["address"].lower() for a in store.load_accounts()):
        raise ApiError("هذا العنوان مضاف لديك بالفعل.")
    store.add_account(account)
    return store.public_account(account)


def _account_and_provider(state: AppState, account_id: str):
    account = store.get_account(account_id)
    if account is None:
        raise ApiError("العنوان غير موجود", status=404)
    return account, state.registry.get(account["provider"])


def delete_account(state: AppState, account_id: str) -> dict:
    account, provider = _account_and_provider(state, account_id)
    try:
        provider.delete_account(account)
    except ProviderError:
        pass  # الحذف المحلي يتم في كل الأحوال
    store.delete_account(account_id)
    return {"ok": True}


def is_blocked(address: str, blocked: list[str]) -> bool:
    """يطابق عنوانًا كاملًا، أو دومينًا كاملًا إذا بدأ المدخل بـ @."""
    sender = (address or "").strip().lower()
    if not sender:
        return False
    for entry in blocked:
        rule = (entry or "").strip().lower()
        if not rule:
            continue
        if rule.startswith("@"):
            if sender.endswith(rule):
                return True
        elif sender == rule:
            return True
    return False


def list_messages(state: AppState, account_id: str) -> dict:
    account, provider = _account_and_provider(state, account_id)
    messages = provider.list_messages(account)

    blocked = store.load_settings().get("blocked_senders", []) or []
    if blocked:
        messages = [m for m in messages if not is_blocked(m.get("from_address", ""), blocked)]
    # قد يُجدَّد رمز الجلسة أثناء الجلب — نحفظه لتفادي تسجيل دخول متكرر.
    if account.get("token"):
        store.update_account(account_id, {"token": account["token"]})
    return {"messages": messages}


def get_message(state: AppState, account_id: str, message_id: str) -> dict:
    account, provider = _account_and_provider(state, account_id)
    return {"message": provider.get_message(account, message_id)}


def delete_message(state: AppState, account_id: str, message_id: str) -> dict:
    account, provider = _account_and_provider(state, account_id)
    provider.delete_message(account, message_id)
    return {"ok": True}


# أقصى عدد رسائل يُصدَّر مرة واحدة — يحمي من انتظار طويل مع المزوّدات البطيئة.
EXPORT_LIMIT = 50


def export_messages(state: AppState, account_id: str) -> dict:
    """يجمع الرسائل مع أجسامها في بنية واحدة قابلة للحفظ."""
    account, provider = _account_and_provider(state, account_id)
    summaries = provider.list_messages(account)[:EXPORT_LIMIT]

    messages = []
    for summary in summaries:
        try:
            messages.append(provider.get_message(account, summary["id"]))
        except ProviderError:
            # رسالة حُذفت أثناء التصدير — نكتفي بملخّصها.
            messages.append(summary)

    return {
        "address": account["address"],
        "provider": account["provider"],
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "count": len(messages),
        "messages": messages,
    }


def save_settings(payload: dict) -> dict:
    settings = store.load_settings()
    incoming = dict(payload or {})

    if "refresh_seconds" in incoming:
        try:
            incoming["refresh_seconds"] = max(5, min(300, int(incoming["refresh_seconds"])))
        except (TypeError, ValueError):
            incoming.pop("refresh_seconds")

    blocked = incoming.get("blocked_senders")
    if isinstance(blocked, list):
        cleaned, seen = [], set()
        for entry in blocked:
            rule = str(entry or "").strip().lower()
            if rule and rule not in seen and len(rule) <= 254:
                seen.add(rule)
                cleaned.append(rule)
        incoming["blocked_senders"] = cleaned[:500]
    elif blocked is not None:
        incoming.pop("blocked_senders")

    imap_in = incoming.get("imap")
    if isinstance(imap_in, dict):
        imap_in.pop("has_password", None)
        # كلمة مرور فارغة تعني «أبقِ الحالية» بدل مسحها بالخطأ.
        if not imap_in.get("password"):
            imap_in.pop("password", None)
        if "port" in imap_in:
            try:
                imap_in["port"] = max(1, min(65535, int(imap_in["port"])))
            except (TypeError, ValueError):
                imap_in.pop("port")

    return store.public_settings(store.save_settings(incoming))


def test_imap(payload: dict) -> dict:
    config = dict(store.load_settings().get("imap", {}))
    incoming = dict(payload or {})
    incoming.pop("has_password", None)
    if not incoming.get("password"):
        incoming.pop("password", None)
    config.update(incoming)
    return imap_test_connection(config)


def bootstrap(state: AppState) -> dict:
    settings = store.load_settings()
    return {
        "version": __version__,
        "providers": state.registry.describe_all(),
        "accounts": [store.public_account(a) for a in store.load_accounts()],
        "settings": store.public_settings(settings),
        "secure_storage": __import__("tempmail.secrets_store", fromlist=["x"]).dpapi_available(),
        "desktop_notifications": notifier.available(),
        "autostart_supported": autostart.available(),
        "autostart_enabled": autostart.is_enabled(),
        "server_mode": state.server_mode,
    }


# ------------------------------------------------------------------- المعالِج

class Handler(BaseHTTPRequestHandler):
    server_version = f"TempMailWin/{__version__}"
    protocol_version = "HTTP/1.1"
    state: AppState  # يُضبط من خلال الخادم

    # -------------------------------------------------------------- أدوات
    def log_message(self, fmt, *args):  # كتم سجلّ الطلبات الافتراضي
        pass

    def _send(self, status: int, body: bytes, content_type: str, extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, payload, status: int = 200, extra: dict | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8", extra)

    def _error(self, message: str, status: int = 400) -> None:
        self._json({"error": message}, status=status)

    def _read_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        if length > 1_000_000:
            raise ApiError("حجم الطلب كبير جدًا", status=413)
        try:
            return json.loads(self.rfile.read(length).decode("utf-8")) or {}
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ApiError("محتوى الطلب غير صالح") from exc

    def _client_ip(self) -> str:
        """خلف وكيل عكسي نأخذ أول عنوان في X-Forwarded-For."""
        forwarded = self.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:60]
        return self.client_address[0] if self.client_address else "?"

    def _session_token(self) -> str:
        """رمز الجلسة الصالح لهذا الطلب، أو نص فارغ."""
        if not self.state.server_mode:
            return self.state.token
        session_id = auth.parse_cookie(self.headers.get("Cookie", ""), auth.COOKIE_NAME)
        return self.state.sessions.token_for(session_id) or ""

    def _authorized(self, query: dict) -> bool:
        expected = self._session_token()
        if not expected:
            return False
        token = self.headers.get("X-Auth-Token") or (query.get("t") or [""])[0]
        if not token or not secrets.compare_digest(token, expected):
            return False
        # منع مواقع خارجية من مناداة الواجهة البرمجية عبر المتصفح.
        origin = self.headers.get("Origin")
        if origin and not self._origin_allowed(origin):
            return False
        return True

    def _origin_allowed(self, origin: str) -> bool:
        if self.state.server_mode:
            # خلف وكيل عكسي، النطاق المعلن هو المرجع الوحيد المتاح.
            host = self.headers.get("Host", "")
            return origin.split("://")[-1] == host
        return origin in (f"http://127.0.0.1:{self.server.server_port}",
                          f"http://localhost:{self.server.server_port}")

    # ------------------------------------------------------------ التوجيه
    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def _dispatch(self, method: str) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/" or path == "/index.html":
                if self.state.server_mode and not self._session_token():
                    return self._serve_page("login.html")
                return self._serve_index()
            if path == "/api/login" and method == "POST":
                return self._handle_login()
            if path == "/api/logout" and method == "POST":
                return self._handle_logout()
            if path.startswith("/static/"):
                return self._serve_static(path[len("/static/"):])
            if path.startswith("/api/"):
                if not self._authorized(query):
                    return self._error("طلب غير مصرّح به", status=403)
                return self._serve_api(method, path, query)
            return self._error("غير موجود", status=404)
        except ApiError as exc:
            self._error(str(exc), status=exc.status)
        except ProviderError as exc:
            self._error(str(exc), status=502)
        except BrokenPipeError:
            pass
        except Exception:
            traceback.print_exc()
            self._error("حدث خطأ غير متوقع داخل التطبيق", status=500)

    # ------------------------------------------------------------ الدخول
    def _handle_login(self) -> None:
        ip = self._client_ip()
        wait = self.state.throttle.retry_after(ip)
        if wait:
            minutes = max(1, wait // 60)
            raise ApiError(
                f"محاولات كثيرة. حاول بعد {minutes} دقيقة.", status=429)

        password = str(self._read_body().get("password") or "")
        if not auth.verify_password(password, self.state.password_hash):
            self.state.throttle.record_failure(ip)
            raise ApiError("كلمة المرور غير صحيحة", status=401)

        self.state.throttle.record_success(ip)
        session_id, _token = self.state.sessions.create()
        # Secure يُضاف خلف HTTPS؛ نستدل عليه من ترويسة الوكيل العكسي.
        https = self.headers.get("X-Forwarded-Proto", "").lower() == "https"
        cookie = (
            f"{auth.COOKIE_NAME}={session_id}; Path=/; HttpOnly; SameSite=Lax; "
            f"Max-Age={auth.SESSION_TTL_SECONDS}" + ("; Secure" if https else "")
        )
        self._json({"ok": True}, extra={"Set-Cookie": cookie})

    def _handle_logout(self) -> None:
        session_id = auth.parse_cookie(self.headers.get("Cookie", ""), auth.COOKIE_NAME)
        self.state.sessions.destroy(session_id)
        self._json(
            {"ok": True},
            extra={"Set-Cookie": f"{auth.COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0"},
        )

    # ------------------------------------------------------------ الواجهة
    def _serve_page(self, name: str) -> None:
        try:
            html = (web_dir() / name).read_text(encoding="utf-8")
        except OSError:
            return self._error("تعذّر تحميل صفحة التطبيق", status=500)
        self._send(200, html.encode("utf-8"), "text/html; charset=utf-8",
                   {"Cache-Control": "no-store"})

    def _serve_index(self) -> None:
        index = web_dir() / "index.html"
        try:
            html = index.read_text(encoding="utf-8")
        except OSError:
            return self._error("تعذّر تحميل واجهة التطبيق", status=500)
        # حقن رمز الجلسة داخل الصفحة بدل تمريره في الرابط.
        html = html.replace(TOKEN_PLACEHOLDER, self._session_token())
        self._send(200, html.encode("utf-8"), "text/html; charset=utf-8",
                   {"Cache-Control": "no-store"})

    def _serve_static(self, relative: str) -> None:
        base = web_dir().resolve()
        target = (base / relative).resolve()
        # منع الخروج خارج مجلد الموارد.
        if not str(target).startswith(str(base)) or not target.is_file():
            return self._error("غير موجود", status=404)
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type == "application/javascript":
            content_type += "; charset=utf-8"
        self._send(200, target.read_bytes(), content_type, {"Cache-Control": "no-store"})

    # ------------------------------------------------------- واجهة برمجية
    def _serve_api(self, method: str, path: str, query: dict) -> None:
        state = self.state

        if method == "GET" and path == "/api/bootstrap":
            return self._json(bootstrap(state))

        if method == "GET" and path == "/api/domains":
            provider_id = (query.get("provider") or [""])[0]
            provider = state.registry.get(provider_id)
            return self._json({"domains": provider.list_domains()})

        if method == "GET" and path == "/api/random-local":
            return self._json({"local": random_local()})

        if method == "POST" and path == "/api/accounts":
            return self._json({"account": create_account(state, self._read_body())}, status=201)

        if method == "GET" and path == "/api/accounts":
            return self._json({"accounts": [store.public_account(a) for a in store.load_accounts()]})

        if method == "POST" and path == "/api/settings":
            return self._json({"settings": save_settings(self._read_body())})

        if method == "POST" and path == "/api/imap/test":
            return self._json(test_imap(self._read_body()))

        if method == "POST" and path == "/api/notify":
            body = self._read_body()
            settings = store.load_settings()
            sent = False
            if settings.get("notify_desktop", True):
                sent = notifier.notify(
                    str(body.get("title") or "رسالة جديدة")[:120],
                    str(body.get("body") or "")[:400],
                )
            return self._json({"sent": sent})

        if method == "POST" and path == "/api/autostart":
            body = self._read_body()
            if not autostart.available():
                raise ApiError("التشغيل التلقائي متاح على ويندوز فقط.")
            try:
                enabled = autostart.set_enabled(bool(body.get("enabled")))
            except OSError as exc:
                raise ApiError(f"تعذّر تعديل التشغيل التلقائي: {exc}") from exc
            return self._json({"enabled": enabled})

        if method == "POST" and path == "/api/quit":
            if not state.allow_quit():
                raise ApiError("إيقاف الخادم غير متاح في وضع السيرفر.", status=403)
            state.shutdown_event.set()
            return self._json({"ok": True})

        match = re.fullmatch(r"/api/accounts/([0-9a-f]{32})", path)
        if match and method == "DELETE":
            return self._json(delete_account(state, match.group(1)))

        match = re.fullmatch(r"/api/accounts/([0-9a-f]{32})/messages", path)
        if match and method == "GET":
            return self._json(list_messages(state, match.group(1)))

        match = re.fullmatch(r"/api/accounts/([0-9a-f]{32})/export", path)
        if match and method == "GET":
            data = export_messages(state, match.group(1))
            body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
            safe = re.sub(r"[^A-Za-z0-9._-]", "_", data["address"])
            return self._send(
                200, body, "application/json; charset=utf-8",
                {"Content-Disposition": f'attachment; filename="{safe}-{stamp}.json"',
                 "Cache-Control": "no-store"},
            )

        match = re.fullmatch(r"/api/accounts/([0-9a-f]{32})/messages/([^/]+)", path)
        if match:
            account_id, message_id = match.group(1), urllib.parse.unquote(match.group(2))
            if method == "GET":
                return self._json(get_message(state, account_id, message_id))
            if method == "DELETE":
                return self._json(delete_message(state, account_id, message_id))

        match = re.fullmatch(r"/api/accounts/([0-9a-f]{32})/messages/([^/]+)/attachments/(.+)", path)
        if match and method == "GET":
            return self._serve_attachment(
                match.group(1),
                urllib.parse.unquote(match.group(2)),
                urllib.parse.unquote(match.group(3)),
            )

        return self._error("مسار غير معروف", status=404)

    def _serve_attachment(self, account_id: str, message_id: str, attachment_id: str) -> None:
        account, provider = _account_and_provider(self.state, account_id)
        filename, content_type, data = provider.get_attachment(account, message_id, attachment_id)
        safe_ascii = re.sub(r'[^A-Za-z0-9._-]', "_", filename) or "attachment"
        quoted = urllib.parse.quote(filename)
        self._send(
            200,
            data,
            content_type or "application/octet-stream",
            {
                # RFC 5987 حتى تظهر أسماء الملفات العربية صحيحة.
                "Content-Disposition": f"attachment; filename=\"{safe_ascii}\"; filename*=UTF-8''{quoted}",
                "Cache-Control": "no-store",
            },
        )


def build_server(state: AppState, port: int = 0, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    handler = type("BoundHandler", (Handler,), {"state": state})
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    return server
