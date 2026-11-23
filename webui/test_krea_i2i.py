import unittest
from unittest.mock import patch, AsyncMock
from tempfile import TemporaryDirectory
from pathlib import Path
from PIL import Image
import krea_i2i

class KreaI2ITest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp=TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.photo=Path(self.temp.name)/'image.png';Image.new('RGB',(900,600),'white').save(self.photo)
        p=patch.object(krea_i2i,'input_path',return_value=self.photo);p.start();self.addCleanup(p.stop)
        self.body=dict(preset='01_text_to_image',generation_model='cutie',generation_references=[{'image':'source.png'}],prompt='',redraw_creativity=49)

    async def test_caption_and_blank_prompt(self):
        with patch.object(krea_i2i.image_reader,'recognize',new=AsyncMock(return_value=('A cafe scene','Qwen3.5-4B'))):
            await krea_i2i.prepare(self.body)
        self.assertEqual(self.body['redraw_user_prompt'],'')
        self.assertIn('A cafe scene',self.body['prompt'])

    async def test_missing_image_and_invalid_strength(self):
        for fields in [dict(generation_references=[]),dict(redraw_creativity=float('nan')),dict(redraw_creativity=0),dict(generation_model='pro_mix')]:
            with self.assertRaises(ValueError):krea_i2i.validate({**self.body,**fields})

    async def test_source_latent_and_card_roles(self):
        for card in [False,True]:
            body={**self.body}
            if card:body['character_card_id']='sample'
            graph={'7':{'inputs':{}}}
            with patch.object(krea_i2i,'save_input',return_value='prepared.png'):
                w,h,reference=krea_i2i.attach(graph,body,768)
            self.assertEqual((w,h),(768,512))
            self.assertEqual(graph['5']['class_type'],'VAEEncode')
            self.assertEqual(graph['7']['inputs'],dict(steps=7,denoise=.49))
            self.assertEqual(len(reference['generation_references']),1 if card else 0)
            self.assertEqual(body['generation_references'][0]['image'],'source.png')

if __name__=='__main__':unittest.main()
