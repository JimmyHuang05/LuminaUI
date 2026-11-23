import json, unittest
from unittest.mock import AsyncMock,patch
import prompt_metadata as metadata
class TitleTests(unittest.IsolatedAsyncioTestCase):
    async def test_overlong_is_rewritten_not_truncated(self):
        original='source prompt'
        with patch.object(metadata.deepseek_client,'complete',AsyncMock(side_effect=[json.dumps({'title':'一'*20}),json.dumps({'title':'白裙女子花园站立'})])) as api:
            self.assertEqual(await metadata.generate_title(original),'白裙女子花园站立')
            self.assertEqual(api.call_count,2)
            self.assertIn(original,api.call_args.args[0])
            self.assertIn('20字',api.call_args.args[0])
    async def test_valid_title_needs_one_request(self):
        with patch.object(metadata.deepseek_client,'complete',AsyncMock(return_value=json.dumps({'title':'白裙女子花园站立'}))) as api:
            await metadata.generate_title('source');self.assertEqual(api.call_count,1)
    async def test_invalid_format_then_short_title_are_retried(self):
        with patch.object(metadata.deepseek_client,'complete',AsyncMock(side_effect=['not JSON','{"title":"人"}',json.dumps({'title':'白裙女子花园站立'})])) as api:
            self.assertEqual(await metadata.generate_title('source'),'白裙女子花园站立');self.assertEqual(api.call_count,3)
    async def test_retries_are_bounded(self):
        with patch.object(metadata.deepseek_client,'complete',AsyncMock(return_value=json.dumps({'title':'一'*20}))) as api:
            with self.assertRaisesRegex(ValueError,'自动修正两次'):await metadata.generate_title('source')
            self.assertEqual(api.call_count,3)
if __name__=='__main__':unittest.main()
