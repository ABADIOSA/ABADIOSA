"""إشعارات ويندوز الأصلية (Toast) بلا أي اعتمادية خارجية.

نستخدم PowerShell لاستدعاء واجهة الإشعارات في ويندوز 10/11 مباشرة. إن فشل
أي شيء نتجاهله بصمت — الإشعار رفاهية، ويجب ألا يُسقط التطبيق أبدًا.
"""

from __future__ import annotations

import os
import subprocess
import threading
import time

# أقل فاصل بين إشعارين حتى لا تُغرق الشاشة عند وصول دفعة رسائل.
MIN_INTERVAL_SECONDS = 4.0

_last_sent = 0.0
_lock = threading.Lock()

# CREATE_NO_WINDOW — يمنع وميض نافذة سوداء عند التشغيل.
_NO_WINDOW = 0x08000000

_SCRIPT = """
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
        [Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$n = $t.GetElementsByTagName('text')
$n.Item(0).AppendChild($t.CreateTextNode('{title}')) | Out-Null
$n.Item(1).AppendChild($t.CreateTextNode('{body}')) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($t)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(
        '{app_id}').Show($toast)
"""

# مُعرّف تطبيق موجود في كل نسخة ويندوز — يجعل الإشعار يظهر بلا تسجيل مسبق.
_APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"


def available() -> bool:
    return os.name == "nt"


def _quote(value: str) -> str:
    """يهرّب النص لسلسلة PowerShell أحادية الاقتباس."""
    cleaned = " ".join(str(value or "").split())[:180]
    return cleaned.replace("'", "''")


def _send(title: str, body: str) -> None:
    script = _SCRIPT.format(title=_quote(title), body=_quote(body), app_id=_APP_ID)
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
             "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            timeout=12,
            creationflags=_NO_WINDOW,
        )
    except Exception:
        # الإشعار ليس جوهريًا — نتجاهل أي فشل.
        pass


def notify(title: str, body: str) -> bool:
    """يعرض إشعار ويندوز. يعيد False إذا لم يُرسل (نظام آخر أو تكرار سريع)."""
    if not available():
        return False

    global _last_sent
    with _lock:
        now = time.monotonic()
        if now - _last_sent < MIN_INTERVAL_SECONDS:
            return False
        _last_sent = now

    # في خيط منفصل حتى لا ينتظر الطلب انتهاء PowerShell.
    threading.Thread(target=_send, args=(title, body), daemon=True).start()
    return True
