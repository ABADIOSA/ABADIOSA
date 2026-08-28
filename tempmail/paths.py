"""مسارات الملفات وموارد التطبيق (تعمل أيضًا بعد التحويل إلى EXE)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from . import APP_NAME


def data_dir() -> Path:
    """مجلد بيانات المستخدم (%APPDATA%\\TempMailWin على ويندوز)."""
    if os.name == "nt":
        base = os.environ.get("APPDATA") or str(Path.home())
    elif sys.platform == "darwin":
        base = str(Path.home() / "Library" / "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    path = Path(base) / APP_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def resource_dir() -> Path:
    """مجلد الموارد الثابتة (web/). يتغيّر عند التشغيل من ملف EXE."""
    bundled = getattr(sys, "_MEIPASS", None)
    if bundled:
        return Path(bundled) / "tempmail"
    return Path(__file__).resolve().parent


def web_dir() -> Path:
    return resource_dir() / "web"


SETTINGS_FILE = "settings.json"
ACCOUNTS_FILE = "accounts.json"
