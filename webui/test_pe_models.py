import copy
import io
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock
from aiohttp import web, FormData
from aiohttp.test_utils import TestClient, TestServer
import pe_models as registry
import pe_transport as wire
import pe_local_import as local
import deepseek_client


SCHEMA = {'type': 'object', 'properties': {'ok': {'type': 'boolean'}}, 'required': ['ok'], 'additionalProperties': False}


def gguf(path, arch='llama', extra=None):
    meta = {'general.architecture': arch, 'general.name': 'Test Model', arch + '.context_length': 32768,
            arch + '.embedding_length': 4096, **(extra or {})}
    def string(s):
        b = s.encode();return struct.pack('<Q', len(b)) + b
    data = b'GGUF' + struct.pack('<IQQ', 3, 1, len(meta))
    for k, v in meta.items():
        data += string(k) + struct.pack('<I', 8 if isinstance(v, str) else 4)
        data += string(v) if isinstance(v, str) else struct.pack('<I', v)
    data += string('weight') + struct.pack('<IQIQ', 1, 16, 0, 0)
    data += bytes((-len(data)) % 32) + bytes(64)
    path.write_bytes(data)
    return path


class ModelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patchers = [patch.object(registry, 'PATH', self.root/'registry.json'),
                         patch.object(deepseek_client, 'PATH', self.root/'legacy.json'),
                         patch.object(local.storage_paths, 'path', return_value=self.root/'models')]
        for p in self.patchers:p.start()
        self.app = web.Application(client_max_size=32*1024**2)
        @web.middleware
        async def errors(request, handler):
            try:return await handler(request)
            except ValueError as e:return web.json_response({'error': str(e)}, status=400)
        self.app.middlewares.append(errors)
        self.app.router.add_get('/models', registry.manage)
        self.app.router.add_post('/models', registry.manage)
        self.app.router.add_post('/import', local.upload)
        self.client = TestClient(TestServer(self.app));await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        for p in reversed(self.patchers):p.stop()
        self.tmp.cleanup()

    async def post(self, body):
        r = await self.client.post('/models', json=body)
        return r.status, await r.json()

    async def test_multiple_profiles_default_and_secret_isolation(self):
        first = {'vendor': 'openai', 'model': 'gpt-6.1-sol', 'api_key': 'secret-one', 'make_default': True}
        code, state = await self.post(first);self.assertEqual(code, 200)
        a = next(r for r in state['models'] if r.get('vendor') == 'openai')
        self.assertEqual(state['default_id'], a['id']);self.assertNotIn('secret-one', json.dumps(state))
        _, state = await self.post(first | {'api_key': 'secret-two', 'make_default': False})
        cloud = [r for r in state['models'] if r.get('vendor') == 'openai'];self.assertEqual(len(cloud), 2)
        self.assertNotEqual(cloud[0]['id'], cloud[1]['id'])
        code, _ = await self.post(a | {'api_key': '', 'name': 'work'})
        self.assertEqual(code, 200);self.assertEqual(registry.get(a['id'])['api_key'], 'secret-one')
        code, _ = await self.post(a | {'api_key': '', 'base_url': 'https://other.example/v1'})
        self.assertEqual(code, 400);self.assertEqual(registry.get(a['id'])['base_url'], 'https://api.openai.com/v1')
        await self.post({'id': a['id'], 'action': 'remove'})
        self.assertNotEqual(registry.load()['default_id'], a['id'])

    async def test_legacy_config_is_preserved_on_first_save(self):
        deepseek_client.PATH.write_text(json.dumps({'api_key': 'legacy-secret', 'model': 'deepseek-flash'}))
        await self.post({'vendor': 'gemini', 'model': 'gemini-3.8-flash', 'api_key': 'another'})
        self.assertEqual(registry.get('deepseek')['api_key'], 'legacy-secret')
        self.assertEqual(deepseek_client.load()['api_key'], 'legacy-secret')

    async def test_validation_and_vision_gate(self):
        for url in ['http://example.com', 'https://user:key@example.com', 'https://example.com?key=x']:
            with self.assertRaises(ValueError):registry.validate({'vendor':'custom','model':'x','api_key':'test','base_url':url})
        cfg = registry.validate({'vendor':'glm','model':'glm-5','api_key':'test'})
        cfg['instructions'] = deepseek_client.DEFAULTS['instructions']
        with patch.object(deepseek_client, 'ClientSession') as network:
            with self.assertRaisesRegex(ValueError, '不支持图片'):
                await deepseek_client.complete('describe', image=Path('unused'), config=cfg)
            network.assert_not_called()

    async def test_stream_import_pair_and_failure_cleanup(self):
        model = gguf(self.root/'model.gguf');projector = gguf(self.root/'mmproj.gguf', 'clip', {'clip.vision.projection_dim':4096})
        form = FormData();form.add_field('files',model.read_bytes(),filename=model.name);form.add_field('files',projector.read_bytes(),filename=projector.name)
        r=await self.client.post('/import',data=form);state=await r.json();self.assertEqual(r.status,200,state)
        imported=registry.get(state['imported_id']);self.assertTrue(imported['vision']);self.assertEqual(imported['context_length'],16384)
        self.assertTrue(Path(imported['model_path']).is_file());self.assertTrue(Path(imported['projector_path']).is_file())
        before=list((self.root/'models/imports').iterdir())
        bad=FormData();bad.add_field('files',b'not a model',filename='bad.gguf')
        r=await self.client.post('/import',data=bad);self.assertEqual(r.status,400)
        self.assertEqual(list((self.root/'models/imports').iterdir()),before)
        await self.post({'id':imported['id'],'action':'remove'});self.assertTrue(Path(imported['model_path']).exists())

    async def test_upload_larger_than_normal_json_limit_streams(self):
        model=gguf(self.root/'large.gguf')
        with model.open('ab') as f:f.truncate(33*1024**2)
        with model.open('rb') as f:
            form=FormData();form.add_field('files',f,filename='large.gguf')
            r=await self.client.post('/import',data=form);result=await r.json();self.assertEqual(r.status,200,result)
        self.assertEqual(Path(registry.get(result['imported_id'])['model_path']).stat().st_size,33*1024**2)

    def test_truncated_split_and_wrong_projector(self):
        model=gguf(self.root/'model.gguf')
        projector=gguf(self.root/'mmproj.gguf','clip',{'clip.vision.projection_dim':1024})
        with self.assertRaisesRegex(ValueError,'不匹配'):local.register([model,projector])
        split=gguf(self.root/'split.gguf',extra={'split.count':2})
        with self.assertRaisesRegex(ValueError,'分片'):local.inspect(split)
        model.write_bytes(model.read_bytes()[:-80])
        with self.assertRaises(ValueError):local.inspect(model)


