@echo off
chcp 65001 >nul
set "PROJECT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%启动金融巨子.ps1"
if errorlevel 1 (
  echo.
  echo 启动失败。请查看上方错误，或检查 .runtime\logs 目录。
  pause
)
