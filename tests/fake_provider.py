"""مزوّد وهمي للاختبار وللمعاينة بلا إنترنت."""

from __future__ import annotations

import datetime as dt

from tempmail.providers.base import Provider, ProviderError

_NOW = dt.datetime(2026, 8, 28, 10, 0, tzinfo=dt.timezone.utc)

SAMPLE = [
    {
        "id": "m1",
        "from_name": "متجر نون",
        "from_address": "no-reply@noon.example",
        "subject": "رمز التحقق الخاص بك هو 482913",
        "date": (_NOW - dt.timedelta(minutes=2)).isoformat(),
        "seen": False,
        "intro": "استخدم الرمز خلال 10 دقائق لإكمال تسجيل الدخول.",
        "has_attachments": False,
        "text": "رمز التحقق هو 482913. لا تشاركه مع أحد.",
        "html": "<div style='font-family:sans-serif'><h2>مرحبًا 👋</h2>"
                "<p>رمز التحقق الخاص بك هو <b style='font-size:22px'>482913</b></p>"
                "<p>ينتهي خلال 10 دقائق.</p></div>",
        "attachments": [],
    },
    {
        "id": "m2",
        "from_name": "GitHub",
        "from_address": "noreply@github.example",
        "subject": "Verify your email address",
        "date": (_NOW - dt.timedelta(hours=3)).isoformat(),
        "seen": False,
        "intro": "Please verify your email address to continue.",
        "has_attachments": True,
        "text": "Click the link to verify your account.",
        "html": "<p>Please <a href='https://example.com/verify'>verify your email</a>.</p>"
                "<img src='https://tracker.example/pixel.gif' width='1' height='1'>",
        "attachments": [
            {"id": "a1", "filename": "شروط-الاستخدام.pdf", "size": 20480,
             "content_type": "application/pdf"},
        ],
    },
    {
        "id": "m3",
        "from_name": "",
        "from_address": "newsletter@example.org",
        "subject": "(بدون عنوان)",
        "date": (_NOW - dt.timedelta(days=2)).isoformat(),
        "seen": True,
        "intro": "",
        "has_attachments": False,
        "text": "نص عادي بلا HTML.",
        "html": "",
        "attachments": [],
    },
]


class FakeProvider(Provider):
    id = "fake"
    name = "مزوّد تجريبي"
    description = "بيانات ثابتة للاختبار — لا يتصل بالإنترنت."

    def __init__(self) -> None:
        self.messages = [dict(m) for m in SAMPLE]

    def list_domains(self) -> list[str]:
        return ["demo.test", "mydomain.test"]

    def create_account(self, local: str, domain: str) -> dict:
        return {"address": f"{local}@{domain}", "domain": domain, "local": local,
                "password": "s3cret", "token": "tok"}

    def list_messages(self, account: dict) -> list[dict]:
        keys = ("id", "from_name", "from_address", "subject", "date", "seen", "intro",
                "has_attachments")
        return [{k: m[k] for k in keys} for m in self.messages]

    def get_message(self, account: dict, message_id: str) -> dict:
        for message in self.messages:
            if message["id"] == message_id:
                return dict(message, to=[account["address"]])
        raise ProviderError("الرسالة غير موجودة")

    def delete_message(self, account: dict, message_id: str) -> None:
        before = len(self.messages)
        self.messages = [m for m in self.messages if m["id"] != message_id]
        if len(self.messages) == before:
            raise ProviderError("الرسالة غير موجودة")

    def get_attachment(self, account: dict, message_id: str, attachment_id: str):
        return "شروط-الاستخدام.pdf", "application/pdf", b"%PDF-1.4 fake"
