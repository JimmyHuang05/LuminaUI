import tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import krea_edit, regions
from server import sampling_settings

class KreaEditTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.folder=Path(self.temp.name)
        Image.new('RGB',(640,480),'white').save(self.folder/'source.png')
        Image.new('RGB',(320,640),'red').save(self.folder/'second.png')
        mask=Image.new('L',(640,480));mask.paste(255,(160,120,320,240));mask.save(self.folder/'mask.png')
        self.patches=[patch.object(krea_edit,'input_path',lambda n:self.folder/Path(n).name),
                      patch.object(regions,'INPUT',self.folder)]
        for p in self.patches:p.start()
        self.body=dict(image='webui/source.png',edit_model='krea_cutie',edit_task='general',prompt='Make it red',seed=42)
    def tearDown(self):
        for p in self.patches:p.stop()
        self.temp.cleanup()
    def build(self,**kwargs):return krea_edit.build(dict(self.body,**kwargs),sampling_settings)
    def test_qwen_and_obsolete_modes_disabled(self):
        for args in [dict(edit_model='qwen'),dict(edit_model='ray'),dict(edit_task='face'),dict(anti_shift=True)]:
            with self.assertRaises(ValueError):self.build(**args)
    def test_dual_order_and_geometry(self):
        g,m=self.build(edit_task='dual',references=[{'image':'webui/second.png'}])
        self.assertEqual(g['4']['inputs']['image'],['10',0])
        self.assertEqual(g['4']['inputs']['image_b'],['20',0])
        self.assertEqual(g['12']['inputs']['source_image_b'],['20',0])
        self.assertAlmostEqual(m['width']/m['height'],4/3,delta=.02)
        with self.assertRaises(ValueError):self.build(edit_task='dual')
        with self.assertRaises(ValueError):self.build(references=[{'image':'webui/second.png'}])
    def test_local_blue_and_original_mask(self):
        g,m=self.build(edit_task='local',mask='webui/mask.png')
        with Image.open(self.folder/Path(g['10']['inputs']['image']).name) as im:
            self.assertEqual(im.getpixel((int(im.width*.3),int(im.height*.3))),(0,0,255))
            self.assertEqual(im.getpixel((0,0)),(255,255,255))
        self.assertEqual(m['composite_source'],'webui/source.png')
        self.assertEqual(m['composite_mask'],'webui/mask.png')
        self.assertTrue(m['local_edit'])
        self.assertNotIn('SetLatentNoiseMask',[n['class_type'] for n in g.values()])
    def test_outpaint_borders_and_composite(self):
        g,m=self.build(edit_task='outpaint',frame_ratio='16:9',prompt='')
        with Image.open(self.folder/Path(m['composite_source']).name) as im,Image.open(self.folder/Path(m['composite_mask']).name) as mask:
            self.assertEqual(im.getpixel((0,0)),(0,0,255))
            self.assertEqual(mask.getpixel((0,0)),255)
            self.assertEqual(mask.getpixel((im.width//2,im.height//2)),0)
        self.assertLessEqual(m['width']*m['height'],1_020_000)
        self.assertEqual(m['frame'],'outpaint')
    def test_both_models_and_sampling(self):
        for model in krea_edit.MODELS:
            g,m=self.build(edit_model=model)
            self.assertEqual(g['7']['inputs']['steps'],10)
            self.assertEqual(g['13']['inputs']['lora_name'],krea_edit.LORA)
            self.assertEqual(g['6']['inputs']['prompt'],'')

if __name__=='__main__':unittest.main()
