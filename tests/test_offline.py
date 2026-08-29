"""اختبارات لا تحتاج إنترنت — تغطي التخزين والتحليل وواجهة HTTP كاملة."""

from __future__ import annotations

import email
import email.policy
import io
import json
import os
import re
import sys
import tempfile
import threading
import traceback
import unittest
import urllib.error
import urllib.request
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tempmail import secrets_store, store  # noqa: E402
from tempmail.providers.imap_catchall import (  # noqa: E402
    ImapCatchAllProvider, _attachment_parts, _decode_header, _header_date, _require_uid,
)
from tempmail.providers.alias import AliasProvider  # noqa: E402
from tempmail.providers.base import ProviderError, random_local  # noqa: E402
from tempmail.providers.mailtm import MailTmProvider, _iso, _members  # noqa: E402
from tempmail.providers.onesecmail import OneSecMailProvider, _parse_date  # noqa: E402
from tempmail import app as app_module  # noqa: E402
from tempmail import auth, autostart, notifier  # noqa: E402
from tempmail.server import (  # noqa: E402
    TOKEN_PLACEHOLDER, ApiError, AppState, _validate_new_address, build_server, is_blocked,
)
from tests.fake_provider import FakeProvider  # noqa: E402


class TempDataDir:
    """يحوّل مجلد بيانات التطبيق إلى مجلد مؤقت أثناء الاختبار."""

    def __enter__(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._original = store.data_dir
        store.data_dir = lambda: Path(self._tmp.name)
        return Path(self._tmp.name)

    def __exit__(self, *exc):
        store.data_dir = self._original
        self._tmp.cleanup()


class SecretsTests(unittest.TestCase):
    def test_round_trip(self):
        for value in ("hunter2", "كلمة سر عربية", "a" * 500):
            self.assertEqual(secrets_store.decrypt(secrets_store.encrypt(value)), value)

    def test_empty_and_legacy_plaintext(self):
        self.assertEqual(secrets_store.encrypt(""), "")
        self.assertEqual(secrets_store.decrypt(""), "")
        # قيمة قديمة غير مشفّرة تُقرأ كما هي
        self.assertEqual(secrets_store.decrypt("legacy-plain"), "legacy-plain")


class StoreTests(unittest.TestCase):
    def test_settings_defaults_and_merge(self):
        with TempDataDir():
            settings = store.load_settings()
            self.assertEqual(settings["refresh_seconds"], 10)
            self.assertIn("imap", settings)

            store.save_settings({"refresh_seconds": 30, "imap": {"host": "imap.test"}})
            reloaded = store.load_settings()
            self.assertEqual(reloaded["refresh_seconds"], 30)
            self.assertEqual(reloaded["imap"]["host"], "imap.test")
            # المفاتيح غير المذكورة تبقى كما هي
            self.assertEqual(reloaded["imap"]["mailbox"], "INBOX")

    def test_password_encrypted_at_rest(self):
        with TempDataDir() as path:
            store.save_settings({"imap": {"password": "topsecret"}})
            raw = (path / "settings.json").read_text(encoding="utf-8")
            self.assertNotIn("topsecret", raw)
            self.assertEqual(store.load_settings()["imap"]["password"], "topsecret")

    def test_public_settings_hides_password(self):
        with TempDataDir():
            store.save_settings({"imap": {"password": "topsecret"}})
            public = store.public_settings(store.load_settings())
            self.assertEqual(public["imap"]["password"], "")
            self.assertTrue(public["imap"]["has_password"])

    def test_account_crud(self):
        with TempDataDir():
            account = {"id": "a" * 32, "provider": "fake", "address": "x@y.test",
                       "domain": "y.test", "local": "x", "password": "pw"}
            store.add_account(account)
            self.assertEqual(len(store.load_accounts()), 1)
            self.assertEqual(store.get_account("a" * 32)["password"], "pw")

            with self.assertRaises(ValueError):
                store.add_account(account)

            store.update_account("a" * 32, {"token": "t2"})
            self.assertEqual(store.get_account("a" * 32)["token"], "t2")

            self.assertTrue(store.delete_account("a" * 32))
            self.assertFalse(store.delete_account("a" * 32))

    def test_corrupt_file_falls_back_to_defaults(self):
        with TempDataDir() as path:
            (path / "settings.json").write_text("{not json", encoding="utf-8")
            self.assertEqual(store.load_settings()["refresh_seconds"], 10)


class ValidationTests(unittest.TestCase):
    def test_valid_addresses(self):
        self.assertEqual(_validate_new_address("Ali.99", "Example.COM"), ("ali.99", "example.com"))
        self.assertEqual(_validate_new_address("a+b", "sub.example.com")[0], "a+b")

    def test_empty_local_becomes_random(self):
        local, _ = _validate_new_address("", "example.com")
        self.assertTrue(local.isalnum() and len(local) >= 4)

    def test_rejects_bad_input(self):
        for local, domain in [
            ("has space", "example.com"),
            ("عربي", "example.com"),
            ("a" * 70, "example.com"),
            (".start", "example.com"),
            ("ok", "no-tld"),
            ("ok", "-bad.com"),
        ]:
            with self.assertRaises(ApiError, msg=f"{local}@{domain}"):
                _validate_new_address(local, domain)

    def test_random_local_is_usable(self):
        for _ in range(50):
            local, _ = _validate_new_address(random_local(), "example.com")
            self.assertTrue(local)


class MailTmParsingTests(unittest.TestCase):
    def test_members_shapes(self):
        self.assertEqual(_members({"hydra:member": [{"a": 1}]}), [{"a": 1}])
        self.assertEqual(_members([{"a": 1}]), [{"a": 1}])
        self.assertEqual(_members({"unexpected": 1}), [])
        self.assertEqual(_members(None), [])

    def test_iso_normalisation(self):
        self.assertTrue(_iso("2026-08-28T10:00:00+00:00").startswith("2026-08-28T10:00"))
        self.assertTrue(_iso("2026-08-28T10:00:00Z").endswith("+00:00"))
        self.assertTrue(_iso(None))

    def test_summary_defaults(self):
        summary = MailTmProvider._summary({"id": "1", "from": {}, "createdAt": None})
        self.assertEqual(summary["subject"], "(بدون عنوان)")
        self.assertFalse(summary["seen"])

    def test_domain_filtering(self):
        provider = MailTmProvider()
        provider._call = lambda *a, **k: {"hydra:member": [
            {"domain": "good.com", "isActive": True, "isPrivate": False},
            {"domain": "inactive.com", "isActive": False, "isPrivate": False},
            {"domain": "private.com", "isActive": True, "isPrivate": True},
        ]}
        self.assertEqual(provider.list_domains(), ["good.com"])


class OneSecMailTests(unittest.TestCase):
    def test_date_parsing(self):
        self.assertTrue(_parse_date("2026-08-28 10:00:00").startswith("2026-08-28T10:00"))
        self.assertTrue(_parse_date("garbage"))

    def test_summary(self):
        summary = OneSecMailProvider._summary({"id": 7, "from": "a@b.com", "subject": "hi",
                                               "date": "2026-08-28 10:00:00"})
        self.assertEqual(summary["id"], "7")


class ImapParsingTests(unittest.TestCase):
    def _message(self) -> EmailMessage:
        msg = EmailMessage()
        msg["From"] = "خدمة العملاء <support@example.com>"
        msg["To"] = "test@mydomain.com"
        msg["Subject"] = "رمز التحقق"
        msg["Date"] = "Fri, 28 Aug 2026 10:00:00 +0300"
        msg.set_content("الرمز هو 123456")
        msg.add_alternative("<p>الرمز هو <b>123456</b></p>", subtype="html")
        msg.add_attachment(b"PDF", maintype="application", subtype="pdf", filename="فاتورة.pdf")
        return email.message_from_bytes(msg.as_bytes(), policy=email.policy.default)

    def test_detail_extraction(self):
        detail = ImapCatchAllProvider._detail_from_message(self._message(), "42")
        self.assertEqual(detail["subject"], "رمز التحقق")
        self.assertEqual(detail["from_address"], "support@example.com")
        self.assertEqual(detail["from_name"], "خدمة العملاء")
        self.assertIn("123456", detail["text"])
        self.assertIn("<b>", detail["html"])
        self.assertEqual(detail["attachments"][0]["filename"], "فاتورة.pdf")
        self.assertTrue(detail["date"].startswith("2026-08-28T10:00"))

    def test_attachment_parts_ignores_bodies(self):
        self.assertEqual(len(_attachment_parts(self._message())), 1)

    def test_fetch_summary_parsing(self):
        item = (
            b'1 (UID 77 FLAGS (\\Seen) BODY[HEADER.FIELDS (FROM SUBJECT DATE TO)] {80}',
            b"From: a@b.com\r\nSubject: =?UTF-8?B?2YXYsdit2KjYpw==?=\r\n"
            b"Date: Fri, 28 Aug 2026 10:00:00 +0300\r\n\r\n",
        )
        summary = ImapCatchAllProvider._summary_from_fetch(item)
        self.assertEqual(summary["id"], "77")
        self.assertEqual(summary["subject"], "مرحبا")
        self.assertTrue(summary["seen"])

    def test_fetch_summary_unseen_and_invalid(self):
        item = (b'1 (UID 5 FLAGS () BODY[HEADER.FIELDS (FROM)] {2}', b"\r\n")
        self.assertFalse(ImapCatchAllProvider._summary_from_fetch(item)["seen"])
        self.assertIsNone(ImapCatchAllProvider._summary_from_fetch((b"no uid here", b"")))

    def test_header_helpers(self):
        self.assertEqual(_decode_header("=?UTF-8?B?2YXYsdit2KjYpw==?="), "مرحبا")
        self.assertEqual(_decode_header(""), "")
        self.assertTrue(_header_date("not a date"))

    def test_uid_guard_blocks_injection(self):
        _require_uid("123")
        for bad in ("1 LOGOUT", "*", "1:*", ""):
            with self.assertRaises(ProviderError):
                _require_uid(bad)

    def test_domains_from_settings(self):
        provider = ImapCatchAllProvider(lambda: {"imap": {"domain": "A.com, b.com  b.com"}})
        self.assertEqual(provider.list_domains(), ["a.com", "b.com"])
        empty = ImapCatchAllProvider(lambda: {"imap": {"domain": ""}})
        with self.assertRaises(ProviderError):
            empty.list_domains()

    def test_not_ready_without_config(self):
        self.assertFalse(ImapCatchAllProvider(lambda: {"imap": {}}).is_ready())
        ready = ImapCatchAllProvider(lambda: {"imap": {
            "host": "h", "username": "u", "password": "p", "domain": "d.com"}})
        self.assertTrue(ready.is_ready())


class AliasProviderTests(unittest.TestCase):
    """الأسماء البديلة (+) على Gmail/Outlook — الطريقة الوحيدة الممكنة لعنوان
    حقيقي على تلك الدومينات."""

    def _provider(self, username="Ahmad@Gmail.com"):
        return AliasProvider(lambda: {"imap": {
            "host": "imap.gmail.com", "username": username, "password": "pw"}})

    def test_domain_comes_from_user_mailbox(self):
        self.assertEqual(self._provider().list_domains(), ["gmail.com"])
        self.assertEqual(
            self._provider("me@outlook.com").list_domains(), ["outlook.com"])

    def test_builds_plus_alias(self):
        account = self._provider().create_account("netflix", "gmail.com")
        self.assertEqual(account["address"], "ahmad+netflix@gmail.com")
        self.assertEqual(account["local"], "netflix")

    def test_prefix_shown_in_ui(self):
        self.assertEqual(self._provider().address_prefix(), "ahmad+")
        # بلا إعداد صالح لا ننهار، فقط لا نعرض بادئة
        self.assertEqual(self._provider("").address_prefix(), "")

    def test_strips_existing_tag_from_base(self):
        account = self._provider("ahmad+old@gmail.com").create_account("new", "gmail.com")
        self.assertEqual(account["address"], "ahmad+new@gmail.com")

    def test_rejects_bad_input(self):
        provider = self._provider()
        with self.assertRaises(ProviderError):
            provider.create_account("ahmad", "gmail.com")      # مطابق للاسم الأساسي
        with self.assertRaises(ProviderError):
            provider.create_account("x", "yahoo.com")          # دومين مختلف
        with self.assertRaises(ProviderError):
            provider.create_account("+", "gmail.com")          # وسم فارغ
        with self.assertRaises(ProviderError):
            self._provider("لا-يوجد-قوس").list_domains()       # مستخدم بلا @

    def test_ready_without_custom_domain(self):
        # على عكس مزوّد الدومين الخاص، هذا لا يحتاج خانة الدومينات
        self.assertTrue(self._provider().is_ready())
        self.assertFalse(AliasProvider(lambda: {"imap": {"host": "h"}}).is_ready())


class BlockingTests(unittest.TestCase):
    def test_matches_exact_address(self):
        self.assertTrue(is_blocked("Spam@Example.com", ["spam@example.com"]))
        self.assertFalse(is_blocked("ok@example.com", ["spam@example.com"]))

    def test_matches_whole_domain(self):
        self.assertTrue(is_blocked("anyone@spam.com", ["@spam.com"]))
        self.assertFalse(is_blocked("me@notspam.com", ["@spam.com"]))
        # لا يُحظر دومين ينتهي بنفس الحروف دون أن يكون هو
        self.assertFalse(is_blocked("me@myspam.com", ["@spam.com"]))

    def test_ignores_empty_values(self):
        self.assertFalse(is_blocked("", ["a@b.com"]))
        self.assertFalse(is_blocked("a@b.com", []))
        self.assertFalse(is_blocked("a@b.com", ["", "   "]))


class PlatformHelperTests(unittest.TestCase):
    """الوحدات الخاصة بويندوز يجب ألا تنهار على أي نظام آخر."""

    def test_notifier_is_safe_off_windows(self):
        if not notifier.available():
            self.assertFalse(notifier.notify("عنوان", "نص"))

    def test_notifier_escapes_quotes(self):
        self.assertEqual(notifier._quote("it's"), "it''s")
        self.assertEqual(notifier._quote("a\n  b"), "a b")
        self.assertLessEqual(len(notifier._quote("x" * 500)), 180)

    def test_autostart_is_safe_off_windows(self):
        if not autostart.available():
            self.assertFalse(autostart.is_enabled())
            autostart.disable()  # يجب ألا يرمي
            with self.assertRaises(RuntimeError):
                autostart.enable()


class ApiTests(unittest.TestCase):
    """يشغّل الخادم فعليًا ويتحدث إليه عبر HTTP."""

    @classmethod
    def setUpClass(cls):
        cls._data = TempDataDir()
        cls._data.__enter__()
        cls.state = AppState()
        cls.fake = FakeProvider()
        cls.state.registry._providers = {"fake": cls.fake}
        cls.server = build_server(cls.state, 0)
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls._data.__exit__(None, None, None)

    def call(self, method, path, body=None, token=None, headers=None, raw=False):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method)
        request.add_header("X-Auth-Token", token if token is not None else self.state.token)
        if data:
            request.add_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = response.read()
            if raw:
                return response.status, payload, dict(response.headers)
            return response.status, json.loads(payload.decode()) if payload else None

    def test_01_requires_token(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.call("GET", "/api/bootstrap", token="wrong")
        self.assertEqual(ctx.exception.code, 403)

    def test_02_rejects_foreign_origin(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.call("GET", "/api/bootstrap", headers={"Origin": "https://evil.example"})
        self.assertEqual(ctx.exception.code, 403)

    def test_03_index_injects_token_into_variable(self):
        with urllib.request.urlopen(self.base + "/", timeout=10) as response:
            html = response.read().decode()
        # لا بد أن يبقى اسم المتغيّر سليمًا وأن تُستبدل القيمة فقط.
        self.assertIn(f'window.__AUTH_TOKEN__ = "{self.state.token}";', html)
        self.assertNotIn(TOKEN_PLACEHOLDER, html)

    def test_04_static_blocks_traversal(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.base + "/static/../../server.py", timeout=10)
        self.assertIn(ctx.exception.code, (400, 404))

    def test_05_bootstrap(self):
        _status, data = self.call("GET", "/api/bootstrap")
        self.assertEqual(data["providers"][0]["id"], "fake")
        self.assertEqual(data["settings"]["imap"]["password"], "")

    def test_06_domains(self):
        _status, data = self.call("GET", "/api/domains?provider=fake")
        self.assertIn("demo.test", data["domains"])

    def test_07_create_account_flow(self):
        status, data = self.call("POST", "/api/accounts",
                                 {"provider": "fake", "local": "ahmed", "domain": "demo.test"})
        self.assertEqual(status, 201)
        self.assertEqual(data["account"]["address"], "ahmed@demo.test")
        self.assertNotIn("password", data["account"])
        ApiTests.account_id = data["account"]["id"]

    def test_08_rejects_duplicate_and_bad_domain(self):
        for body, code in [
            ({"provider": "fake", "local": "ahmed", "domain": "demo.test"}, 400),
            ({"provider": "fake", "local": "x", "domain": "notallowed.com"}, 400),
            ({"provider": "nope", "local": "x", "domain": "demo.test"}, 502),
        ]:
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                self.call("POST", "/api/accounts", body)
            self.assertEqual(ctx.exception.code, code, msg=str(body))

    def test_09_list_and_read_messages(self):
        _status, data = self.call("GET", f"/api/accounts/{self.account_id}/messages")
        self.assertEqual(len(data["messages"]), 3)
        self.assertNotIn("html", data["messages"][0])  # الملخّص لا يحمل الجسم

        _status, detail = self.call("GET", f"/api/accounts/{self.account_id}/messages/m1")
        self.assertIn("482913", detail["message"]["html"])

    def test_10_attachment_download(self):
        status, body, headers = self.call(
            "GET", f"/api/accounts/{self.account_id}/messages/m2/attachments/a1", raw=True)
        self.assertEqual(status, 200)
        self.assertTrue(body.startswith(b"%PDF"))
        # اسم الملف العربي يُرمَّز وفق RFC 5987
        self.assertIn("filename*=UTF-8''", headers["Content-Disposition"])

    def test_11_attachment_token_via_query(self):
        url = (f"{self.base}/api/accounts/{self.account_id}/messages/m2/attachments/a1"
               f"?t={self.state.token}")
        with urllib.request.urlopen(url, timeout=10) as response:
            self.assertEqual(response.status, 200)

    def test_12_settings_keep_password_when_blank(self):
        self.call("POST", "/api/settings", {"imap": {"password": "secret1", "host": "h.test"}})
        _status, data = self.call("POST", "/api/settings", {"imap": {"password": "", "port": 143}})
        self.assertTrue(data["settings"]["imap"]["has_password"])
        self.assertEqual(store.load_settings()["imap"]["password"], "secret1")
        self.assertEqual(data["settings"]["imap"]["port"], 143)

    def test_13_settings_clamps_refresh(self):
        _status, data = self.call("POST", "/api/settings", {"refresh_seconds": 99999})
        self.assertEqual(data["settings"]["refresh_seconds"], 300)
        _status, data = self.call("POST", "/api/settings", {"refresh_seconds": 1})
        self.assertEqual(data["settings"]["refresh_seconds"], 5)
        _status, data = self.call("POST", "/api/settings", {"refresh_seconds": "abc"})
        self.assertEqual(data["settings"]["refresh_seconds"], 5)

    def test_14_delete_message_then_account(self):
        self.call("DELETE", f"/api/accounts/{self.account_id}/messages/m3")
        _status, data = self.call("GET", f"/api/accounts/{self.account_id}/messages")
        self.assertEqual(len(data["messages"]), 2)

        self.call("DELETE", f"/api/accounts/{self.account_id}")
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.call("GET", f"/api/accounts/{self.account_id}/messages")
        self.assertEqual(ctx.exception.code, 404)

    def test_14b_blocked_sender_hidden(self):
        status, data = self.call("POST", "/api/accounts",
                                 {"provider": "fake", "local": "blocktest", "domain": "demo.test"})
        account_id = data["account"]["id"]

        _s, before = self.call("GET", f"/api/accounts/{account_id}/messages")
        self.call("POST", "/api/settings", {"blocked_senders": ["@github.example"]})
        _s, after = self.call("GET", f"/api/accounts/{account_id}/messages")
        self.assertEqual(len(after["messages"]), len(before["messages"]) - 1)
        self.assertFalse(any("github" in m["from_address"] for m in after["messages"]))

        # التنظيف: تكرار ومسافات وحروف كبيرة تُوحَّد
        _s, settings = self.call("POST", "/api/settings",
                                 {"blocked_senders": [" @GitHub.example ", "@github.example", ""]})
        self.assertEqual(settings["settings"]["blocked_senders"], ["@github.example"])

        self.call("POST", "/api/settings", {"blocked_senders": []})
        self.call("DELETE", f"/api/accounts/{account_id}")

    def test_14c_export_returns_messages_with_bodies(self):
        _s, data = self.call("POST", "/api/accounts",
                             {"provider": "fake", "local": "exp", "domain": "demo.test"})
        account_id = data["account"]["id"]

        status, body, headers = self.call(
            "GET", f"/api/accounts/{account_id}/export", raw=True)
        self.assertEqual(status, 200)
        self.assertIn("attachment;", headers["Content-Disposition"])
        payload = json.loads(body.decode())
        self.assertEqual(payload["address"], "exp@demo.test")
        self.assertTrue(payload["count"] >= 1)
        self.assertIn("html", payload["messages"][0])
        self.call("DELETE", f"/api/accounts/{account_id}")

    def test_14d_notify_endpoint_reports_platform(self):
        _s, data = self.call("POST", "/api/notify", {"title": "t", "body": "b"})
        self.assertIn("sent", data)
        self.assertEqual(data["sent"], notifier.available() and data["sent"])

    def test_14e_autostart_rejected_off_windows(self):
        if autostart.available():
            self.skipTest("يُختبر السلوك على الأنظمة غير ويندوز")
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.call("POST", "/api/autostart", {"enabled": True})
        self.assertEqual(ctx.exception.code, 400)

    def test_14f_bootstrap_reports_capabilities(self):
        _s, data = self.call("GET", "/api/bootstrap")
        for key in ("desktop_notifications", "autostart_supported", "autostart_enabled"):
            self.assertIn(key, data)

    def test_15_unknown_route(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.call("GET", "/api/nope")
        self.assertEqual(ctx.exception.code, 404)


class AuthUnitTests(unittest.TestCase):
    def test_password_round_trip(self):
        encoded = auth.hash_password("correct horse battery")
        self.assertTrue(auth.verify_password("correct horse battery", encoded))
        self.assertFalse(auth.verify_password("wrong", encoded))

    def test_salt_is_random(self):
        self.assertNotEqual(auth.hash_password("same"), auth.hash_password("same"))

    def test_malformed_hash_rejected(self):
        for bad in ("", "not-a-hash", "pbkdf2_sha256$x$y$z", "md5$1$aa$bb"):
            self.assertFalse(auth.verify_password("any", bad))

    def test_password_policy(self):
        self.assertTrue(auth.password_problem(""))
        self.assertTrue(auth.password_problem("short"))
        self.assertEqual(auth.password_problem("a" * 10), "")

    def test_sessions(self):
        store_ = auth.SessionStore()
        session_id, token = store_.create()
        self.assertEqual(store_.token_for(session_id), token)
        self.assertIsNone(store_.token_for("unknown"))
        store_.destroy(session_id)
        self.assertIsNone(store_.token_for(session_id))

    def test_expired_session_is_dropped(self):
        store_ = auth.SessionStore(ttl=-1)
        session_id, _token = store_.create()
        self.assertIsNone(store_.token_for(session_id))

    def test_throttle_locks_then_resets(self):
        throttle = auth.LoginThrottle(max_attempts=3, window=60, lockout=60)
        self.assertEqual(throttle.retry_after("1.1.1.1"), 0)
        for _ in range(3):
            throttle.record_failure("1.1.1.1")
        self.assertGreater(throttle.retry_after("1.1.1.1"), 0)
        self.assertEqual(throttle.retry_after("2.2.2.2"), 0)  # عزل بين العناوين
        throttle.record_success("1.1.1.1")
        self.assertEqual(throttle.retry_after("1.1.1.1"), 0)

    def test_cookie_parsing(self):
        header = "theme=dark; tempmail_session=abc123; other=x"
        self.assertEqual(auth.parse_cookie(header, "tempmail_session"), "abc123")
        self.assertEqual(auth.parse_cookie(header, "missing"), "")
        self.assertEqual(auth.parse_cookie("", "tempmail_session"), "")


class WindowedBuildTests(unittest.TestCase):
    """في بناء PyInstaller بلا نافذة طرفية تكون stdout/stderr معدومة."""

    def test_streams_are_restored_when_missing(self):
        with TempDataDir() as path:
            original_out, original_err = sys.stdout, sys.stderr
            try:
                sys.stdout = None
                sys.stderr = None
                app_module.data_dir = lambda: path
                app_module._ensure_output_streams()
                self.assertIsNotNone(sys.stdout)
                self.assertIsNotNone(sys.stderr)
                # يجب أن تكون قابلة للكتابة فعلًا، لا مجرد كائن غير None
                print("سطر تجريبي")
                traceback.print_exc()
            finally:
                stream = sys.stdout
                sys.stdout, sys.stderr = original_out, original_err
                if hasattr(stream, "close"):
                    stream.close()

    def test_existing_streams_are_left_alone(self):
        marker = io.StringIO()
        original_out = sys.stdout
        try:
            sys.stdout = marker
            app_module._ensure_output_streams()
            self.assertIs(sys.stdout, marker)
        finally:
            sys.stdout = original_out


class ServerModeTests(unittest.TestCase):
    """وضع النشر: كلمة مرور، جلسات، وحماية من CSRF وتخمين كلمة المرور."""

    PASSWORD = "a-strong-password"

    @classmethod
    def setUpClass(cls):
        cls._data = TempDataDir()
        cls._data.__enter__()
        cls.state = AppState(auth.hash_password(cls.PASSWORD))
        cls.state.registry._providers = {"fake": FakeProvider()}
        cls.server = build_server(cls.state, 0)
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls._data.__exit__(None, None, None)

    def request(self, method, path, body=None, cookie=None, token=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data:
            req.add_header("Content-Type", "application/json")
        if cookie:
            req.add_header("Cookie", f"{auth.COOKIE_NAME}={cookie}")
        if token:
            req.add_header("X-Auth-Token", token)
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, response.read(), dict(response.headers)

    def login(self):
        _status, _body, headers = self.request("POST", "/api/login", {"password": self.PASSWORD})
        cookie = auth.parse_cookie(headers.get("Set-Cookie", ""), auth.COOKIE_NAME)
        # الرمز يُحقن في الصفحة، تمامًا كما يقرؤه المتصفح
        _s, page, _h = self.request("GET", "/", cookie=cookie)
        token = re.search(r'window\.__AUTH_TOKEN__ = "([^"]+)"', page.decode()).group(1)
        return cookie, token

    def test_01_root_serves_login_page(self):
        _status, body, _headers = self.request("GET", "/")
        html = body.decode()
        self.assertIn("تسجيل الدخول", html)
        self.assertIn('id="login-form"', html)

    def test_02_api_denied_without_session(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("GET", "/api/bootstrap")
        self.assertEqual(ctx.exception.code, 403)

    def test_03_wrong_password_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("POST", "/api/login", {"password": "nope"})
        self.assertEqual(ctx.exception.code, 401)

    def test_04_login_sets_httponly_cookie(self):
        _status, _body, headers = self.request(
            "POST", "/api/login", {"password": self.PASSWORD})
        cookie_header = headers.get("Set-Cookie", "")
        self.assertIn("HttpOnly", cookie_header)
        self.assertIn("SameSite=Lax", cookie_header)
        self.assertTrue(auth.parse_cookie(cookie_header, auth.COOKIE_NAME))

    def test_05_secure_flag_behind_https_proxy(self):
        _s, _b, headers = self.request(
            "POST", "/api/login", {"password": self.PASSWORD},
            headers={"X-Forwarded-Proto": "https"})
        self.assertIn("Secure", headers.get("Set-Cookie", ""))

    def test_06_session_grants_api_access(self):
        cookie, token = self.login()
        status, body, _h = self.request("GET", "/api/bootstrap", cookie=cookie, token=token)
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["server_mode"])

    def test_07_cookie_without_header_is_rejected(self):
        """جوهر الحماية من CSRF: الكوكي وحده لا يكفي."""
        cookie, _token = self.login()
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("GET", "/api/bootstrap", cookie=cookie)
        self.assertEqual(ctx.exception.code, 403)

    def test_08_foreign_origin_rejected(self):
        cookie, token = self.login()
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("GET", "/api/bootstrap", cookie=cookie, token=token,
                         headers={"Origin": "https://evil.example"})
        self.assertEqual(ctx.exception.code, 403)

    def test_09_logout_destroys_session(self):
        cookie, token = self.login()
        self.request("POST", "/api/logout", {}, cookie=cookie, token=token)
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("GET", "/api/bootstrap", cookie=cookie, token=token)
        self.assertEqual(ctx.exception.code, 403)

    def test_10_quit_is_blocked_in_server_mode(self):
        cookie, token = self.login()
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("POST", "/api/quit", {}, cookie=cookie, token=token)
        self.assertEqual(ctx.exception.code, 403)
        self.assertFalse(self.state.shutdown_event.is_set())

    def test_11_brute_force_is_throttled(self):
        state = AppState(auth.hash_password(self.PASSWORD))
        state.registry._providers = {"fake": FakeProvider()}
        server = build_server(state, 0)
        base = f"http://127.0.0.1:{server.server_port}"
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            codes = []
            for _ in range(auth.MAX_ATTEMPTS + 2):
                request = urllib.request.Request(
                    base + "/api/login", data=json.dumps({"password": "x"}).encode(),
                    method="POST", headers={"Content-Type": "application/json"})
                try:
                    urllib.request.urlopen(request, timeout=10)
                    codes.append(200)
                except urllib.error.HTTPError as exc:
                    codes.append(exc.code)
            self.assertIn(429, codes, codes)
            # وبعد المنع، حتى كلمة المرور الصحيحة تُرفض
            request = urllib.request.Request(
                base + "/api/login", data=json.dumps({"password": self.PASSWORD}).encode(),
                method="POST", headers={"Content-Type": "application/json"})
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(request, timeout=10)
            self.assertEqual(ctx.exception.code, 429)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
