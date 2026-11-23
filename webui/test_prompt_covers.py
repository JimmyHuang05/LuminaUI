import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from aiohttp import FormData, web
from aiohttp.test_utils import TestClient, TestServer
from PIL import Image
import prompt_covers as covers
import server


def png(size=(320,240),mode='RGB'):
    output = io.BytesIO()
    Image.new(mode,size,(80,140,180,128) if mode=='RGBA' else (80,140,180)).save(output,format='PNG')
    return output.getvalue()


class CoverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.directory = self.root/'covers'
        self.patch = patch.object(covers,'DIRECTORY',self.directory); self.patch.start()

    def tearDown(self):
        self.patch.stop();self.temp.cleanup()

    def test_separate_thumbnail_and_proportional_preview(self):
        result = covers.save_cover(io.BytesIO(png((2400,1200))))
        original=self.directory/(result['cover_id']+'-original.png')
        self.assertEqual(original.read_bytes(),png((2400,1200)))
        with Image.open(original) as im:
            self.assertEqual(im.size,(2400,1200))
        self.assertEqual((result['width'],result['height']),(1600,800))
        with Image.open(self.directory/(result['cover_id']+'-thumb.jpg')) as im:
            self.assertEqual(im.size,(144,192));self.assertEqual(im.mode,'RGB')
        with Image.open(self.directory/(result['cover_id']+'-full.jpg')) as im:
            self.assertEqual(im.size,(1600,800));self.assertFalse(im.getexif())

    def test_alpha_and_orientation_normalized(self):
        result = covers.save_cover(io.BytesIO(png(mode='RGBA')))
        with Image.open(self.directory/(result['cover_id']+'-full.jpg')) as im:
            self.assertEqual(im.mode,'RGB')
        source = io.BytesIO(); im = Image.new('RGB',(80,40));exif = im.getexif();exif[274] = 6
        im.save(source,format='JPEG',exif=exif)
        source.seek(0); result = covers.save_cover(source)
        self.assertEqual((result['width'],result['height']),(40,80))

    def test_recommended_ratio_uses_original_orientation_and_legacy_full(self):
        result = covers.save_cover(io.BytesIO(png((900,1600))))
        self.assertEqual(covers.recommended_ratio(result['cover_id']),'9:16')
        source=io.BytesIO(); im=Image.new('RGB',(1600,900)); exif=im.getexif(); exif[274]=6
        im.save(source,format='JPEG',exif=exif)
        result=covers.save_cover(source)
        self.assertEqual(result['recommended_ratio'],'9:16')
        identity='e'*32
        Image.new('RGB',(1200,800)).save(self.directory/(identity+'-full.jpg'))
        self.assertEqual(covers.recommended_ratio(identity),'3:2')
        self.assertIsNone(covers.recommended_ratio(None))
        self.assertIsNone(covers.recommended_ratio('f'*32))

    def test_invalid_data_formats_ids_and_pixel_limit(self):
        for raw in (b'not an image',b'<svg></svg>',png()[:20]):
            with self.assertRaises(ValueError): covers.save_cover(io.BytesIO(raw))
        gif = io.BytesIO();Image.new('RGB',(8,8)).save(gif,format='GIF');gif.seek(0)
        with self.assertRaisesRegex(ValueError,'仅支持'): covers.save_cover(gif)
        with patch.object(covers,'MAX_PIXELS',100):
            with self.assertRaisesRegex(ValueError,'像素'): covers.save_cover(io.BytesIO(png()))
        for value in ('../secret','https://example.com/a.jpg','abc','A'*32,{},False):
            with self.assertRaises(ValueError): covers.validate_id(value)
        covers.validate_id(None);covers.validate_id('a'*32)

    def test_generated_source_is_copied_and_can_be_removed_independently(self):
        output = self.root/'output';output.mkdir();source = output/'cup.png';source.write_bytes(png())
        original = source.read_bytes()
        job = {'prompt_id':'fixture','status':'success','images':[{'type':'output','filename':'cup.png','subfolder':''}]}
        result = covers.copy_output({'prompt_id':'fixture','image_index':0},[job],output)
        self.assertEqual(source.read_bytes(),original)
        source.unlink()
        self.assertTrue((self.directory/(result['cover_id']+'-full.jpg')).exists())

    def test_output_selection_rejects_outside_paths_and_missing_results(self):
        output = self.root/'output';output.mkdir();(self.root/'outside.png').write_bytes(png())
        job = {'prompt_id':'fixture','status':'success','images':[{'type':'output','filename':'outside.png','subfolder':'..'}]}
        body = {'prompt_id':'fixture','image_index':0}
        with self.assertRaises(ValueError): covers.copy_output(body,[job],output)
        for changed in ({'image_index':True},{'image_index':-1},{'image_index':4},{'prompt_id':'gone'}):
            with self.assertRaises(ValueError): covers.copy_output({**body,**changed},[job],output)
        job['status'] = 'running'
        with self.assertRaises(ValueError): covers.copy_output(body,[job],output)


class CoverAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory();self.root = Path(self.temp.name)
        self.patches = [patch.object(covers,'DIRECTORY',self.root/'covers'),patch.object(server,'DATA',self.root)]
        for p in self.patches:p.start()
        app = web.Application(middlewares=[server.guard])
        app.router.add_post('/api/prompt-covers/upload',covers.upload)
        app.router.add_get('/api/prompt-covers/{cover_id}/{variant}',covers.image)
        app.router.add_get('/api/prompts',server.prompt_library)
        app.router.add_post('/api/prompts',server.prompt_library)
        self.client = TestClient(TestServer(app));await self.client.start_server()
        self.headers = {'X-App-Token':server.TOKEN}

    async def asyncTearDown(self):
        await self.client.close()
        for p in reversed(self.patches):p.stop()
        self.temp.cleanup()

    async def test_upload_save_reload_clear_and_legacy_rows(self):
        form = FormData();form.add_field('image',png(),filename='cup.png',content_type='image/png')
        response = await self.client.post('/api/prompt-covers/upload',data=form,headers=self.headers)
        self.assertEqual(response.status,200); cover = (await response.json())['cover_id']
        original = {'title':'A cup','prompt':'A blue cup on a table','tags':['静物'],'mode':'01_text_to_image'}
        for row in (original,{**original,'cover_id':cover},{**original,'cover_id':None}):
            response = await self.client.post('/api/prompts',json=[row],headers=self.headers)
            self.assertEqual(response.status,200)
            response = await self.client.get('/api/prompts'); saved = (await response.json())[0]
            for key,value in row.items(): self.assertEqual(saved[key],value)
            self.assertEqual(saved['recommended_ratio'],'4:3' if row.get('cover_id') else None)
        response = await self.client.get('/api/prompt-covers/'+cover+'/thumb')
        self.assertEqual(response.status,200);self.assertEqual(response.content_type,'image/jpeg')
        self.assertEqual(Image.open(io.BytesIO(await response.read())).size,(144,192))
        response = await self.client.get('/api/prompt-covers/'+cover+'/full')
        self.assertEqual(response.status,200)

    async def test_unauthorized_and_invalid_cover_do_not_change_library(self):
        response = await self.client.post('/api/prompt-covers/upload')
        self.assertEqual(response.status,403)
        response = await self.client.post('/api/prompts',json=[{'title':'cup','prompt':'cup','cover_id':'../bad'}],headers=self.headers)
        self.assertEqual(response.status,400);self.assertFalse((self.root/'prompt_library.json').exists())
        response = await self.client.get('/api/prompt-covers/'+'a'*32+'/full')
        self.assertEqual(response.status,404)


if __name__=='__main__': unittest.main()
