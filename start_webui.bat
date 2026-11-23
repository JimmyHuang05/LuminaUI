@echo off
cd /d "%~dp0"
set TEMP=%~dp0tmp
set TMP=%~dp0tmp
set HF_HOME=%~dp0cache\huggingface
set TORCH_HOME=%~dp0cache\torch
set XDG_CACHE_HOME=%~dp0cache
set PIP_CACHE_DIR=%~dp0cache\pip
"%~dp0.venv\Scripts\python.exe" -X utf8 "%~dp0webui\server.py" --open
pause
