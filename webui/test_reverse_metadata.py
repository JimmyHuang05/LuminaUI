import json,tempfile,unittest
from pathlib import Path
from unittest.mock import AsyncMock,patch
import server,prompt_metadata
class ReverseBundleTests(unittest.IsolatedAsyncioTestCase):
 async def test_assistant_delegates_current_task_without_legacy_reverse_route(self):
  import simple_pe
  body={'task':'modify','prompt':'Original prompt','instruction':'Change the light','current_rating':{'level':'sfw'}}
  request=AsyncMock();request.json.return_value=body
  result={'prompt':'Updated prompt','content_rating':{'level':'sfw'}}
  with patch.object(simple_pe,'run',AsyncMock(return_value=result)) as run:
   response=json.loads((await server.prompt_assistant(request)).body)
   self.assertEqual(response,result)
   run.assert_awaited_once_with('modify','Original prompt','Change the light',{'level':'sfw'})
  with patch.object(simple_pe,'run',AsyncMock(side_effect=ValueError('Model unavailable'))):
   with self.assertRaisesRegex(ValueError,'Model unavailable'):await server.prompt_assistant(request)
  self.assertEqual(body['prompt'],'Original prompt')
 async def test_undo_can_restore_no_rating(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(server,'DATA',Path(folder)),patch.object(server.prompt_identity,'link_jobs',return_value=False):
   request=AsyncMock();request.method='POST';request.json.return_value=[{'title':'test','prompt':'sample','content_rating':{'source':'manual','level':'r15'}}]
   rows=json.loads((await server.prompt_library(request)).body)['rows'];rows[0]['content_rating']=None;request.json.return_value=rows
   saved=json.loads((await server.prompt_library(request)).body)['rows'];self.assertNotIn('content_rating',saved[0])
if __name__=='__main__':unittest.main()
