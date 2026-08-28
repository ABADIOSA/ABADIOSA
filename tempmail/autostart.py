"""تشغيل التطبيق تلقائيًا مع بدء ويندوز عبر مفتاح Run الخاص بالمستخدم.

نستخدم HKEY_CURRENT_USER فقط — لا يحتاج صلاحيات مسؤول ولا يمس بقية المستخدمين.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
ENTRY_NAME = "TempMailWin"


def available() -> bool:
    return os.name == "nt"


def _command() -> str:
    """أمر التشغيل الكامل حسب طريقة التشغيل (EXE أو مصدر)."""
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}"'

    # pythonw يشغّل بلا نافذة طرفية سوداء.
    interpreter = Path(sys.executable)
    windowless = interpreter.with_name("pythonw.exe")
    if windowless.exists():
        interpreter = windowless

    entry = Path(__file__).resolve().parents[1] / "run.py"
    return f'"{interpreter}" "{entry}"'


def is_enabled() -> bool:
    if not available():
        return False
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            value, _type = winreg.QueryValueEx(key, ENTRY_NAME)
            return bool(value)
    except OSError:
        return False


def enable() -> None:
    if not available():
        raise RuntimeError("التشغيل التلقائي متاح على ويندوز فقط.")
    import winreg

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
        winreg.SetValueEx(key, ENTRY_NAME, 0, winreg.REG_SZ, _command())


def disable() -> None:
    if not available():
        return
    import winreg

    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            winreg.DeleteValue(key, ENTRY_NAME)
    except FileNotFoundError:
        pass
    except OSError:
        pass


def set_enabled(enabled: bool) -> bool:
    """يضبط الحالة ويعيد الحالة الفعلية بعد التنفيذ."""
    if enabled:
        enable()
    else:
        disable()
    return is_enabled()
