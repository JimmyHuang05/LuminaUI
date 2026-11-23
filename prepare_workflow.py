import ast
import json
from pathlib import Path
source = ast.parse(Path('ComfyUI/script_examples/basic_api_example.py').read_text())
text = next(ast.literal_eval(n.value) for n in source.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'prompt_text' for t in n.targets))
prompt = json.loads(text)
prompt['4']['inputs']['ckpt_name'] = 'sd_xl_base_1.0.safetensors'
prompt['5']['inputs'].update(width=1024, height=1024)
prompt['3']['inputs'].update(steps=20, cfg=7, seed=42)
prompt['6']['inputs']['text'] = 'product photography of a ceramic teapot on a wooden table, soft window light, detailed, elegant composition'
prompt['7']['inputs']['text'] = 'blurry, low quality, distorted'
prompt['9']['inputs']['filename_prefix'] = 'SDXL_test'
Path('workflows').mkdir(exist_ok=True)
Path('workflows/sdxl_text_to_image_api.json').write_text(json.dumps(prompt, indent=2))
