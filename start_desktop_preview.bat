@echo off
cd /d "%~dp0desktop"
if exist "node_modules\electron\dist\electron.exe" (
  "node_modules\electron\dist\electron.exe" . --preview
) else (
  node build-preview.cjs
  start "" "%~dp0desktop\web-preview\index.html"
)
