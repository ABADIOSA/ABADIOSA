"""الواجهة المشتركة لكل مزوّدات البريد."""

from __future__ import annotations

import random
import string
from typing import Any


class ProviderError(Exception):
    """خطأ يُعرض للمستخدم مباشرة بالعربية."""


class Provider:
    """كل مزوّد ينفّذ هذه الواجهة.

    صيغة رسالة الملخّص:
        {id, from_name, from_address, subject, date, seen, intro, has_attachments}
    صيغة الرسالة الكاملة تضيف:
        {to, html, text, attachments:[{id, filename, size, content_type}]}
    """

    id: str = ""
    name: str = ""
    description: str = ""
    supports_custom_local: bool = True
    supports_delete_message: bool = True
    requires_setup: bool = False

    # ---------------------------------------------------------- الدومينات
    def list_domains(self) -> list[str]:
        raise NotImplementedError

    # ----------------------------------------------------------- الحسابات
    def create_account(self, local: str, domain: str) -> dict[str, Any]:
        """يعيد حقول الحساب الخاصة بالمزوّد (تُدمج مع الحقول العامة)."""
        raise NotImplementedError

    def delete_account(self, account: dict) -> None:
        """حذف الحساب لدى المزوّد (اختياري)."""
        return None

    # ----------------------------------------------------------- الرسائل
    def list_messages(self, account: dict) -> list[dict]:
        raise NotImplementedError

    def get_message(self, account: dict, message_id: str) -> dict:
        raise NotImplementedError

    def delete_message(self, account: dict, message_id: str) -> None:
        raise ProviderError("هذا المزوّد لا يدعم حذف الرسائل")

    def get_attachment(self, account: dict, message_id: str, attachment_id: str) -> tuple[str, str, bytes]:
        """يعيد (اسم الملف، نوع المحتوى، البايتات)."""
        raise ProviderError("هذا المزوّد لا يدعم تنزيل المرفقات")

    # ------------------------------------------------------------ أدوات
    def describe(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "supports_custom_local": self.supports_custom_local,
            "supports_delete_message": self.supports_delete_message,
            "requires_setup": self.requires_setup,
            "ready": self.is_ready(),
            "setup_hint": self.setup_hint(),
            "address_prefix": self.address_prefix(),
        }

    def is_ready(self) -> bool:
        return True

    def setup_hint(self) -> str:
        return ""

    def address_prefix(self) -> str:
        """جزء ثابت يسبق ما يكتبه المستخدم (مثل «ahmad+») — للمعاينة فقط."""
        return ""


_ALPHABET = string.ascii_lowercase + string.digits


def random_local(length: int = 12) -> str:
    """اسم عشوائي للجزء الذي يسبق @ — يبدأ بحرف لتجنّب رفض بعض الخوادم."""
    rng = random.SystemRandom()
    return rng.choice(string.ascii_lowercase) + "".join(
        rng.choice(_ALPHABET) for _ in range(max(length - 1, 3))
    )


def random_password(length: int = 20) -> str:
    rng = random.SystemRandom()
    pool = string.ascii_letters + string.digits
    return "".join(rng.choice(pool) for _ in range(length))
