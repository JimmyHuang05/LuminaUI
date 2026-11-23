import json, tempfile, unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
import server, prompt_metadata

class FormatRatingTests(unittest.IsolatedAsyncioTestCase):
    async def test_update_rating_is_saved_without_overwriting_existing_summaries(self):
        text='\n\n'.join('['+n+']\nA sample.' for n in prompt_metadata.NAMES)
        rating={'level':'r15','source':'deepseek','reason':'根据正文更新','hash':server.content_rating.digest(text)}
        request=AsyncMock();request.path='/api/enhance-prompt';request.json.return_value={'task':'update','prompt':text}
        with patch.dict(server.FORMATTED_RATINGS,{},clear=True),patch.object(server.deepseek_client,'complete',AsyncMock(return_value=json.dumps({'title':'普通示例人物肖像','card_summary':'测试摘要','module_summaries':dict.fromkeys(prompt_metadata.NAMES,'示例'),'rating':'R-15'}))),patch.object(server.content_rating,'classify',AsyncMock(return_value=rating)):
            response=json.loads((await server.prompt_assistant(request)).body)
            self.assertEqual(response['content_rating'],rating)
            with tempfile.TemporaryDirectory() as folder,patch.object(server,'DATA',Path(folder)),patch.object(server.prompt_identity,'link_jobs',return_value=False):
                request.method='POST';request.json.return_value=[{'title':'Test','prompt':text,'content_rating':rating,'card_summary':'Existing','module_summaries':{'Subject Description':'Existing'}}]
                rows=json.loads((await server.prompt_library(request)).body)['rows']
                self.assertEqual(rows[0]['content_rating'],rating)
                self.assertEqual(rows[0]['card_summary'],'Existing')
                self.assertEqual(rows[0]['module_summaries'],{'Subject Description':'Existing'})
    async def test_format_does_not_classify(self):
        text='\n\n'.join('['+n+']\nA sample.' for n in prompt_metadata.NAMES)
        request=AsyncMock();request.path='/api/enhance-prompt';request.json.return_value={'task':'format','prompt':'source'}
        with patch.object(server.deepseek_client,'complete',AsyncMock(return_value=text)),patch.object(server.content_rating,'classify',AsyncMock()) as classify:
            response=json.loads((await server.prompt_assistant(request)).body)
            self.assertNotIn('content_rating',response);classify.assert_not_called()
    async def test_failed_update_does_not_cache_rating(self):
        text='\n\n'.join('['+n+']\nA sample.' for n in prompt_metadata.NAMES)
        request=AsyncMock();request.path='/api/enhance-prompt';request.json.return_value={'task':'update','prompt':text}
        with patch.dict(server.FORMATTED_RATINGS,{},clear=True),patch.object(server.deepseek_client,'complete',AsyncMock(return_value=text)),patch.object(server.content_rating,'classify',AsyncMock(side_effect=ValueError('failed'))):
            with self.assertRaises(ValueError):await server.prompt_assistant(request)
            self.assertFalse(server.FORMATTED_RATINGS)

if __name__=='__main__':unittest.main()
