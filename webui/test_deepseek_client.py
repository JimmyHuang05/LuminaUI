import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch,AsyncMock
import deepseek_client as client
import server

class AssistantTests(unittest.IsolatedAsyncioTestCase):
    def test_configuration_preserves_and_hides_key(self):
        old=client.load();old['api_key']='test-secret'
        saved=client.validate({'api_key':'','model':'deepseek-flash','instructions':{'modify':'Only change requested details.'}},old)
        self.assertEqual(saved['api_key'],'test-secret')
        self.assertNotIn('api_key',client.public(saved))
        self.assertNotIn('test-secret',json.dumps(client.public(saved)))
        self.assertEqual(client.validate({'clear_key':True},saved)['api_key'],'')
        with self.assertRaises(ValueError):client.validate({'base_url':'http://bad.example'},old)
        with self.assertRaises(ValueError):client.validate({'instructions':{'modify':''}},old)

    async def test_settings_roundtrip_without_exposing_secret(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(client,'PATH',Path(tmp)/'settings.json'):
            request=type('Request',(),{'method':'POST','json':AsyncMock(return_value={'api_key':'private-test-key'})})()
            response=await client.settings(request)
            self.assertNotIn('private-test-key',response.text)
            self.assertEqual(client.load()['api_key'],'private-test-key')

    async def test_cloud_edit_does_not_access_comfy_queue(self):
        request=type('Request',(),{'json':AsyncMock(return_value={'image':'test.png','prompt':'Change shirt to blue.'})})()
        with patch.object(server,'input_path',return_value=Path('test.png')),patch.object(client,'complete',AsyncMock(return_value='Change only the shirt color to blue.')) as complete,patch.object(server,'backend',AsyncMock(side_effect=AssertionError('Must not access ComfyUI'))):
            response=await server.enhance_edit(request)
            self.assertEqual(json.loads(response.text)['original_prompt'],'Change shirt to blue.')
            self.assertEqual(complete.call_args.kwargs['task'],'edit')

    async def test_missing_key_fails_before_network(self):
        config=client.validate({'clear_key':True},client.load())
        with self.assertRaisesRegex(ValueError,'API Key'):await client.complete('test',config=config)

    async def test_request_uses_task_and_structured_output(self):
        captured={}
        class Response:
            status=200
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def json(self):return {'choices':[{'finish_reason':'stop','message':{'content':'{"title":"测试","prompt":"A blue cup"}'}}]}
        class Session:
            def __init__(self,*args,**kwargs):pass
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            def post(self,url,**kwargs):captured.update(url=url,**kwargs);return Response()
        config=client.validate({'api_key':'fake-test-key'},client.load())
        with patch.object(client,'ClientSession',Session):await client.complete('Only change color.',task='modify',structured=True,config=config)
        payload=captured['json']
        self.assertEqual(payload['model'],'deepseek-flash')
        self.assertEqual(payload['response_format']['type'],'json_object')
        self.assertIn(config['instructions']['modify'],payload['messages'][0]['content'])
        self.assertEqual(payload['messages'][1]['content'][0]['text'],'Only change color.')
        self.assertFalse(captured['allow_redirects'])

if __name__=='__main__':unittest.main()
