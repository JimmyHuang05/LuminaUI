@echo off
cd /d "%~dp0desktop"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron is missing. Run npm install in the desktop folder.
  pause
  exit /b 1
)
"node_modules\electron\dist\electron.exe" .
