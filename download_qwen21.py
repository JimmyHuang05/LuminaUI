"""Prepare the Windows Qwen edition using the same manifest as first launch."""
from pathlib import Path
import subprocess

if __name__ == '__main__':
    script = Path(__file__).resolve().with_name('Start-Lumina.ps1')
    subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                    '-File', str(script), '-PrepareOnly'], check=True)
