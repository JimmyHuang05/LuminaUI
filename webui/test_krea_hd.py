import json
import unittest
from pathlib import Path
import krea_hd

class KreaHDTest(unittest.TestCase):
    def graph(self):
        return json.loads((krea_hd.ROOT/'workflows/krea2_mix_v8_api.json').read_text(encoding='utf-8'))

    def test_simple_seedvr_replaces_hat(self):
        g=self.graph()
        krea_hd.seedvr(g,['8',0],2304,3072,2**40)
        self.assertEqual(g['9']['inputs']['images'],['hd_output',0])
        self.assertEqual(g['hd_seedvr']['inputs']['resolution'],2304)
        self.assertLess(g['hd_seedvr']['inputs']['seed'],2**32)
        self.assertFalse(any(n['class_type']=='UpscaleModelLoader' for n in g.values()))

    def test_4k_stages_and_portrait_landscape(self):
        for size,expected in [((576,768),(3072,4096)),((768,576),(4096,3072)),((768,768),(4096,4096))]:
            g=self.graph()
            self.assertEqual(krea_hd.build(g,*size,42),expected)
            self.assertEqual(g['hd_seedvr']['inputs']['image'],['hd_face',0])
            self.assertEqual(g['hd_face']['inputs']['image'],['hd_color',0])
            self.assertEqual(g['hd_tiles']['inputs']['denoise'],0.15)

    def test_card_reference_survives_local_stages(self):
        g=self.graph()
        g['character_patch']={'class_type':'Krea2EditModelPatch','inputs':dict(model=['character_lora',0],source_latent=['character_encode',0],source_latent_b=['reference_b_encode',0],vae=['3',0],source_image=['character_image',0],target_latent=['5',0])}
        original=dict(g['character_patch']['inputs'])
        krea_hd.build(g,576,768,42)
        self.assertEqual(g['character_patch']['inputs'],original)
        for key in ['hd_tiles','hd_face']:
            self.assertEqual(g[key]['inputs']['model'],['hd_character_patch',0])
        self.assertEqual(g['hd_character_patch']['inputs']['source_latent_b'],['reference_b_encode',0])

    def test_bicubic_is_clamped_before_uint8_conversion(self):
        import numpy as np
        g=self.graph()
        krea_hd.build(g,576,768,42)
        self.assertEqual(g['hd_tiles']['inputs']['upscaled_image'],['hd_clamp',0])
        self.assertEqual(g['hd_clamp']['inputs'],dict(image=['hd_resize',0],min=0.0,max=1.0,clamp=True))
        # Bicubic can produce negative values near dark edges. Direct uint8
        # conversion wraps them to bright pixels; clamp must precede conversion.
        values=np.array([-0.05,0.0,0.5,1.01],dtype=np.float32)
        self.assertGreater((255*values).astype(np.uint8)[0],200)
        self.assertEqual((255*values.clip(0,1)).astype(np.uint8).tolist(),[0,0,127,255])

if __name__=='__main__':unittest.main()
