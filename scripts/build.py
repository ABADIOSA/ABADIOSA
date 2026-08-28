"""يبني ملف TempMailWin.exe واحدًا عبر PyInstaller."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    if shutil.which("pyinstaller") is None:
        print("PyInstaller غير مثبّت. نفّذ:  pip install pyinstaller")
        return 1

    try:
        import webview  # noqa: F401
        print("✓ pywebview موجود — سيُبنى التطبيق بنافذة سطح مكتب أصلية.")
        windowed = True
    except ImportError:
        print("! pywebview غير مثبّت — سيفتح التطبيق المتصفح بدلًا من نافذة أصلية.")
        print("  للحصول على نافذة أصلية:  pip install pywebview")
        windowed = False

    # PyInstaller يفصل المصدر عن الوجهة بـ ';' على ويندوز و ':' على غيره.
    data_arg = f"{ROOT / 'tempmail' / 'web'}{os.pathsep}tempmail/web"

    command = [
        "pyinstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name", "TempMailWin",
        "--add-data", data_arg,
        "--distpath", str(ROOT / "dist"),
        "--workpath", str(ROOT / "build"),
        "--specpath", str(ROOT / "build"),
    ]
    if windowed and sys.platform == "win32":
        # بلا نافذة طرفية سوداء خلف التطبيق.
        command.append("--windowed")
    command.append(str(ROOT / "run.py"))

    print("\n" + " ".join(command) + "\n")
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode == 0:
        target = ROOT / "dist" / ("TempMailWin.exe" if sys.platform == "win32" else "TempMailWin")
        print(f"\n✓ تم البناء: {target}")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
