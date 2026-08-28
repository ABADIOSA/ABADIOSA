"""تخزين الإعدادات والحسابات في ملفات JSON داخل مجلد بيانات المستخدم."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from copy import deepcopy
from typing import Any

from .paths import ACCOUNTS_FILE, SETTINGS_FILE, data_dir
from .secrets_store import decrypt, encrypt

DEFAULT_SETTINGS: dict[str, Any] = {
    "refresh_seconds": 10,
    "theme": "dark",
    "load_remote_images": False,
    "notify_sound": True,
    "last_provider": "mailtm",
    "imap": {
        "host": "",
        "port": 993,
        "use_ssl": True,
        "username": "",
        "password": "",
        "domain": "",
        "mailbox": "INBOX",
    },
}

_lock = threading.RLock()


def _atomic_write(path, payload: dict) -> None:
    """كتابة ذرّية حتى لا يتلف الملف إذا انقطع التطبيق أثناء الحفظ."""
    directory = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _read(path, fallback):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return deepcopy(fallback)


def _merge_defaults(loaded: dict, defaults: dict) -> dict:
    """يدمج الإعدادات المحفوظة فوق الافتراضية حتى تظهر المفاتيح الجديدة."""
    out = deepcopy(defaults)
    for key, value in (loaded or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _merge_defaults(value, out[key])
        else:
            out[key] = value
    return out


# ---------------------------------------------------------------- الإعدادات

def load_settings() -> dict:
    """يعيد الإعدادات مع كلمة مرور IMAP مفكوكة التشفير (للاستخدام الداخلي)."""
    with _lock:
        raw = _read(data_dir() / SETTINGS_FILE, DEFAULT_SETTINGS)
        settings = _merge_defaults(raw, DEFAULT_SETTINGS)
        settings["imap"]["password"] = decrypt(settings["imap"].get("password", ""))
        return settings


def save_settings(settings: dict) -> dict:
    with _lock:
        current = load_settings()
        merged = _merge_defaults(settings, current)
        stored = deepcopy(merged)
        stored["imap"]["password"] = encrypt(merged["imap"].get("password", ""))
        _atomic_write(data_dir() / SETTINGS_FILE, stored)
        return merged


def public_settings(settings: dict) -> dict:
    """نسخة صالحة للإرسال إلى الواجهة: بلا كلمة المرور، مع علامة وجودها."""
    out = deepcopy(settings)
    imap = out.get("imap", {})
    imap["has_password"] = bool(imap.get("password"))
    imap["password"] = ""
    return out


# ---------------------------------------------------------------- الحسابات

def load_accounts() -> list[dict]:
    with _lock:
        data = _read(data_dir() / ACCOUNTS_FILE, {"accounts": []})
        accounts = data.get("accounts", []) if isinstance(data, dict) else []
        for account in accounts:
            if account.get("password"):
                account["password"] = decrypt(account["password"])
        return accounts


def save_accounts(accounts: list[dict]) -> None:
    with _lock:
        stored = deepcopy(accounts)
        for account in stored:
            if account.get("password"):
                account["password"] = encrypt(account["password"])
        _atomic_write(data_dir() / ACCOUNTS_FILE, {"accounts": stored})


def add_account(account: dict) -> dict:
    with _lock:
        accounts = load_accounts()
        if any(a["id"] == account["id"] for a in accounts):
            raise ValueError("هذا العنوان موجود مسبقًا")
        accounts.insert(0, account)
        save_accounts(accounts)
        return account


def get_account(account_id: str) -> dict | None:
    return next((a for a in load_accounts() if a["id"] == account_id), None)


def update_account(account_id: str, changes: dict) -> dict | None:
    with _lock:
        accounts = load_accounts()
        for account in accounts:
            if account["id"] == account_id:
                account.update(changes)
                save_accounts(accounts)
                return account
        return None


def delete_account(account_id: str) -> bool:
    with _lock:
        accounts = load_accounts()
        remaining = [a for a in accounts if a["id"] != account_id]
        if len(remaining) == len(accounts):
            return False
        save_accounts(remaining)
        return True


def public_account(account: dict) -> dict:
    """نسخة الحساب المرسلة للواجهة — بدون أسرار."""
    return {
        "id": account["id"],
        "provider": account["provider"],
        "address": account["address"],
        "domain": account.get("domain", ""),
        "created_at": account.get("created_at"),
        "label": account.get("label", ""),
    }
