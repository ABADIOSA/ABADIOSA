"""مزوّد الأسماء البديلة (+alias) على Gmail و Outlook وأي صندوق IMAP.

لماذا هذا المزوّد؟
لا يمكن لأي تطبيق إنشاء صندوق جديد على gmail.com أو outlook.com — هذه الدومينات
تملكها جوجل ومايكروسوفت وحدهما. لكن أغلب مزوّدي البريد يدعمون «الوسم بالزائد»:

    ahmad@gmail.com  →  ahmad+netflix@gmail.com

كلاهما يصل إلى الصندوق نفسه، لكن كل موقع يحصل على عنوان مختلف. فيصبح لديك
عنوان حقيقي على @gmail.com لكل خدمة، وتعرف من سرّب بريدك، وتحذف ما لا تريد.

يعتمد على نفس اتصال IMAP الخاص بمزوّد الدومين الشخصي، ويعرض لكل وسم رسائله فقط.
"""

from __future__ import annotations

from typing import Any

from .base import ProviderError
from .imap_catchall import ImapCatchAllProvider


class AliasProvider(ImapCatchAllProvider):
    id = "alias"
    name = "Gmail / Outlook (اسم بديل)"
    description = "عنوان حقيقي على دومين بريدك يصل إلى صندوقك — عبر الوسم بالزائد (+)."
    requires_setup = True

    # ------------------------------------------------------------ الإعداد
    def is_ready(self) -> bool:
        config = self._config()
        return bool(config.get("host") and config.get("username") and config.get("password"))

    def setup_hint(self) -> str:
        return (
            "افتح الإعدادات وأدخل بيانات صندوقك (Gmail أو Outlook أو غيرهما) عبر IMAP — "
            "لا تحتاج دومينًا خاصًا لهذا الخيار."
        )

    def _base_and_domain(self) -> tuple[str, str]:
        """يستخرج (الاسم، الدومين) من بريد المستخدم في الإعدادات."""
        username = (self._config().get("username") or "").strip().lower()
        local, _, domain = username.partition("@")
        if not local or not domain:
            raise ProviderError(
                "اسم المستخدم في الإعدادات يجب أن يكون بريدًا كاملًا مثل you@gmail.com"
            )
        # لو كان الاسم يحمل وسمًا أصلًا نأخذ الجزء الأساسي فقط.
        base = local.split("+", 1)[0]
        return base, domain

    def address_prefix(self) -> str:
        try:
            base, _domain = self._base_and_domain()
        except ProviderError:
            return ""
        return f"{base}+"

    # ---------------------------------------------------------- الدومينات
    def list_domains(self) -> list[str]:
        _base, domain = self._base_and_domain()
        return [domain]

    # ----------------------------------------------------------- الحسابات
    def create_account(self, local: str, domain: str) -> dict[str, Any]:
        base, own_domain = self._base_and_domain()
        if domain.lower() != own_domain:
            raise ProviderError(
                f"هذا الخيار يعمل على دومين بريدك فقط ({own_domain})."
            )

        tag = local.strip().lower().lstrip("+")
        if not tag:
            raise ProviderError("اكتب وسمًا للعنوان، مثل: netflix")
        if tag == base:
            raise ProviderError("اختر وسمًا مختلفًا عن اسم بريدك الأساسي.")

        return {
            "address": f"{base}+{tag}@{own_domain}",
            "domain": own_domain,
            "local": tag,
            "password": "",
            "token": "",
        }
