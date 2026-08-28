"""مزوّد 1secmail — عناوين فورية بلا تسجيل.

ملاحظة: هذه الخدمة العامة قد تتوقف أحيانًا؛ التطبيق يتعامل مع ذلك بعرض
رسالة خطأ واضحة بدل الانهيار.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from ..http_client import HttpError, RateLimiter, request, request_json
from .base import Provider, ProviderError

BASE_URL = "https://www.1secmail.com/api/v1/"


class OneSecMailProvider(Provider):
    id = "1secmail"
    name = "1SecMail"
    description = "عنوان فوري بلا إنشاء حساب — لا يدعم حذف الرسائل."
    supports_delete_message = False

    def __init__(self) -> None:
        self._limiter = RateLimiter(max_calls=4, period=1.0)

    def _call(self, params: dict) -> Any:
        try:
            return request_json("GET", BASE_URL, params=params, limiter=self._limiter)
        except HttpError as exc:
            raise ProviderError(f"تعذّر الاتصال بـ 1SecMail: {exc}") from exc

    def list_domains(self) -> list[str]:
        data = self._call({"action": "getDomainList"})
        if not isinstance(data, list):
            raise ProviderError("رد غير متوقع من 1SecMail")
        return [str(d) for d in data if d]

    def create_account(self, local: str, domain: str) -> dict[str, Any]:
        # لا يوجد تسجيل — العنوان يصبح فعّالًا بمجرد استخدامه.
        return {
            "address": f"{local}@{domain}",
            "domain": domain,
            "local": local,
            "password": "",
            "token": "",
        }

    def list_messages(self, account: dict) -> list[dict]:
        data = self._call(
            {"action": "getMessages", "login": account["local"], "domain": account["domain"]}
        )
        if not isinstance(data, list):
            return []
        return [self._summary(item) for item in data]

    def get_message(self, account: dict, message_id: str) -> dict:
        data = self._call(
            {
                "action": "readMessage",
                "login": account["local"],
                "domain": account["domain"],
                "id": message_id,
            }
        )
        if not isinstance(data, dict) or not data.get("id"):
            raise ProviderError("الرسالة غير موجودة")
        message = self._summary(data)
        message.update(
            {
                "to": [account["address"]],
                "html": data.get("htmlBody") or "",
                "text": data.get("textBody") or data.get("body") or "",
                "attachments": [
                    {
                        # اسم الملف هو المعرّف لدى هذه الخدمة.
                        "id": att.get("filename", ""),
                        "filename": att.get("filename") or "attachment",
                        "size": att.get("size", 0),
                        "content_type": att.get("contentType", "application/octet-stream"),
                    }
                    for att in (data.get("attachments") or [])
                ],
            }
        )
        return message

    def get_attachment(self, account: dict, message_id: str, attachment_id: str) -> tuple[str, str, bytes]:
        try:
            _status, body, headers = request(
                "GET",
                BASE_URL,
                params={
                    "action": "download",
                    "login": account["local"],
                    "domain": account["domain"],
                    "id": message_id,
                    "file": attachment_id,
                },
                limiter=self._limiter,
            )
        except HttpError as exc:
            raise ProviderError(f"تعذّر تنزيل المرفق: {exc}") from exc
        content_type = headers.get("Content-Type", "application/octet-stream")
        return attachment_id or "attachment", content_type, body

    @staticmethod
    def _summary(item: dict) -> dict:
        return {
            "id": str(item.get("id", "")),
            "from_name": "",
            "from_address": item.get("from") or "",
            "subject": item.get("subject") or "(بدون عنوان)",
            "date": _parse_date(item.get("date")),
            # الخدمة لا تحفظ حالة القراءة — نعتمد على تتبّع محلي في الواجهة.
            "seen": False,
            "intro": "",
            "has_attachments": bool(item.get("attachments")),
        }


def _parse_date(value: Any) -> str:
    """يحوّل 'YYYY-MM-DD HH:MM:SS' إلى ISO بتوقيت UTC."""
    if not value:
        return dt.datetime.now(dt.timezone.utc).isoformat()
    try:
        parsed = dt.datetime.strptime(str(value), "%Y-%m-%d %H:%M:%S")
        return parsed.replace(tzinfo=dt.timezone.utc).isoformat()
    except ValueError:
        return str(value)
