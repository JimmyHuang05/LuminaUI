@echo off
cd /d "%~dp0"
set TEMP=%~dp0tmp
set TMP=%~dp0tmp
set PIP_CACHE_DIR=%~dp0cache\pip
set HF_HOME=%~dp0cache\huggingface
set TORCH_HOME=%~dp0cache\torch
set XDG_CACHE_HOME=%~dp0cache
"%~dp0.venv\Scripts\python.exe" "%~dp0ComfyUI\main.py" --listen 127.0.0.1 --port 8188 --reserve-vram 2 --vram-headroom 2.5
pause
