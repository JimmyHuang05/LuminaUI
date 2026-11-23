import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
import json
import server

class RedrawTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_stage_reference_graph(self):
        captured={}
        async def fake_backend(app,path,data=None):
            captured.update(data['prompt']);return {'prompt_id':'redraw-test'}
        source=Path(__file__).resolve().parents[1]/'ComfyUI/output/文生图/Krea2_Cutie_v6_20261003144211.png'
        body={'preset':'02_character_consistency','i2i_workflow':'moody_zit_i2i','generation_model':'pro_mix','image':'fixture.png','prompt':'A white ceramic cup on a wooden table','seed':123,'image_resolution':'low','ratio':'3:4'}
        with patch.object(server,'backend',fake_backend),patch.object(server,'input_path',return_value=source),patch.object(server,'save'),patch.object(server,'JOBS',[]):
            response=await server.generate_krea(SimpleNamespace(app={}),body)
        job=json.loads(response.body)
        self.assertEqual(job['preset'],'02_character_consistency')
        self.assertEqual(job['generation_workflow'],'moody_zit_i2i')
        self.assertEqual(captured['5']['class_type'],'VAEEncode')
        self.assertEqual(captured['7']['inputs']['start_at_step'],5)
        self.assertEqual(captured['7']['inputs']['end_at_step'],8)
        self.assertEqual(captured['12']['inputs']['steps'],10)
        self.assertEqual(captured['12']['inputs']['start_at_step'],5)
        self.assertEqual(captured['12']['inputs']['scheduler'],'sgm_uniform')
        self.assertEqual(captured['14']['inputs']['width'],576)
        self.assertEqual(captured['14']['inputs']['height'],768)
        self.assertEqual((job['width'],job['height']),(976,1304))
        self.assertFalse(any('Lora' in node['class_type'] for node in captured.values()))

if __name__=='__main__':unittest.main()
