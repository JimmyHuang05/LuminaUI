from huggingface_hub import hf_hub_download
from pathlib import Path
import os
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
for name in ['comfyui/viggle_turbo.py','comfyui/Qwen-Image-2.1-viggle-turbo-t2i.json']:
    p=hf_hub_download('Viggle/Qwen-Image-2.1-viggle-turbo',name,local_dir='tmp/viggle_source')
    print(p)
