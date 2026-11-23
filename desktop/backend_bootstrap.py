"""Start the desktop backend without a Windows console, retaining diagnostics."""
import os
from pathlib import Path
import runpy
import sys


def configure_logging(log_path):
    # pythonw may initialize these streams to None even with inherited handles.
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log = open(log_path, 'a', encoding='utf-8', buffering=1)
    sys.stdout = sys.stderr = log
    sys.stdin = open(os.devnull, 'r', encoding='utf-8')
    return log


def main():
    root = Path(__file__).resolve().parent.parent
    configure_logging(root / 'desktop/logs/webui.log')
    server = root / 'webui/server.py'
    os.chdir(root)
    sys.path.insert(0, str(server.parent))
    sys.argv = [str(server), '--desktop']
    runpy.run_path(str(server), run_name='__main__')


if __name__ == '__main__':
    main()
