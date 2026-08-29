"""نقطة تشغيل التطبيق: يشغّل الخادم المحلي ثم يفتح النافذة."""

from __future__ import annotations

import argparse
import io
import os
import sys
import threading
import webbrowser

from . import APP_NAME, __version__, auth
from .paths import data_dir
from .server import AppState, build_server

# أقصى حجم لملف السجل قبل بدئه من جديد.
MAX_LOG_BYTES = 2 * 1024 * 1024


def _ensure_output_streams() -> None:
    """يضمن وجود stdout/stderr صالحين.

    في بناء PyInstaller بلا نافذة طرفية (--windowed) تكون قيمتهما None، وأي
    كتابة عليهما — مثل traceback عند خطأ غير متوقع — تُسقط الخيط المعالِج.
    نوجّههما إلى ملف سجل في مجلد بيانات المستخدم بدل ذلك.
    """
    if sys.stdout is not None and sys.stderr is not None:
        return

    stream: object
    try:
        log_path = data_dir() / "tempmail.log"
        if log_path.exists() and log_path.stat().st_size > MAX_LOG_BYTES:
            log_path.unlink()
        stream = open(log_path, "a", encoding="utf-8", buffering=1)
    except OSError:
        # حتى لو تعذّرت الكتابة على القرص، يجب ألا ينهار التطبيق.
        stream = io.StringIO()

    if sys.stdout is None:
        sys.stdout = stream
    if sys.stderr is None:
        sys.stderr = stream


def _open_native_window(url: str, state: AppState) -> bool:
    """يحاول فتح نافذة سطح مكتب أصلية عبر pywebview (WebView2 على ويندوز)."""
    try:
        import webview  # type: ignore
    except ImportError:
        return False

    try:
        window = webview.create_window(
            f"{APP_NAME} — بريد مؤقت",
            url,
            width=1180,
            height=780,
            min_size=(900, 600),
            text_select=True,
        )

        def _on_closed():
            state.shutdown_event.set()

        window.events.closed += _on_closed
        webview.start()
        return True
    except Exception as exc:  # pragma: no cover - يعتمد على بيئة التشغيل
        print(f"[تنبيه] تعذّر فتح النافذة الأصلية ({exc}) — سيُفتح المتصفح بدلًا منها.")
        return False


def main(argv: list[str] | None = None) -> int:
    _ensure_output_streams()
    parser = argparse.ArgumentParser(description=f"{APP_NAME} — تطبيق بريد مؤقت")
    parser.add_argument("--port", type=int, default=0, help="منفذ محلي ثابت (افتراضيًا عشوائي)")
    parser.add_argument("--browser", action="store_true", help="افتح في المتصفح بدل النافذة الأصلية")
    parser.add_argument("--no-open", action="store_true", help="شغّل الخادم فقط بلا فتح واجهة")
    parser.add_argument("--host", default="127.0.0.1",
                        help="عنوان الاستماع (0.0.0.0 للنشر على سيرفر)")
    parser.add_argument("--server-mode", action="store_true",
                        help="تفعيل كلمة المرور والجلسات للنشر على الإنترنت")
    parser.add_argument("--version", action="version", version=f"{APP_NAME} {__version__}")
    args = parser.parse_args(argv)

    # الاستماع خارج الجهاز بلا كلمة مرور يعرّض بريدك للعالم — نمنعه.
    exposed = args.host not in ("127.0.0.1", "localhost", "::1")
    password = os.environ.get("TEMPMAIL_PASSWORD", "")
    password_hash = ""

    if args.server_mode or exposed:
        problem = auth.password_problem(password)
        if problem:
            print(f"رُفض التشغيل: {problem}", file=sys.stderr)
            print("مثال:  set TEMPMAIL_PASSWORD=كلمة-مرور-قوية", file=sys.stderr)
            return 2
        password_hash = auth.hash_password(password)
        print("وضع السيرفر: كلمة المرور مفعّلة.")

    state = AppState(password_hash)
    try:
        server = build_server(state, args.port, args.host)
    except OSError as exc:
        print(f"تعذّر بدء الخادم المحلي: {exc}", file=sys.stderr)
        return 1

    display_host = "127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host
    url = f"http://{display_host}:{server.server_port}/"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"{APP_NAME} {__version__} يعمل على {url}")

    try:
        if args.no_open:
            state.shutdown_event.wait()
        elif args.browser or not _open_native_window(url, state):
            if not args.no_open:
                webbrowser.open(url)
            print("أغلق هذه النافذة (أو اضغط Ctrl+C) لإيقاف التطبيق.")
            state.shutdown_event.wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        server.server_close()
        state.registry.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
