"""المصادقة لوضع السيرفر.

في وضع سطح المكتب يستمع التطبيق على 127.0.0.1 برمز يُحقن في الصفحة، وهذا
كافٍ. أما عند النشر على الإنترنت فنحتاج كلمة مرور وجلسات وحدًّا لمحاولات
الدخول — وهذا ما توفّره هذه الوحدة، بمكتبات بايثون القياسية فقط.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time

PBKDF2_ROUNDS = 240_000
SESSION_TTL_SECONDS = 12 * 3600
COOKIE_NAME = "tempmail_session"

# حدّ محاولات الدخول لكل عنوان IP.
MAX_ATTEMPTS = 8
THROTTLE_WINDOW = 900        # نافذة العدّ (١٥ دقيقة)
LOCKOUT_SECONDS = 900        # مدة المنع بعد تجاوز الحد

MIN_PASSWORD_LENGTH = 10


# ------------------------------------------------------------- كلمة المرور

def hash_password(password: str, salt: bytes | None = None) -> str:
    """يشتق تجزئة PBKDF2-HMAC-SHA256 بملح عشوائي."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    """مقارنة بزمن ثابت لتفادي تسريب المعلومات عبر التوقيت."""
    try:
        algorithm, rounds, salt_hex, digest_hex = (encoded or "").split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        expected = bytes.fromhex(digest_hex)
        candidate = hashlib.pbkdf2_hmac(
            "sha256", (password or "").encode("utf-8"), bytes.fromhex(salt_hex), int(rounds)
        )
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(candidate, expected)


def password_problem(password: str) -> str:
    """يعيد سبب رفض كلمة المرور، أو نصًا فارغًا إن كانت مقبولة."""
    if not password:
        return "لم تُحدَّد كلمة مرور. اضبط المتغيّر TEMPMAIL_PASSWORD."
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"كلمة المرور قصيرة — تحتاج {MIN_PASSWORD_LENGTH} محارف على الأقل."
    return ""


# ----------------------------------------------------------------- الجلسات

class SessionStore:
    """جلسات في الذاكرة: معرّف في كوكي، ورمز يُرسل في ترويسة كل طلب.

    فصل الرمز عن الكوكي يمنع هجمات CSRF: المتصفح يرسل الكوكي تلقائيًا من أي
    موقع، لكنه لا يستطيع إضافة ترويسة مخصّصة عبر النطاقات.
    """

    def __init__(self, ttl: int = SESSION_TTL_SECONDS):
        self._ttl = ttl
        self._sessions: dict[str, dict] = {}
        self._lock = threading.Lock()

    def create(self) -> tuple[str, str]:
        session_id = secrets.token_urlsafe(24)
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._purge_locked()
            self._sessions[session_id] = {"token": token, "expires": time.time() + self._ttl}
        return session_id, token

    def token_for(self, session_id: str) -> str | None:
        if not session_id:
            return None
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            if session["expires"] < time.time():
                self._sessions.pop(session_id, None)
                return None
            return session["token"]

    def destroy(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id or "", None)

    def _purge_locked(self) -> None:
        now = time.time()
        for key in [k for k, v in self._sessions.items() if v["expires"] < now]:
            self._sessions.pop(key, None)

    def count(self) -> int:
        with self._lock:
            self._purge_locked()
            return len(self._sessions)


# ------------------------------------------------------------- حدّ المحاولات

class LoginThrottle:
    """يمنع تخمين كلمة المرور بتقييد المحاولات لكل عنوان."""

    def __init__(self, max_attempts: int = MAX_ATTEMPTS,
                 window: int = THROTTLE_WINDOW, lockout: int = LOCKOUT_SECONDS):
        self._max = max_attempts
        self._window = window
        self._lockout = lockout
        self._failures: dict[str, list[float]] = {}
        self._locked: dict[str, float] = {}
        self._lock = threading.Lock()

    def retry_after(self, ip: str) -> int:
        """صفر إذا كانت المحاولة مسموحة، أو عدد الثواني المتبقية للمنع."""
        with self._lock:
            until = self._locked.get(ip, 0)
            remaining = until - time.time()
            if remaining <= 0:
                self._locked.pop(ip, None)
                return 0
            return int(remaining) + 1

    def record_failure(self, ip: str) -> None:
        with self._lock:
            now = time.time()
            attempts = [t for t in self._failures.get(ip, []) if now - t < self._window]
            attempts.append(now)
            self._failures[ip] = attempts
            if len(attempts) >= self._max:
                self._locked[ip] = now + self._lockout
                self._failures.pop(ip, None)

    def record_success(self, ip: str) -> None:
        with self._lock:
            self._failures.pop(ip, None)
            self._locked.pop(ip, None)


def parse_cookie(header: str, name: str) -> str:
    """يستخرج قيمة كوكي واحدة من ترويسة Cookie بلا اعتماديات."""
    for chunk in (header or "").split(";"):
        key, _, value = chunk.strip().partition("=")
        if key == name:
            return value.strip()
    return ""
