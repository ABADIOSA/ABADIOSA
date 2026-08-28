@echo off
chcp 65001 >nul
REM تشغيل التطبيق من المصدر
python "%~dp0run.py" %*
if errorlevel 1 pause
