@echo off
rem 以管理员权限运行卷影副本恢复脚本，输出落盘便于读取
set LOGFILE=%LOCALAPPDATA%\dreamina-cookie-recovery\shadow-restore.log
if not exist "%LOCALAPPDATA%\dreamina-cookie-recovery" mkdir "%LOCALAPPDATA%\dreamina-cookie-recovery"
echo ==== run at %DATE% %TIME% ==== > "%LOGFILE%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-from-shadow.ps1" >> "%LOGFILE%" 2>&1
echo ==== exit code %ERRORLEVEL% ==== >> "%LOGFILE%"
