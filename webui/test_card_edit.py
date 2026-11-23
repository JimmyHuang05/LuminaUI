import json,unittest
from unittest.mock import AsyncMock,patch
import prompt_metadata as m
class CardEditTests(unittest.IsolatedAsyncioTestCase):
 async def test_metadata_only(self):
  value={'patch':{'rating':'R-18','tags':['泳装']},'body_instruction':None}
  with patch.object(m.deepseek_client,'complete',AsyncMock(return_value=json.dumps(value))):
   self.assertEqual(await m.plan_edit('改R-18，加泳装标签',{'prompt':'source','tags':[]}),value)
 async def test_mixed_edit(self):
  value={'patch':{'card_summary':'花园站立'},'body_instruction':'Change background to a garden.'}
  with patch.object(m.deepseek_client,'complete',AsyncMock(return_value=json.dumps(value))):self.assertEqual(await m.plan_edit('改背景和摘要',{}),value)
 async def test_rejects_invalid_patch(self):
  for patch_data in [{'api_key':'bad'},{'prompt':'replace'},{'rating':'PG99'},{'card_summary':'字'*31},{'tags':['R-18']},{'module_summaries':{'unknown':'x'}}]:
   with self.subTest(patch=patch_data),patch.object(m.deepseek_client,'complete',AsyncMock(return_value=json.dumps({'patch':patch_data,'body_instruction':None}))):
    with self.assertRaises(ValueError):await m.plan_edit('修改分级',{})
 async def test_format_bypasses_planner(self):
  for instruction in ['整理','整理一下','帮我整理提示词','整理为模板']:
   with patch.object(m.deepseek_client,'complete',AsyncMock()) as complete:
    self.assertEqual(await m.plan_edit(instruction,{'prompt':'source','tags':['existing']}),{'patch':{},'body_instruction':'整理'})
    complete.assert_not_awaited()
 async def test_unsolicited_tags_rejected(self):
  for instruction in ['把背景改成花园','改标题，标签不要动','整理一下并规范表达']:
   value={'patch':{'tags':['new','extra']},'body_instruction':None}
   with patch.object(m.deepseek_client,'complete',AsyncMock(return_value=json.dumps(value))):
    with self.assertRaisesRegex(ValueError,'未授权'):await m.plan_edit(instruction,{'tags':['existing']})
 async def test_card_summary_does_not_authorize_modules(self):
  value={'patch':{'module_summaries':{'Subject Description':'人物'}},'body_instruction':None}
  with patch.object(m.deepseek_client,'complete',AsyncMock(return_value=json.dumps(value))):
   with self.assertRaisesRegex(ValueError,'未授权'):await m.plan_edit('更新摘要',{})
if __name__=='__main__':unittest.main()