class TransportTests(unittest.TestCase):
    def payload(self):
        return {'model':'test','messages':[{'role':'system','content':'Return JSON.'},{'role':'user','content':[{'type':'text','text':'test'},{'type':'image_url','image_url':{'url':'data:image/jpeg;base64,YQ=='}}]}],
                'thinking':{'type':'disabled'},'max_tokens':6000,'stream':False,
                'tools':[{'type':'function','function':{'name':'return_metadata','parameters':SCHEMA}}],
                'tool_choice':{'type':'function','function':{'name':'return_metadata'}}}

    def test_all_vendor_payloads_and_protocols(self):
        for preset in registry.PRESETS['presets']:
            if not preset['models']:continue
            with self.subTest(vendor=preset['id']):
                cfg=registry.validate({'vendor':preset['id'],'model':preset['models'][0]['id'],'api_key':'test'})
                url,headers,body=wire.request(cfg,self.payload())
                self.assertTrue(url.startswith(preset['base_url']))
                self.assertNotIn('api_key',body)
                if preset['id']!='deepseek':self.assertNotIn('thinking',body)
                if cfg['protocol']=='responses':
                    self.assertTrue(url.endswith('/responses'));self.assertFalse(body['store']);self.assertEqual(body['input'][1]['content'][1]['type'],'input_image')
                elif cfg['protocol']=='anthropic':
                    self.assertTrue(url.endswith('/messages'));self.assertEqual(headers['anthropic-version'],'2023-06-01');self.assertEqual(body['messages'][0]['content'][1]['source']['data'],'YQ==');self.assertNotIn('Authorization',headers)
                else:self.assertTrue(url.endswith('/chat/completions'))

    def test_normalization_and_contract_rejection(self):
        samples=[({'protocol':'responses'},{'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':'{"ok":true}'}]}]}),
                 ({'protocol':'anthropic'},{'stop_reason':'end_turn','content':[{'type':'thinking','thinking':'private'},{'type':'text','text':'{"ok":true}'}]}),
                 ({'protocol':'openai'},{'choices':[{'message':{'content':'```json\n{"ok":true}\n```'}}]})]
        for config,data in samples:
            normalized=wire.normalize(config,data,SCHEMA)
            obj=json.loads(normalized['choices'][0]['message']['tool_calls'][0]['function']['arguments']);wire.validate_schema(obj,SCHEMA)
        for value in [{'ok':'true'}, {}, {'ok':True,'extra':1}, []]:
            with self.assertRaises(ValueError):wire.validate_schema(value,SCHEMA)
        response=wire.normalize({'protocol':'responses'},{'status':'completed','output':[{'content':[{'type':'refusal','refusal':'no'}]}]},SCHEMA)
        self.assertEqual(response['choices'][0]['finish_reason'],'content_filter')


if __name__=='__main__':unittest.main()
