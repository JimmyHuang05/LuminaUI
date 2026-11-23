import hashlib,json,os
from pathlib import Path
from huggingface_hub import get_hf_file_metadata,hf_hub_url
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
exec(Path('download_qwen21.py').read_text().split('def download')[0])
records=[]
for repo,name in jobs:
    p=Path('ComfyUI/models')/name if repo.startswith('Comfy-Org') else Path('ComfyUI/models/loras')/name
    metadata=get_hf_file_metadata(hf_hub_url(repo,name))
    digest=hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
    assert digest==metadata.etag,(p,digest,metadata.etag)
    records.append({'file':str(p),'sha256':digest,'revision':metadata.commit_hash,'bytes':p.stat().st_size})
    print('Verified',p.name,flush=True)
Path('workflows/qwen21_model_manifest.json').write_text(json.dumps(records,indent=2))
