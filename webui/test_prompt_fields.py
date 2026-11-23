import json, unittest
from unittest.mock import AsyncMock,patch
import simple_pe
from prompt_metadata import FIELD_NAMES,split,normalize_body

class FieldTests(unittest.IsolatedAsyncioTestCase):
    def test_targeted_patch_and_append(self):
        source='[Hair]\nLong black hair.\n\n[Top]\nA white shirt.\n\n[Body Pose]\nStanding.\n\n[Background]\nA wooden wall.'
        result=simple_pe.apply_modules(source,json.dumps({'modules':{'Hair':'Long brown hair.'}}))
        self.assertEqual(result,source.replace('black','brown'))
        result=simple_pe.apply_modules(source,json.dumps({'modules':{'Footwear':'White shoes.'}}))
        self.assertTrue(result.startswith(source));self.assertEqual(split(result)['Footwear'],'White shoes.')
        for bad in [{'Hair':''},{'Hair':'none'},{'Hair':'[Top]\nshirt'},{'Unknown':'abc'}]:
            with self.assertRaises(ValueError):simple_pe.apply_modules(source,json.dumps({'modules':bad}))
    def test_fixed_format_validation(self):
        values=dict.fromkeys(FIELD_NAMES,'');values['Hair']='Long black hair.';values['Top']='None'
        body=normalize_body(json.dumps({'modules':values}));self.assertEqual(list(split(body,strict=True)),FIELD_NAMES)
        self.assertEqual(split(body)['Top'],'')
        del values['Face']
        with self.assertRaises(ValueError):normalize_body(json.dumps({'modules':values}))
    async def test_format_and_update_contract(self):
        values=dict.fromkeys(FIELD_NAMES,'');values.update(Hair='Black hair.',Top='White shirt.')
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock(return_value=json.dumps({'modules':values}))) as call:
            result=await simple_pe._run('format','Black hair, white shirt.')
            self.assertEqual(call.call_args.kwargs['output_schema']['properties']['modules']['required'],FIELD_NAMES)
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock(return_value=json.dumps({'title':'白衣黑发人物肖像','card_summary':'白衣黑发人物','module_summaries':{'Hair':'黑发','Top':'白衬衫'},'rating':'G'}))) as call:
            update=await simple_pe._run('update',result['prompt'])
            self.assertNotIn('prompt',update)
            self.assertEqual(set(call.call_args.kwargs['output_schema']['properties']['module_summaries']['properties']),{'Hair','Top'})
    async def test_modify_sparse_schema(self):
        with patch.object(simple_pe.deepseek_client,'complete',AsyncMock(return_value='{"modules":{"Hair":"Brown hair."}}')) as call:
            output=await simple_pe._run('modify','[Hair]\nBlack hair.\n\n[Expression]\nSmiling.','改成棕发')
            self.assertEqual(output['prompt'],'[Hair]\nBrown hair.\n\n[Expression]\nSmiling.')
            self.assertEqual(call.call_args.kwargs['output_schema']['properties']['modules']['required'],[])

if __name__=='__main__':unittest.main()
