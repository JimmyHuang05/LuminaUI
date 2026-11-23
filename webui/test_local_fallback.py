import unittest
from unittest.mock import AsyncMock, patch
import deepseek_client as client
import local_vlm

def result(text):return {'choices':[{'finish_reason':'stop','message':{'content':text}}]}

class Session:
    data=result('cloud')
    status=200
    def __init__(self,*args,**kwargs):pass
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass
    def post(self,*args,**kwargs):return self
    async def json(self):return self.data
    async def text(self):return 'service unavailable'

class FallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_plan_does_not_launch_local(self):
        import prompt_metadata
        config=client.load();config['api_key']='unit-test'
        with patch.object(Session,'data',result('{"patch":{},"body_instruction":null}')),patch.object(client,'ClientSession',Session),patch.object(local_vlm,'complete',AsyncMock()) as fallback:
            with self.assertRaises(client.NoExecutableEdit):
                await client.complete('test',config=config,validator=lambda raw:prompt_metadata.validate_plan(raw,{}))
            fallback.assert_not_awaited()

    async def run_call(self,data,status=200,validator=None):
        config=client.load();config['api_key']='unit-test'
        with patch.object(Session,'data',data),patch.object(Session,'status',status),patch.object(client,'ClientSession',Session),patch.object(local_vlm,'complete',AsyncMock(return_value=result('local'))) as fallback:
            output=await client.complete('test',config=config,validator=validator)
            return output,fallback.await_count

    async def test_cloud_success_never_loads_local(self):
        output,calls=await self.run_call(result('cloud'))
        self.assertEqual((output,output.provider,calls),('cloud','deepseek',0))

    async def test_http_and_invalid_payload_do_not_switch_models(self):
        for data,status in [({},503),({},200),({'choices':[]},200)]:
            config=client.load();config['api_key']='unit-test'
            with patch.object(Session,'data',data),patch.object(Session,'status',status),patch.object(client,'ClientSession',Session),patch.object(local_vlm,'complete',AsyncMock()) as fallback:
                with self.assertRaises(ValueError):await client.complete('test',config=config)
                fallback.assert_not_awaited()

    async def test_semantic_validator_failure_does_not_switch_models(self):
        config=client.load();config['api_key']='unit-test'
        def validate(text):raise ValueError('invalid modules')
        with patch.object(Session,'data',result('bad modules')),patch.object(client,'ClientSession',Session),patch.object(local_vlm,'complete',AsyncMock()) as fallback:
            with self.assertRaisesRegex(ValueError,'invalid modules'):
                await client.complete('test',config=config,validator=validate)
            fallback.assert_not_awaited()

    async def test_refusal_never_falls_back(self):
        for data in [result("I can't help with this request."),result('抱歉，我无法处理此请求'),{'choices':[{'finish_reason':'content_filter','message':{}}]}]:
            config=client.load();config['api_key']='unit-test'
            with patch.object(Session,'data',data),patch.object(client,'ClientSession',Session),patch.object(local_vlm,'complete',AsyncMock()) as fallback:
                with self.assertRaises(client.ModelRefusal):await client.complete('test',config=config)
                fallback.assert_not_awaited()

    async def test_invalid_local_result_keeps_failure(self):
        config=client.load();config['api_key']='unit-test'
        with patch.object(Session,'data',{}),patch.object(client,'ClientSession',Session),patch.object(local_vlm,'complete',AsyncMock(return_value={})):
            with self.assertRaisesRegex(ValueError,'原内容已保留'):await client.complete('test',config=config)
