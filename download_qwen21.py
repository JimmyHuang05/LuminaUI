import os
os.environ.update(HF_HOME=r'D:\Comfy UI\cache\huggingface', HF_HUB_DISABLE_TELEMETRY='1', TEMP=r'D:\Comfy UI\tmp', TMP=r'D:\Comfy UI\tmp')
from huggingface_hub import hf_hub_download
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
jobs=[('Comfy-Org/Qwen-Image-2.1','diffusion_models/qwen_image_2.1_int8_convrot.safetensors'),('Comfy-Org/Qwen-Image-2.1','text_encoders/qwen3vl_8b_int8_convrot.safetensors'),('Comfy-Org/Qwen-Image-2.1','vae/qwen_image_2.1_vae_bf16.safetensors'),('Viggle/Qwen-Image-2.1-viggle-turbo','Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors')]
def download(job):
    repo,name=job
    dest=Path('ComfyUI/models') if repo.startswith('Comfy-Org') else Path('ComfyUI/models/loras')
    result=hf_hub_download(repo,name,local_dir=dest)
    print('DONE',result,flush=True)
with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(download,jobs))
