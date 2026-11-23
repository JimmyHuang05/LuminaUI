import asyncio,json,time
from pathlib import Path
from aiohttp import ClientSession,FormData
ROOT=Path(__file__).resolve().parents[1]
async def main():
    async with ClientSession() as s:
        async with s.get('http://127.0.0.1:8190/api/config') as r:config=await r.json()
        assert len(config['presets'])==4
        headers={'X-App-Token':config['token']}
        async with s.post('http://127.0.0.1:8190/api/generate',json={}) as r:assert r.status==403
        async with s.post('http://127.0.0.1:8190/api/generate',json={'preset':'04_upscale'},headers=headers) as r:assert r.status==400
        form=FormData();form.add_field('image',(ROOT/'ComfyUI/input/identity_reference_example.png').read_bytes(),filename='sample.png',content_type='image/png')
        async with s.post('http://127.0.0.1:8190/api/upload',data=form,headers=headers) as r:
            assert r.status==200;upload=await r.json()
        async with s.get('http://127.0.0.1:8190'+upload['url']) as r:assert r.status==200 and r.content_type=='image/png'
        async with s.post('http://127.0.0.1:8190/api/generate',json={'preset':'04_upscale','image':upload['image'],'scale':'2x'},headers=headers) as r:
            job=await r.json();assert r.status==200,job
        print('Upload, validation, reference preview and generation submission passed',flush=True)
        for _ in range(180):
            async with s.get('http://127.0.0.1:8190/api/status') as r:state=await r.json()
            current=next(j for j in state['jobs'] if j['prompt_id']==job['prompt_id'])
            if current['status'] in ['success','error']:break
            await asyncio.sleep(2)
        assert current['status']=='success',current
        async with s.get('http://127.0.0.1:8190'+current['images'][0]['url']) as r:assert r.status==200 and len(await r.read())>1000
        print('Output download and persistent history passed',flush=True)
        (ROOT/'webui/data/integration_test.json').write_text(json.dumps({'passed':True,'job':current},ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
