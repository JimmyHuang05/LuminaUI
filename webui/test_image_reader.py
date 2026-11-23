import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch,AsyncMock
import image_reader

class ImageReaderTests(unittest.IsolatedAsyncioTestCase):
    async def test_cloud_only(self):
        with patch.object(image_reader.deepseek_client,'complete',AsyncMock(return_value='蓝色杯子。')) as cloud,patch.object(image_reader.local_vlm,'complete',AsyncMock()) as local:
            text,_=await image_reader.recognize('image','deepseek')
            self.assertEqual(text,'蓝色杯子。');local.assert_not_awaited()
            self.assertFalse(cloud.call_args.kwargs['allow_fallback'])
            self.assertIn('中文',cloud.call_args.kwargs['system_prompt'])

    async def test_local_only_and_failure_no_fallback(self):
        with patch.object(image_reader.deepseek_client,'encode_image',return_value='image'),patch.object(image_reader.deepseek_client,'complete',AsyncMock()) as cloud,patch.object(image_reader.local_vlm,'complete',AsyncMock(return_value={'choices':[{'message':{'content':'蓝色杯子。'},'finish_reason':'stop'}]})) as local:
            self.assertEqual((await image_reader.recognize('image','qwen'))[0],'蓝色杯子。')
            local.side_effect=ValueError('failed')
            with self.assertRaises(ValueError):await image_reader.recognize('image','qwen')
            cloud.assert_not_awaited()

    async def test_unknown_provider_rejected(self):
        with self.assertRaises(ValueError):await image_reader.recognize('image','unknown')

    def test_invalid_image(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):image_reader.prepare(b'not an image',Path(folder)/'image.jpg')
