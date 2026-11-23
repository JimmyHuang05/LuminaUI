"""Start the bundled Qwen workflow in the isolated portable runtime."""
import json
import os
from pathlib import Path
import runpy
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
ENGINE_PORT = 18288
WEB_PORT = 18290


def run():
    os.chdir(ROOT)
    for port in (ENGINE_PORT, WEB_PORT):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
    engine = Path(sys.executable).resolve().parents[1] / 'ComfyUI'
    storage = ROOT / 'ComfyUI'
    for folder in ('input', 'output', 'models', 'temp', 'user', 'custom_nodes'):
        (storage / folder).mkdir(parents=True, exist_ok=True)
    data = ROOT / 'webui/data'
    data.mkdir(exist_ok=True)
    graph = json.loads((ROOT / 'workflows/presets/01_text_to_image_api.json').read_text(encoding='utf-8'))
    command = [sys.executable, '-s', str(engine / 'main.py'), '--listen', '127.0.0.1',
               '--port', str(ENGINE_PORT), '--base-directory', str(storage),
               '--reserve-vram', '2', '--preview-method', 'auto']
    with (data / 'comfyui.log').open('a', encoding='utf-8') as log:
        process = subprocess.Popen(command, cwd=engine.parent, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 240
            while True:
                if process.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError('ComfyUI startup failed. See webui/data/comfyui.log')
                try:
                    with urlopen(f'http://127.0.0.1:{ENGINE_PORT}/object_info', timeout=8) as response:
                        nodes = json.load(response)
                    break
                except OSError:
                    time.sleep(1)
            missing = {node['class_type'] for node in graph.values()} - nodes.keys()
            if missing:
                raise RuntimeError(f'Missing workflow nodes: {sorted(missing)}')
            print('Qwen-Image-2.1 is ready: http://127.0.0.1:18290/workbench', flush=True)
            sys.path.insert(0, str(ROOT / 'webui'))
            runpy.run_path(str(ROOT / 'webui/server.py'), run_name='__main__')
        finally:
            process.terminate()
            process.wait()


if __name__ == '__main__':
    run()
