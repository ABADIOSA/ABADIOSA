"""تشفير كلمات المرور المخزّنة محليًا.

على ويندوز نستخدم DPAPI (CryptProtectData) المرتبط بحساب المستخدم، فلا يستطيع
مستخدم آخر على نفس الجهاز فك التشفير. على الأنظمة الأخرى نكتفي بتمويه Base64
مع تحذير واضح في الواجهة — التمويه ليس أمانًا، لكنه أفضل من نص صريح.
"""

from __future__ import annotations

import base64
import os

_PREFIX_DPAPI = "dpapi:"
_PREFIX_PLAIN = "b64:"

_IS_WINDOWS = os.name == "nt"

if _IS_WINDOWS:  # pragma: no cover - يُنفَّذ على ويندوز فقط
    import ctypes
    from ctypes import wintypes

    class _DataBlob(ctypes.Structure):
        _fields_ = [
            ("cbData", wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_char)),
        ]

    def _make_blob(data: bytes):
        """يعيد (blob, buffer) — يجب الاحتفاظ بالـ buffer حتى انتهاء الاستدعاء."""
        buf = ctypes.create_string_buffer(data, len(data))
        blob = _DataBlob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
        return blob, buf

    def _take_blob(blob: "_DataBlob") -> bytes:
        try:
            return ctypes.string_at(blob.pbData, blob.cbData)
        finally:
            ctypes.windll.kernel32.LocalFree(blob.pbData)


def dpapi_available() -> bool:
    return _IS_WINDOWS


def encrypt(value: str) -> str:
    """يشفّر نصًا ويعيده كسلسلة قابلة للتخزين في JSON."""
    if not value:
        return ""
    raw = value.encode("utf-8")
    if _IS_WINDOWS:
        try:
            blob_in, _buf = _make_blob(raw)
            blob_out = _DataBlob()
            ok = ctypes.windll.crypt32.CryptProtectData(
                ctypes.byref(blob_in), "TempMailWin", None, None, None, 0, ctypes.byref(blob_out)
            )
            if ok:
                token = base64.b64encode(_take_blob(blob_out)).decode("ascii")
                return _PREFIX_DPAPI + token
        except Exception:
            pass
    return _PREFIX_PLAIN + base64.b64encode(raw).decode("ascii")


def decrypt(value: str) -> str:
    """يفك التشفير. يعيد النص كما هو إذا كان غير مشفّر (توافق مع ملفات قديمة)."""
    if not value:
        return ""
    if value.startswith(_PREFIX_DPAPI):
        if not _IS_WINDOWS:
            return ""
        try:
            payload = base64.b64decode(value[len(_PREFIX_DPAPI):])
            blob_in, _buf = _make_blob(payload)
            blob_out = _DataBlob()
            ok = ctypes.windll.crypt32.CryptUnprotectData(
                ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)
            )
            if ok:
                return _take_blob(blob_out).decode("utf-8", "replace")
        except Exception:
            pass
        return ""
    if value.startswith(_PREFIX_PLAIN):
        try:
            return base64.b64decode(value[len(_PREFIX_PLAIN):]).decode("utf-8", "replace")
        except Exception:
            return ""
    return value
