import json
import unittest
from unittest.mock import patch, AsyncMock
from types import SimpleNamespace
import workflow_controls
import server


class WorkflowControlsTest(unittest.IsolatedAsyncioTestCase):
    async def generate(self, **options):
        body=dict(preset='01_text_to_image',generation_model='cutie',prompt='A ceramic cup on a wooden table',seed=42,image_resolution='low',ratio='3:4')
        body.update(options)
        backend=AsyncMock(return_value={'prompt_id':'test-workflow-controls'})
        with patch.object(server,'backend',backend),patch.object(server,'JOBS',[]),patch.object(server,'save'),patch.object(server,'record_generation_usage'):
            response=await server.generate_krea(SimpleNamespace(app={}),body)
        return backend.call_args.args[2]['prompt'],json.loads(response.text)

    async def test_hd_face_bypass_and_recorded_dimensions(self):
        g,job=await self.generate(generation_workflow='moody_krea2_4khd',workflow_settings=dict(face_enabled=False,output_long_edge=2048,tile_steps=5,tile_strength=.25))
        self.assertNotIn('hd_face',g)
        self.assertNotIn('hd_detector',g)
        self.assertEqual(g['hd_seedvr']['inputs']['image'],['hd_color',0])
        self.assertEqual(g['hd_tiles']['inputs']['steps'],5)
        self.assertEqual(g['hd_tiles']['inputs']['denoise'],.25)
        self.assertEqual((job['width'],job['height']),(1536,2048))
        self.assertEqual(job['workflow_settings']['face_enabled'],False)

    async def test_simple_refine_and_upscale_are_effective(self):
        g,job=await self.generate(generation_workflow='moody_krea2_simple',krea_simple_mode='upscale',refine_scale=1.25,refine_strength=.3,workflow_settings=dict(refine_steps=6,upscale_factor=2))
        self.assertEqual(g['11']['inputs']['steps'],6)
        self.assertEqual(g['10']['inputs']['scale_by'],1.25)
        self.assertEqual((job['width'],job['height']),(1152,1536))
        self.assertEqual(g['hd_output']['inputs']['height'],1536)

    async def test_zit_scale_matches_output_metadata(self):
        g,job=await self.generate(generation_model='pro_mix',workflow_settings={'zit_scale':1.5})
        self.assertEqual(g['11']['inputs']['scale_by'],1.5)
        self.assertEqual((job['width'],job['height']),(864,1152))

    def test_settings_cannot_leak_between_workflows(self):
        for settings in [{'face_enabled':True},{'refine_steps':float('nan')},{'refine_steps':True},{'refine_steps':2.5},{'upscale_factor':8}]:
            with self.assertRaises(ValueError):workflow_controls.resolve({'workflow_settings':settings})
        self.assertEqual(workflow_controls.resolve({'generation_model':'qwen'}),{})

if __name__=='__main__':unittest.main()
