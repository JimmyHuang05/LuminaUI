import json,unittest
from unittest.mock import AsyncMock,patch
import simple_pe
from prompt_metadata import NAMES

BODY='\n\n'.join('['+n+']'+('\nA blue cup.' if i==0 else '') for i,n in enumerate(NAMES))
class SimplePETests(unittest.IsolatedAsyncioTestCase):
    async def test_modify_rating_only_preserves_body(self):
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock(return_value='{"modules":{},"rating":"R-15"}')) as call:
            result=await simple_pe.run('modify',BODY,'分级改成R15',{'level':'sfw'})
            self.assertEqual(result['prompt'],BODY)
            self.assertEqual(result['content_rating']['level'],'r15')
            self.assertEqual(set(result),{'prompt','content_rating'})
            self.assertEqual(json.loads(call.call_args.args[0])['current_rating'],'G')
            self.assertEqual(call.await_count,1)

    def test_modify_body_and_rating_atomic_validation(self):
        result=simple_pe.apply_modify(BODY,json.dumps({'modules':{NAMES[0]:'A red cup.'},'rating':'G'}))
        self.assertEqual(result['prompt'],BODY.replace('blue','red'))
        self.assertEqual(result['content_rating']['hash'],simple_pe.digest(result['prompt']))
        for rating in ['R-20',None,{}]:
            with self.assertRaises(ValueError):simple_pe.apply_modify(BODY,json.dumps({'modules':{},'rating':rating}))

    def test_modules_preserve_unrelated_text_and_reject_invalid(self):
        result=simple_pe.apply_modules(BODY,json.dumps({'modules':{NAMES[0]:'A red cup.'}}))
        self.assertEqual(result,BODY.replace('blue','red'))
        self.assertEqual(simple_pe.apply_modules(BODY,'{"modules":{}}'),BODY)
        for modules in [{NAMES[0]:''},{'Unknown':'x'},{NAMES[0]:'None.'},{NAMES[0]:'[Scene / Background]\nx'}]:
            with self.assertRaises(ValueError):simple_pe.apply_modules(BODY,json.dumps({'modules':modules}))
        result=simple_pe.apply_modules(BODY,json.dumps({'modules':{NAMES[5]:'Soft light.'}}))
        self.assertEqual(simple_pe.split(result,strict=True)[NAMES[5]],'Soft light.')
        self.assertTrue(result.startswith(BODY[:BODY.index('['+NAMES[5]+']')]))
    async def test_modify_separates_instruction_and_returns_body_only(self):
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock(return_value='{"modules":{}}')) as call:
            result=await simple_pe.run('modify',BODY,'Change the cup to red.')
            self.assertEqual(result,{'prompt':BODY})
            self.assertEqual(call.await_count,1)
            data=json.loads(call.call_args.args[0])
            self.assertEqual(data['source_modules'],simple_pe.split(BODY,strict=True))
            self.assertEqual(data['requested_changes'],'Change the cup to red.')
    async def test_modify_rejects_missing_instruction_before_request(self):
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock()) as call:
            with self.assertRaises(ValueError):await simple_pe.run('modify',BODY)
            call.assert_not_awaited()
    async def test_modify_incomplete_result_fails_without_retry(self):
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock(return_value='Red cup.')) as call:
            with self.assertRaises(ValueError):await simple_pe.run('modify',BODY,'Make it red.')
            self.assertEqual(call.await_count,1)
    async def test_format_one_call_only_body(self):
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock(return_value=BODY)) as call:
            self.assertEqual(await simple_pe.run('format','A blue cup.'),{'prompt':BODY})
            self.assertEqual(call.await_count,1)
            self.assertFalse(call.call_args.kwargs['allow_fallback'])
    async def test_update_one_call_and_no_body_or_tags(self):
        obj={'title':'木桌上的蓝色瓷杯','card_summary':'木桌上摆着蓝色瓷杯','module_summaries':{NAMES[0]:'蓝色瓷杯'},'rating':'G'}
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock(return_value=json.dumps(obj))) as call:
            result=await simple_pe.run('update',BODY)
            self.assertEqual(set(result),{'title','card_summary','module_summaries','content_rating'})
            self.assertEqual(call.await_count,1)
            schema=call.call_args.kwargs['output_schema']
            self.assertEqual(set(schema['required']),{'title','card_summary','module_summaries','rating'})
            self.assertEqual(schema['properties']['module_summaries']['required'],[NAMES[0]])
            self.assertFalse(schema['additionalProperties'])
            self.assertEqual(schema['properties']['title']['maxLength'],14)
            self.assertEqual(schema['properties']['card_summary']['maxLength'],30)
            self.assertEqual(schema['properties']['module_summaries']['properties'][NAMES[0]]['maxLength'],30)
    async def test_invalid_update_does_not_retry(self):
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock(return_value='{}')) as call:
            with self.assertRaises(ValueError):await simple_pe.run('update',BODY)
            self.assertEqual(call.await_count,1)
    async def test_other_tasks_rejected_before_call(self):
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock()) as call:
            with self.assertRaises(ValueError):await simple_pe.run('edit_card',BODY)
            call.assert_not_awaited()
