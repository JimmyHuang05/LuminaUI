import unittest,tempfile
from pathlib import Path
from PIL import Image,ImageDraw
from regions import save_input,local_crop,outpaint_reference,input_path,composite,composite_outpaint,local_blend_pixels

class RegionTests(unittest.TestCase):
    def test_local_blend_uses_selection_size_not_image_size(self):
        for size in ((512,512),(4096,4096)):
            with self.subTest(image_size=size):
                mask=Image.new('L',size)
                ImageDraw.Draw(mask).rectangle((128,128,255,255),fill=255)
                self.assertEqual(local_blend_pixels(mask,512),32)
                self.assertEqual(local_blend_pixels(mask,1024),32)

    def test_local_blend_compensates_for_large_selection_downsampling(self):
        mask=Image.new('L',(4096,4096))
        ImageDraw.Draw(mask).rectangle((256,256,3839,3839),fill=255)
        for resolution,expected in ((512,4),(768,6),(1024,7)):
            with self.subTest(resolution=resolution):
                self.assertEqual(local_blend_pixels(mask,resolution),expected)
        self.assertEqual(local_blend_pixels(Image.new('L',(65536,1),255),512),1)
        self.assertEqual(local_blend_pixels(Image.new('L',(64,64)),1024),32)

    def test_outpaint_composite_never_blends_placeholder_gray(self):
        import numpy as np
        for size in ((80,160),(160,80)):
            with self.subTest(source_size=size),tempfile.TemporaryDirectory() as folder:
                folder=Path(folder)
                source=Image.new('RGB',size,(13,39,73))
                ImageDraw.Draw(source).rectangle((5,7,47,61),fill=(201,81,19))
                name=save_input(source,'test_source')
                canvas,mask_name,info=outpaint_reference(name,'1:1')
                # Deliberately different raw geometry exercises the final resize.
                raw=Image.new('RGB',(63,97),(236,180,22))
                ImageDraw.Draw(raw).rectangle((8,9,49,77),fill=(7,103,229))
                raw.save(folder/'raw.png')
                composite_outpaint(canvas,folder/'raw.png',mask_name,folder/'result.png')
                with Image.open(input_path(canvas)) as base,Image.open(input_path(mask_name)) as mask,Image.open(folder/'result.png') as result:
                    self.assertEqual(result.size,base.size)
                    selected=np.asarray(mask)>0
                    pixels=np.asarray(result)
                    self.assertTrue(np.array_equal(pixels[~selected],np.asarray(base)[~selected]))
                    expected=np.asarray(raw.resize(base.size,Image.Resampling.LANCZOS))
                    self.assertTrue(np.array_equal(pixels[selected],expected[selected]))
                    x,y,w,h=info
                    self.assertEqual(result.crop((x,y,x+w,y+h)).tobytes(),source.tobytes())

    def test_outpaint_uses_author_gray_fill(self):
        name=save_input(Image.new('RGB',(64,128),(10,20,30)),'test_source')
        canvas,mask,info=outpaint_reference(name,'1:1')
        with Image.open(input_path(canvas)) as image:
            self.assertEqual(image.getpixel((0,0)),(128,128,128))
            self.assertEqual(image.getpixel((info[0],info[1])),(10,20,30))
    def test_smooth_full_selection_and_zero_feather(self):
        source=Image.new('RGB',(128,128),'black')
        name=save_input(source,'test_source')
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder);Image.new('RGB',source.size,'white').save(folder/'patch.png')
            for feather in (0,8):
                mask_name=save_input(Image.new('L',source.size,255),'edit_mask')
                composite(name,folder/'patch.png',mask_name,feather,folder/'result.png',smooth_edges=True)
                with Image.open(folder/'result.png') as result:self.assertEqual(result.getextrema(),((255,255),)*3)

    def test_smooth_blend_irregular_mask_and_hole(self):
        import numpy as np
        source=Image.new('RGB',(128,128),'black');mask=Image.new('L',source.size)
        draw=ImageDraw.Draw(mask);draw.polygon([(8,20),(100,12),(118,88),(50,115),(8,70)],fill=255)
        draw.ellipse((40,40,65,65),fill=0)
        name=save_input(source,'test_source');mask_name=save_input(mask,'edit_mask')
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder);Image.new('RGB',source.size,'white').save(folder/'patch.png')
            composite(name,folder/'patch.png',mask_name,8,folder/'result.png',smooth_edges=True)
            with Image.open(folder/'result.png') as result:
                pixels=np.asarray(result)
                self.assertFalse(pixels[np.asarray(mask)==0].any())
                self.assertEqual(result.getpixel((80,60)),(255,255,255))
                self.assertGreater(result.getpixel((8,40))[0],0)
                self.assertLess(result.getpixel((8,40))[0],80)

    def test_crop_restore_preserves_outside_and_alpha(self):
        source=Image.new('RGBA',(600,800),(12,34,56,200));mask=Image.new('L',source.size);ImageDraw.Draw(mask).rectangle((250,330,350,430),fill=255)
        name=save_input(source,'test_source');mask_name=save_input(mask,'edit_mask');crop,cropmask,box=local_crop(name,mask_name)
        with Image.open(input_path(crop)) as crop_image:patch=Image.new('RGBA',crop_image.size,(200,100,50,80))
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent/'data') as folder:
            folder=Path(folder);patch.save(folder/'patch.png');composite(name,folder/'patch.png',mask_name,8,folder/'result.png',box)
            result=Image.open(folder/'result.png');self.assertEqual(result.size,source.size);self.assertEqual(result.mode,'RGBA');self.assertEqual(result.getpixel((249,350)),source.getpixel((249,350)));self.assertEqual(result.getpixel((0,0)),source.getpixel((0,0)));self.assertNotEqual(result.getpixel((300,380)),source.getpixel((300,380)))
    def test_outpaint_preserves_center_and_marks_only_extension(self):
        source=Image.new('RGB',(576,768),(12,34,56));name=save_input(source,'test_source');canvas,mask,info=outpaint_reference(name,'16:9');im=Image.open(input_path(canvas));m=Image.open(input_path(mask));x,y,w,h=info
        self.assertEqual(im.crop((x,y,x+w,y+h)).tobytes(),source.tobytes());self.assertEqual(m.getpixel((x+10,y+10)),0);self.assertEqual(m.getpixel((0,0)),255);self.assertAlmostEqual(im.width/im.height,16/9,places=2)

    def test_face_feather_softens_inside_edge_only(self):
        source=Image.new('RGB',(128,128),'black');mask=Image.new('L',source.size)
        ImageDraw.Draw(mask).rectangle((24,24,103,103),fill=255)
        name=save_input(source,'test_source');mask_name=save_input(mask,'edit_mask')
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder);Image.new('RGB',source.size,'white').save(folder/'patch.png')
            composite(name,folder/'patch.png',mask_name,8,folder/'face.png',inset_feather=True)
            with Image.open(folder/'face.png') as result:
                self.assertEqual(result.getpixel((23,64)),(0,0,0))
                self.assertLess(result.getpixel((24,64))[0],30)
                self.assertEqual(result.getpixel((64,64)),(255,255,255))

    def test_feather_does_not_erode_selection(self):
        source=Image.new('RGB',(128,128),'black');mask=Image.new('L',source.size)
        ImageDraw.Draw(mask).rectangle((24,24,103,103),fill=255)
        name=save_input(source,'test_source');mask_name=save_input(mask,'edit_mask')
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder);Image.new('RGB',source.size,'white').save(folder/'patch.png')
            composite(name,folder/'patch.png',mask_name,8,folder/'result.png')
            with Image.open(folder/'result.png') as result:
                self.assertEqual(result.getpixel((23,64)),(0,0,0))
                self.assertGreater(result.getpixel((28,64))[0],200)
                self.assertEqual(result.getpixel((64,64)),(255,255,255))
            composite(name,folder/'patch.png',mask_name,0,folder/'hard.png')
            with Image.open(folder/'hard.png') as result:
                self.assertEqual(result.getpixel((24,64)),(255,255,255))
                self.assertEqual(result.getpixel((23,64)),(0,0,0))

if __name__=='__main__':unittest.main()
