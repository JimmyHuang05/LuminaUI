import unittest
import camera_presets as c
class CameraTests(unittest.TestCase):
    def test_disabled_unchanged(self):
        b={'preset':'01_text_to_image','prompt':'original','camera_preset':{'enabled':False}}
        c.apply(b);self.assertEqual(b['prompt'],'original')
    def test_all_modes_and_library_untouched(self):
        for item in c.CATALOG['items']:
            b={'preset':'01_text_to_image','prompt':'original','base_prompt':'original','camera_preset':{'enabled':True,'id':item['id']}}
            c.apply(b);self.assertIn(item['prompt'],b['prompt']);self.assertEqual(b['base_prompt'],'original');self.assertEqual(b['camera_original_prompt'],'original')
    def test_unsupported_mode(self):
        b={'preset':'03_image_edit','prompt':'original','camera_preset':{'enabled':True,'id':'phone'}}
        c.apply(b);self.assertEqual(b['prompt'],'original')
    def test_invalid_and_empty(self):
        for prompt,identifier in [('', 'phone'),('a','missing')]:
            with self.assertRaises(ValueError):c.apply({'preset':'01_text_to_image','prompt':prompt,'camera_preset':{'enabled':True,'id':identifier}})
    def test_noticed_and_limit(self):
        b={'preset':'01_text_to_image','prompt':'a','camera_preset':{'enabled':True,'id':'phone','noticed':True,'strength':'strong'}}
        c.apply(b);self.assertIn('questioning side glance',b['prompt'])
        b['prompt']='a'*10000
        with self.assertRaises(ValueError):c.apply(b)
