"""Build the per-user Windows installer with the Windows .NET Framework compiler and Git."""
import os
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.runtime/dist'


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT / 'app.zip', 'w', zipfile.ZIP_DEFLATED) as bundle:
        files = ['Start-Lumina.ps1', 'First-Run.ps1', 'first-run.html', 'canvas-intro.css', 'canvas-intro.js', 'docs/images/glass-study.jpg', 'docs/images/qwen-studio.jpg', 'launch_qwen.py', 'requirements.txt',
                 'start_desktop.bat', 'desktop/lumina.ico', 'README.md', 'webui/appearance.css']
        listing = subprocess.check_output(['git', 'ls-files', '-z', 'webui', 'workflows', 'docs/images'], cwd=ROOT)
        files.extend(name for name in listing.decode().split('\0') if name)
        for name in dict.fromkeys(files):
            bundle.write(ROOT / name, name)
    (OUT / 'install.ps1').write_bytes((ROOT / 'installer/install.ps1').read_bytes())
    exe = OUT / 'LuminaUI-Qwen21-Setup.exe'
    compiler = Path(os.environ['SystemRoot']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    subprocess.run([str(compiler), '/nologo', '/target:winexe', '/r:System.Windows.Forms.dll',
                    f'/win32icon:{ROOT / "desktop/lumina.ico"}', f'/out:{exe}',
                    f'/resource:{OUT / "app.zip"},app.zip', f'/resource:{OUT / "install.ps1"},install.ps1',
                    str(ROOT / 'installer/Setup.cs')], check=True)
    print(exe)


if __name__ == '__main__':
    build()
