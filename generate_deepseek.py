import json
from pathlib import Path

root = Path(__file__).parent
name = 'deepseek_whale_original'
g = json.loads((root / 'workflows/qwen21_original_api.json').read_text())
prompt = '''A photorealistic live-action interpretation of the DeepSeek blue whale mascot, a single extremely chubby adorable blue whale floating underwater, full body visible, huge round plump belly, broad rounded head, small gentle black eyes, a charming subtle smile, short rounded pectoral flippers and a clearly visible horizontal whale tail. Vivid rich ocean-blue skin with a lighter pale blue belly, realistic smooth wet whale skin with fine natural texture, soft folds around the plump belly. Three-quarter front view, the whale looking toward the camera, expressive and lovable, believable cinematic creature photography rather than a cartoon or toy. Sunbeams penetrating turquoise water from above, a few tiny bubbles, subtle suspended particles, softly blurred deep ocean background, beautiful natural underwater caustics across the whale, high-end wildlife movie still, detailed realistic lighting, the blue fat whale fills most of the frame, centered vertical portrait composition with breathing room around the tail and flippers, no lettering, no watermark.'''
g['4']['inputs']['prompt'] = prompt
g['5']['inputs'].update(width=864, height=1152)
g['7']['inputs']['seed'] = 2026093001
g['9']['inputs']['filename_prefix'] = 'Qwen21/deepseek_whale_original'
w = json.loads((root / 'workflows/qwen21_original.json').read_text())
for n in w['nodes']:
    if n['id'] == 4: n['widgets_values'][0] = prompt
    if n['id'] == 5: n['widgets_values'] = [864, 1152, 1]
    if n['id'] == 7: n['widgets_values'][0] = 2026093001
    if n['id'] == 9: n['widgets_values'][0] = 'Qwen21/deepseek_whale_original'
for folder in [root/'workflows', root/'ComfyUI/user/default/workflows']:
    (folder / (name+'.json')).write_text(json.dumps(w, ensure_ascii=False, indent=2), encoding='utf-8')
(root/'workflows'/ (name+'_api.json')).write_text(json.dumps(g, ensure_ascii=False, indent=2), encoding='utf-8')
