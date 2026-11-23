"""Read-only host hardware inventory; never returns identifiers or serial numbers."""
import csv
import json
import os
import platform
import subprocess
import time
import psutil

_inventory = None

def command(args):
    return subprocess.check_output(args, timeout=8, encoding='utf-8', errors='replace', creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)

def snapshot():
    global _inventory
    if _inventory is None:
        cpu = platform.processor() or '未知 CPU'
        adapters = []
        if os.name == 'nt':
            try:
                import winreg
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'HARDWARE\DESCRIPTION\System\CentralProcessor\0') as key:
                    cpu = winreg.QueryValueEx(key, 'ProcessorNameString')[0].strip()
            except OSError:
                pass
            try:
                data = json.loads(command(['powershell', '-NoProfile', '-Command', "[Console]::OutputEncoding=[Text.Encoding]::UTF8; @{cpu=(Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name);gpu=@(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name)} | ConvertTo-Json -Compress"]))
                detected = data.get('cpu')
                if isinstance(detected, str) and detected.strip():
                    cpu = detected.strip()
                elif isinstance(detected, list) and all(isinstance(n, str) for n in detected) and detected:
                    cpu = ', '.join(detected)
                adapters = [{'name': name, 'total_gb': None, 'used_gb': None} for name in data.get('gpu', []) if isinstance(name, str)]
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
        _inventory = {'cpu': cpu, 'adapters': adapters}
    gpus = list(_inventory['adapters'])
    try:
        rows = csv.reader(command(['nvidia-smi', '--query-gpu=name,memory.total,memory.used,utilization.gpu', '--format=csv,noheader,nounits']).splitlines())
        nvidia = [{'name': r[0].strip(), 'total_gb': round(float(r[1])/1024, 1), 'used_gb': round(float(r[2])/1024, 1), 'usage_percent': float(r[3])} for r in rows]
        gpus = [g for g in gpus if 'nvidia' not in g['name'].lower()] + nvidia
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        pass
    mem = psutil.virtual_memory()
    return {'cpu': {'name': _inventory['cpu'], 'cores': psutil.cpu_count(logical=False), 'threads': psutil.cpu_count(), 'usage_percent': psutil.cpu_percent(interval=.15)}, 'memory': {'total_gb': round(mem.total/1024**3, 1), 'used_gb': round((mem.total-mem.available)/1024**3, 1), 'usage_percent': mem.percent}, 'gpus': gpus, 'os': platform.system()+' '+platform.release(), 'updated': time.time()}
