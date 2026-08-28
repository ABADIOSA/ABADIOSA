@echo off
chcp 65001 >nul
REM بناء ملف TempMailWin.exe
python -m pip install --upgrade pyinstaller pywebview
python "%~dp0scripts\build.py"
pause
