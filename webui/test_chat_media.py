import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from aiohttp import FormData, web
from aiohttp.test_utils import TestClient, TestServer
from PIL import Image
import chat_media
import pe_chat


class MediaTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = patch.object(chat_media, 'FOLDER', Path(self.tmp.name))
        self.folder.start()
        app = web.Application()
        app.router.add_post('/images', chat_media.upload)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.folder.stop()
        self.tmp.cleanup()

    async def test_upload_and_followup_image_routing(self):
        raw = io.BytesIO()
        Image.new('RGB', (24, 32), 'blue').save(raw, format='PNG')
        form = FormData()
        form.add_field('image', raw.getvalue(), filename='../../sample.png', content_type='image/png')
        response = await self.client.post('/images', data=form)
        self.assertEqual(response.status, 200)
        identity = (await response.json())['id']
        image = chat_media.image_path(identity)
        with Image.open(image) as decoded:
            self.assertEqual(decoded.format, 'JPEG')
        result = json.dumps({'reply': '完成', 'draft': None})
        with patch.object(pe_chat.deepseek_client, 'complete', AsyncMock(return_value=result)) as model:
            await pe_chat.answer('继续调整', [{'role': 'user', 'content': '参考图', 'image_id': identity}], [])
            self.assertEqual(model.await_count, 1)
            self.assertEqual(model.call_args.kwargs['image'], image)
        with patch.object(pe_chat.local_vlm, 'complete', AsyncMock(return_value={'choices': [{'message': {'content': result}}]})) as model:
            await pe_chat.answer('反推', [], [], provider='qwen', image_id=identity, mode='image')
            payload = model.call_args.args[0]
            self.assertTrue(payload['messages'][-1]['content'][1]['image_url']['url'].startswith('data:image/'))
            self.assertIn('图片反推', payload['messages'][0]['content'])

    def test_reject_unsafe_or_missing_identity(self):
        for identity in ['../settings', 'A' * 32, None, 'a' * 32]:
            with self.assertRaises(ValueError):
                chat_media.image_path(identity)

    def test_reject_non_image_upload(self):
        with self.assertRaises(ValueError):
            chat_media.image_reader.prepare(b'not an image', Path(self.tmp.name) / 'invalid.jpg')
