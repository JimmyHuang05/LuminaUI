"""Exercise the same HTTP endpoints used by the desktop, with a small test image."""
import asyncio, io, json, time
from pathlib import Path
import aiohttp
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:8190'

async def main():
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as s:
        async with s.get(BASE+'/api/config') as r:
            assert r.status==200
            config=await r.json()
        headers={'X-App-Token':config['token']}
        for route in ['/workbench','/resources','/generated','/image-reader','/api/models','/api/loras','/api/generated-images']:
            async with s.get(BASE+route) as r:
                assert r.status==200,(route,r.status)
                await r.read()
        async with s.get(BASE+'/api/status') as r:
            status=await r.json()
            assert status['online'], 'ComfyUI is not online'
            assert not status['queue'], 'Existing queued work; do not add a test job'
        print('Live pages, model library, gallery and ComfyUI connection OK',flush=True)
        image=Image.new('RGB',(256,256),'#242424');draw=ImageDraw.Draw(image)
        draw.rectangle((30,30,225,225),outline='#ddd',width=3)
        draw.ellipse((70,70,185,185),fill='#94a888');draw.text((45,232),'LUMINA DESKTOP TEST',fill='white')
        data=io.BytesIO();image.save(data,format='PNG')
        form=aiohttp.FormData();form.add_field('image',data.getvalue(),filename='lumina_desktop_smoke.png',content_type='image/png')
        async with s.post(BASE+'/api/upload',data=form,headers=headers) as r:
            upload=await r.json();assert r.status==200,upload
        async with s.get(BASE+upload['url']) as r:assert r.status==200
        async with s.post(BASE+'/api/generate',json={'preset':'04_upscale','image':upload['image'],'upscale_model':'hat','scale':'2x'},headers=headers) as r:
            job=await r.json();assert r.status==200,job
        print('Image upload and 2x HAT job submission OK',flush=True)
        deadline=time.monotonic()+180
        while time.monotonic()<deadline:
            async with s.get(BASE+'/api/status') as r:state=await r.json()
            current=next(j for j in state['jobs'] if j['prompt_id']==job['prompt_id'])
            if current['status'] in ['success','error','cancelled']:break
            await asyncio.sleep(2)
        assert current['status']=='success',current.get('error',current['status'])
        async with s.get(BASE+current['images'][0]['url']) as r:
            result=await r.read();assert r.status==200
            with Image.open(io.BytesIO(result)) as output:assert output.size==(512,512),output.size
        report={'passed':True,'prompt_id':job['prompt_id'],'output':current['images'][0],'size':[512,512]}
        (ROOT/'desktop/logs/live-smoke.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print('Completed: 512x512 output, image retrieval and persistent job history OK',flush=True)

asyncio.run(main())
