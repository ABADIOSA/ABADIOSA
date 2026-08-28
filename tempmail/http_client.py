"""عميل HTTP بسيط فوق urllib — بلا اعتماديات خارجية."""

from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

USER_AGENT = "TempMailWin/1.0 (+https://github.com/abadiosa/abadiosa)"
DEFAULT_TIMEOUT = 20


class HttpError(Exception):
    """خطأ HTTP مع رمز الحالة ونص الرد."""

    def __init__(self, status: int, message: str, body: str = ""):
        super().__init__(message)
        self.status = status
        self.body = body


class RateLimiter:
    """محدِّد معدّل بسيط — بعض المزوّدات ترفض أكثر من 8 طلبات بالثانية."""

    def __init__(self, max_calls: int, period: float = 1.0):
        self.max_calls = max_calls
        self.period = period
        self._calls: list[float] = []
        self._lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            with self._lock:
                now = time.monotonic()
                self._calls = [t for t in self._calls if now - t < self.period]
                if len(self._calls) < self.max_calls:
                    self._calls.append(now)
                    return
                wait = self.period - (now - self._calls[0])
            time.sleep(max(wait, 0.01))


def request(
    method: str,
    url: str,
    *,
    params: dict | None = None,
    json_body: Any = None,
    headers: dict | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    limiter: RateLimiter | None = None,
    retries: int = 2,
) -> tuple[int, bytes, dict]:
    """ينفّذ طلبًا ويعيد (status, body, headers). يعيد المحاولة عند 429/5xx."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    data = None
    all_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        all_headers["Content-Type"] = "application/json"
    all_headers.update(headers or {})

    last_error: Exception | None = None
    for attempt in range(retries + 1):
        if limiter:
            limiter.acquire()
        req = urllib.request.Request(url, data=data, headers=all_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.status, response.read(), dict(response.headers)
        except urllib.error.HTTPError as exc:
            body = exc.read()
            if exc.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(0.6 * (2 ** attempt))
                last_error = exc
                continue
            raise HttpError(exc.code, _http_message(exc.code), body.decode("utf-8", "replace")) from exc
        except urllib.error.URLError as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(0.6 * (2 ** attempt))
                continue
            raise HttpError(0, f"تعذّر الاتصال بالخادم: {exc.reason}") from exc
        except TimeoutError as exc:
            last_error = exc
            if attempt < retries:
                continue
            raise HttpError(0, "انتهت مهلة الاتصال") from exc

    raise HttpError(0, f"فشل الطلب: {last_error}")


def request_json(method: str, url: str, **kwargs) -> Any:
    """مثل request لكن يفك ترميز JSON."""
    _status, body, _headers = request(method, url, **kwargs)
    if not body:
        return None
    try:
        return json.loads(body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HttpError(0, "رد غير صالح من الخادم") from exc


def _http_message(code: int) -> str:
    return {
        400: "طلب غير صالح",
        401: "انتهت الجلسة أو بيانات الدخول غير صحيحة",
        403: "الوصول مرفوض",
        404: "غير موجود",
        409: "العنوان مستخدم بالفعل",
        422: "بيانات غير مقبولة (قد يكون العنوان محجوزًا أو الدومين غير متاح)",
        429: "تجاوزت حد الطلبات، انتظر قليلًا",
    }.get(code, f"خطأ من الخادم ({code})")
