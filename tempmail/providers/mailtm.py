"""مزوّد mail.tm (و mail.gw — نفس الـ API بدومينات مختلفة).

يُنشئ صندوق بريد حقيقيًا لدى الخدمة، ويسمح باختيار اسم المستخدم والدومين
من قائمة الدومينات المتاحة.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from ..http_client import HttpError, RateLimiter, request, request_json
from .base import Provider, ProviderError, random_password


class MailTmProvider(Provider):
    id = "mailtm"
    name = "Mail.tm"
    description = "صندوق حقيقي يُنشأ فورًا، مع قائمة دومينات جاهزة."
    base_url = "https://api.mail.tm"

    def __init__(self) -> None:
        # الخدمة تحدّ الطلبات بـ 8 في الثانية.
        self._limiter = RateLimiter(max_calls=6, period=1.0)

    # ---------------------------------------------------------- داخلي
    def _call(self, method: str, path: str, *, token: str | None = None, **kwargs) -> Any:
        headers = kwargs.pop("headers", {}) or {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return request_json(
            method, f"{self.base_url}{path}", headers=headers, limiter=self._limiter, **kwargs
        )

    def _token(self, account: dict) -> str:
        """يعيد رمز الجلسة، ويجدّده تلقائيًا إذا انتهت صلاحيته."""
        token = account.get("token")
        if token:
            return token
        return self.refresh_token(account)

    def refresh_token(self, account: dict) -> str:
        try:
            data = self._call(
                "POST",
                "/token",
                json_body={"address": account["address"], "password": account["password"]},
            )
        except HttpError as exc:
            raise ProviderError(f"تعذّر تسجيل الدخول للصندوق: {exc}") from exc
        token = (data or {}).get("token")
        if not token:
            raise ProviderError("لم يُرجع الخادم رمز جلسة صالحًا")
        account["token"] = token
        return token

    def _authed(self, account: dict, method: str, path: str, **kwargs) -> Any:
        """ينفّذ طلبًا موثّقًا ويعيد المحاولة مرة واحدة بعد تجديد الرمز."""
        try:
            return self._call(method, path, token=self._token(account), **kwargs)
        except HttpError as exc:
            if exc.status == 401:
                return self._call(method, path, token=self.refresh_token(account), **kwargs)
            raise

    # -------------------------------------------------------- الدومينات
    def list_domains(self) -> list[str]:
        try:
            data = self._call("GET", "/domains", params={"page": 1})
        except HttpError as exc:
            raise ProviderError(f"تعذّر جلب الدومينات: {exc}") from exc
        members = _members(data)
        return [
            item["domain"]
            for item in members
            if item.get("isActive", True) and not item.get("isPrivate", False) and item.get("domain")
        ]

    # --------------------------------------------------------- الحسابات
    def create_account(self, local: str, domain: str) -> dict[str, Any]:
        address = f"{local}@{domain}"
        password = random_password()
        try:
            created = self._call(
                "POST", "/accounts", json_body={"address": address, "password": password}
            )
        except HttpError as exc:
            if exc.status in (409, 422):
                raise ProviderError(
                    "هذا العنوان محجوز أو غير مقبول لدى المزوّد. جرّب اسمًا آخر."
                ) from exc
            raise ProviderError(f"تعذّر إنشاء الصندوق: {exc}") from exc

        account = {
            "address": address,
            "domain": domain,
            "local": local,
            "password": password,
            "remote_id": (created or {}).get("id", ""),
            "token": "",
        }
        self.refresh_token(account)
        return account

    def delete_account(self, account: dict) -> None:
        remote_id = account.get("remote_id")
        if not remote_id:
            return
        try:
            self._authed(account, "DELETE", f"/accounts/{remote_id}")
        except HttpError:
            # حذف السجل محليًا أهم من نجاح الحذف عن بُعد.
            return

    # ---------------------------------------------------------- الرسائل
    def list_messages(self, account: dict) -> list[dict]:
        try:
            data = self._authed(account, "GET", "/messages", params={"page": 1})
        except HttpError as exc:
            raise ProviderError(f"تعذّر جلب الرسائل: {exc}") from exc
        return [self._summary(item) for item in _members(data)]

    def get_message(self, account: dict, message_id: str) -> dict:
        try:
            data = self._authed(account, "GET", f"/messages/{message_id}")
        except HttpError as exc:
            if exc.status == 404:
                raise ProviderError("الرسالة لم تعد موجودة") from exc
            raise ProviderError(f"تعذّر فتح الرسالة: {exc}") from exc

        html_parts = data.get("html") or []
        if isinstance(html_parts, str):
            html_parts = [html_parts]
        message = self._summary(data)
        message.update(
            {
                "to": [addr.get("address", "") for addr in (data.get("to") or [])],
                "html": "\n".join(html_parts) if html_parts else "",
                "text": data.get("text") or "",
                "attachments": [
                    {
                        "id": att.get("id", ""),
                        "filename": att.get("filename") or "attachment",
                        "size": att.get("size", 0),
                        "content_type": att.get("contentType", "application/octet-stream"),
                    }
                    for att in (data.get("attachments") or [])
                ],
            }
        )
        return message

    def delete_message(self, account: dict, message_id: str) -> None:
        try:
            self._authed(account, "DELETE", f"/messages/{message_id}")
        except HttpError as exc:
            raise ProviderError(f"تعذّر حذف الرسالة: {exc}") from exc

    def get_attachment(self, account: dict, message_id: str, attachment_id: str) -> tuple[str, str, bytes]:
        detail = self.get_message(account, message_id)
        meta = next((a for a in detail["attachments"] if a["id"] == attachment_id), None)
        if meta is None:
            raise ProviderError("المرفق غير موجود")
        url = f"{self.base_url}/messages/{message_id}/attachment/{attachment_id}"
        try:
            _status, body, _headers = request(
                "GET",
                url,
                headers={"Authorization": f"Bearer {self._token(account)}"},
                limiter=self._limiter,
            )
        except HttpError as exc:
            raise ProviderError(f"تعذّر تنزيل المرفق: {exc}") from exc
        return meta["filename"], meta["content_type"], body

    # ------------------------------------------------------------ أدوات
    @staticmethod
    def _summary(item: dict) -> dict:
        sender = item.get("from") or {}
        return {
            "id": item.get("id", ""),
            "from_name": sender.get("name") or "",
            "from_address": sender.get("address") or "",
            "subject": item.get("subject") or "(بدون عنوان)",
            "date": _iso(item.get("createdAt")),
            "seen": bool(item.get("seen")),
            "intro": item.get("intro") or "",
            "has_attachments": bool(item.get("hasAttachments")),
        }


class MailGwProvider(MailTmProvider):
    """نفس واجهة mail.tm لكن بدومينات أخرى — يفيد كبديل عند تعطّل الأول."""

    id = "mailgw"
    name = "Mail.gw"
    description = "بديل بنفس المزايا ودومينات مختلفة."
    base_url = "https://api.mail.gw"


def _members(data: Any) -> list[dict]:
    """يستخرج القائمة من رد Hydra أو من مصفوفة مباشرة."""
    if isinstance(data, dict):
        for key in ("hydra:member", "member"):
            if isinstance(data.get(key), list):
                return data[key]
        return []
    return data if isinstance(data, list) else []


def _iso(value: Any) -> str:
    """يوحّد التاريخ إلى ISO مع منطقة زمنية."""
    if not value:
        return dt.datetime.now(dt.timezone.utc).isoformat()
    text = str(value)
    try:
        parsed = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.isoformat()
    except ValueError:
        return text
