"""On-demand local Qwen3.5 inference, serialized against generation submissions."""
import storage_paths
import asyncio, copy, secrets, subprocess, socket, uuid
from pathlib import Path
from aiohttp import ClientSession, ClientTimeout, ClientError

ROOT=Path(__file__).resolve().parents[1]
GPU_LOCK=asyncio.Lock()

def available_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        return sock.getsockname()[1]

def cleanup_orphans():
    import psutil
    expected=(ROOT/'tools/llama-b11345-cuda12/llama-server.exe').resolve()
    import pe_models
    models={Path(r['model_path']).resolve() for r in pe_models.load()['models'] if r['kind']=='local'}
    stopped=[]
    for process in psutil.process_iter(['exe','ppid','cmdline']):
        try:
            args=process.info['cmdline'] or []
            if not process.info['exe'] or Path(process.info['exe']).resolve()!=expected:continue
            if psutil.pid_exists(process.info['ppid']):continue
            if '-m' not in args or Path(args[args.index('-m')+1]).resolve() not in models:continue
            process.terminate();stopped.append(process)
        except (psutil.Error,ValueError,IndexError):continue
    _,alive=psutil.wait_procs(stopped,timeout=5)
    for process in alive:process.kill()
    return len(stopped)

async def complete(payload,config=None):
    try:
        return await asyncio.wait_for(_complete(payload,config),timeout=300)
    except asyncio.TimeoutError:
        raise ValueError('本地模型等待或生成超时，原内容已保留') from None

async def _complete(payload,config=None):
    folder=storage_paths.path('local_pe')
    executable=ROOT/'tools/llama-b11345-cuda12/llama-server.exe'
    model=folder/'Qwen3.5-4B-Q4_K_M.gguf';projector=folder/'mmproj-F16.gguf'
    if config:
        model=Path(config['model_path']);projector=Path(config['projector_path']) if config.get('projector_path') else None
    if not all(p.is_file() for p in (executable,model)) or (projector and not projector.is_file()):
        raise ValueError('本地模型或推理引擎文件不完整，原内容已保留')
    async with GPU_LOCK:
        async with ClientSession(timeout=ClientTimeout(total=10)) as session:
            # Do not unload a model while ComfyUI is generating.
            for _ in range(90):
                async with session.get('http://127.0.0.1:8188/queue') as r:
                    r.raise_for_status();queue=await r.json()
                if not queue['queue_running'] and not queue['queue_pending']:break
                await asyncio.sleep(1)
            else:raise ValueError('生图任务仍在运行，本地助手暂不可用，原内容已保留')
            async with session.post('http://127.0.0.1:8188/free',json={'unload_models':True,'free_memory':True}) as r:
                r.raise_for_status()
        key=secrets.token_urlsafe(32)
        port=available_port()
        endpoint=f'http://127.0.0.1:{port}'
        command=[str(executable),'-m',str(model),
                 '--host','127.0.0.1','--port',str(port),'--api-key',key,
                 '-c',str((config or {}).get('context_length',16384)),'-ngl','auto','--fit','on','-fa','on','--parallel','1','--reasoning','off']
        if projector:command.extend(['--mmproj',str(projector)])
        process=None
        with (storage_paths.path('data')/('local-vlm-'+uuid.uuid4().hex[:12]+'.log')).open('w',encoding='utf-8') as log:
            try:
                process=subprocess.Popen(command,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
                async with ClientSession(timeout=ClientTimeout(total=150),headers={'Authorization':'Bearer '+key}) as session:
                    for _ in range(90):
                        if process.poll() is not None:raise ValueError('本地模型加载失败：文件可能不兼容当前引擎，或显存不足。请查看 local-vlm 日志')
                        try:
                            async with session.get(endpoint+'/v1/models',timeout=ClientTimeout(total=2)) as r:
                                if r.status==200:break
                                if r.status in (401,403):raise ValueError('本地模型身份校验失败，未发送请求内容')
                        except (ClientError,asyncio.TimeoutError):pass
                        await asyncio.sleep(1)
                    else:raise ValueError('本地模型加载超时')
                    body=copy.deepcopy(payload)
                    body.update(model=(config or {}).get('model','qwen3.5-4b-local'),temperature=0,seed=424242,chat_template_kwargs={'enable_thinking':False})
                    body.pop('thinking',None)
                    async with session.post(endpoint+'/v1/chat/completions',json=body) as r:
                        if r.status!=200:raise ValueError(f'本地模型请求失败（HTTP {r.status}）')
                        r.raise_for_status()
                        return await r.json()
            finally:
                if process and process.poll() is None:
                    process.terminate()
                    try:await asyncio.to_thread(process.wait,30)
                    except subprocess.TimeoutExpired:
                        process.kill();await asyncio.to_thread(process.wait,10)
