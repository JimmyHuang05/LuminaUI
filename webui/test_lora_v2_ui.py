"""Isolated UI fixture on port 8193. No real model files, jobs or GPU execution."""
import asyncio
from aiohttp import web
import lora_v2
import server
import test_lora_v2


async def main():
    fixture = test_lora_v2.LibraryTests()
    fixture.setUp()
    fixture.files[0].pop('label')
    stop = asyncio.Event()

    async def status(request):
        return web.json_response({'online':True,'jobs':[],'queue':0,'missing_inputs':[]})

    async def empty(request):
        return web.json_response([])

    async def no_generate(request):
        raise ValueError('界面测试环境：禁止实际生成')

    async def shutdown(request):
        stop.set()
        return web.json_response({'stopped':True})

    app = web.Application(middlewares=[server.guard])
    app.router.add_get('/',server.index)
    app.router.add_get('/api/config',server.config)
    app.router.add_get('/api/status',status)
    app.router.add_get('/api/prompts',empty)
    app.router.add_get('/api/lora-v2',lora_v2.library)
    app.router.add_post('/api/lora-v2/profile',lora_v2.edit_profile)
    app.router.add_post('/api/lora-v2/validate',lora_v2.check)
    app.router.add_post('/api/generate',no_generate)
    app.router.add_post('/shutdown',shutdown)
    app.router.add_get('/{file:app\\.js|editor\\.js|orb-loader\\.js|lora-v2\\.js|lora-v2\\.css}',server.asset)
    runner = web.AppRunner(app)
    try:
        await runner.setup()
        await web.TCPSite(runner,'127.0.0.1',8193).start()
        print('Isolated LoRA UI fixture: http://127.0.0.1:8193/?studio=1',flush=True)
        await stop.wait()
    finally:
        await runner.cleanup()
        fixture.tearDown()


if __name__=='__main__': asyncio.run(main())
