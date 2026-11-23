import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock,patch
import server


class PromptSourceTests(unittest.IsolatedAsyncioTestCase):
    async def save_rows(self,rows):
        request=AsyncMock();request.method='POST';request.json.return_value=rows
        with tempfile.TemporaryDirectory() as folder,patch.object(server,'DATA',Path(folder)):
            await server.prompt_library(request)
            request.method='GET'
            return json.loads((await server.prompt_library(request)).body)

    async def test_roundtrip(self):
        url='https://www.bilibili.com/video/BV1jmaU67EXx/?a=1&b=2'
        rows=await self.save_rows([{'title':'test','prompt':'test','source_url':' '+url+' '}])
        self.assertEqual(rows[0]['source_url'],url)

    async def test_old_and_cleared_sources(self):
        for source in ({},{'source_url':''}):
            rows=await self.save_rows([{'title':'test','prompt':'test',**source}])
            self.assertEqual(rows[0]['source_url'],'')

    async def test_invalid_sources(self):
        for url in ('javascript:alert(1)','file:///C:/secret','https://','https://a b.com','https://user:pass@example.com',[], 'https://example.com/'+ 'a'*2048):
            with self.subTest(url=str(url)[:30]),self.assertRaises(ValueError):
                await self.save_rows([{'title':'test','prompt':'test','source_url':url}])

if __name__=='__main__':unittest.main()
