import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
from aiohttp import web
from safetensors.numpy import save_file
import lora_manager as legacy
import lora_v2 as lv


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.registry = self.base/'library.json'
        self.mid = 'loras/watercolor.safetensors'
        self.path = self.base/'watercolor.safetensors'
        self.files = []
        self.write_lora(self.path)
        self.patches = [patch.object(legacy,'BASE',self.base),patch.object(lv,'REGISTRY',self.registry),
                        patch.object(legacy,'model_inventory',lambda:{'groups':[{'name':'loras','files':self.files}]})]
        for p in self.patches: p.start()
        self.add_file(self.mid)

    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()

    def write_lora(self, path, declared='z_image_turbo', clip=False, value=0):
        tensors = {'diffusion_model.layers.0.attention.to_q.lora_A.weight':np.full((2,2),value,dtype=np.float32),
                   'diffusion_model.layers.0.attention.to_q.lora_B.weight':np.zeros((2,2),dtype=np.float32)}
        if clip: tensors['text_encoder.layers.0.lora_A.weight'] = np.zeros((2,2),dtype=np.float32)
        save_file(tensors,str(path),metadata={'modelspec.architecture':declared})

    def add_file(self, mid):
        self.files.append({'id':mid,'label':mid[6:],'name':mid[6:],'installed':True})

    def profile(self, **kw):
        raw = {'label':'Watercolor','category':'style','base_family':'zimage_turbo',
               'pro_mix_compatible':True,'evidence':'Local test fixture, not a real verified LoRA',
               'patch_target':'model_only','trigger':'watercolor style',**kw}
        return lv.save_profile({'id':self.mid,'revision':lv.read_registry()['revision'],'profile':raw})['profile']

    def row(self, **kw):
        p = lv.read_registry()['profiles'][self.mid]
        return {'id':self.mid,'enabled':True,'strength':0.8,'clip_strength':None,'use_trigger':True,
                'sha256':p['sha256'],'profile_revision':p['revision'],**kw}

    def body(self, rows=None, **kw):
        return {'preset':'01_text_to_image','generation_model':'pro_mix','generation_workflow':lv.RECIPE,
                'prompt':'A white ceramic cup on a wooden table','lora_v2':{'schema':2,'recipe':lv.RECIPE,
                'items':[self.row()] if rows is None else rows},**kw}

    def graph(self):
        return json.loads((Path(__file__).resolve().parents[1]/'workflows/zimage_pro_mix_api.json').read_text())

    def test_unregistered_requires_manual_compatibility(self):
        item = lv.catalog()['items'][0]
        self.assertIn('待配置',item['reason'])
        self.assertEqual(item['inspection']['family'],'zimage')
        self.assertFalse(self.registry.exists())
        with self.assertRaisesRegex(ValueError,'兼容依据'): self.profile(evidence='')
        self.profile()
        item = lv.catalog()['items'][0]
        self.assertFalse(item['reason'])
        self.assertFalse(item['profile']['verification']['runtime'])
        self.assertFalse(item['profile']['verification']['visual'])

    def test_new_local_file_without_catalog_label_is_discoverable(self):
        self.files[0].pop('label')
        item = lv.catalog()['items'][0]
        self.assertEqual(item['label'],'watercolor')
        self.assertIn('待配置',item['reason'])

    def test_categories_are_not_architecture_or_validation(self):
        self.profile(category='character')
        self.assertEqual('',lv.catalog()['items'][0]['reason'])
        self.profile(base_family='zimage_base',pro_mix_compatible=False)
        self.assertIn('Turbo',lv.catalog()['items'][0]['reason'])
        self.write_lora(self.path,'qwen_image')
        with self.assertRaisesRegex(ValueError,'架构冲突'): self.profile()
        self.write_lora(self.path,'z_image_base')
        with self.assertRaisesRegex(ValueError,'架构冲突'): self.profile()

    def test_internal_and_path_traversal_are_rejected(self):
        for mid in ('../outside','loras/../outside.safetensors','C:/outside.safetensors'):
            with self.assertRaises(ValueError): lv.save_profile({'id':mid})
        internal = self.base/next(iter(legacy.INTERNAL))
        self.write_lora(internal)
        with self.assertRaisesRegex(ValueError,'专用编辑'): lv.save_profile({'id':'loras/'+internal.name})

    def test_revision_and_backup_preserve_previous(self):
        first = self.profile()
        original = self.registry.read_bytes()
        with self.assertRaises(web.HTTPConflict):
            lv.save_profile({'id':self.mid,'revision':0,'profile':{}})
        self.profile(trigger='changed')
        self.assertEqual(self.registry.with_suffix('.json.bak').read_bytes(),original)
        self.assertEqual(lv.read_registry()['profiles'][self.mid]['revision'],first['revision']+1)

    def test_revision_change_and_hash_change_reject_stale_selection(self):
        self.profile(); body = self.body()
        self.profile(trigger='changed')
        with self.assertRaisesRegex(ValueError,'已变更'): lv.validate(body)
        body = self.body()
        self.write_lora(self.path,value=1)
        with self.assertRaisesRegex(ValueError,'已变更'): lv.validate(body)

    def test_snapshot_and_warning_ack_are_immutable(self):
        self.profile(); body = self.body()
        result = lv.validate(body)
        self.assertTrue(result['warnings'])
        with self.assertRaisesRegex(ValueError,'先确认'): lv.prepare(body)
        body['lora_v2']['acknowledgement'] = result['acknowledgement']
        prepared = lv.prepare(body)
        self.assertEqual(prepared['final_prompt'],body['prompt']+'\nwatercolor style')
        self.assertNotIn('watercolor',body['prompt'])
        self.profile(trigger='ink painting')
        self.assertEqual(prepared['snapshots'][0]['profile']['trigger'],'watercolor style')

    def test_disabled_zero_preserve_graph_and_prompt_without_loading_catalog(self):
        self.profile()
        for override in ({'enabled':False},{'strength':0}):
            body = self.body([self.row(**override)],generation_model='qwen')
            with patch.object(lv,'catalog',side_effect=AssertionError('must not load catalog')):
                result = lv.prepare(body)
            self.assertEqual(result['final_prompt'],body['prompt'])
            self.assertFalse(result['snapshots']);self.assertFalse(result['warnings'])
            graph = self.graph(); before = copy.deepcopy(graph)
            lv.apply(graph,result);self.assertEqual(graph,before)

    def test_trigger_off_and_literal_user_trigger_remain_unchanged(self):
        self.profile()
        body = self.body([self.row(use_trigger=False)])
        self.assertEqual(lv.validate(body)['final_prompt'],body['prompt'])
        body['prompt'] += ', watercolor style'
        body['lora_v2']['items'][0]['use_trigger'] = True
        self.assertEqual(lv.validate(body)['final_prompt'],body['prompt'])

    def test_unsupported_mode_model_workflow_never_silently_ignore_active(self):
        self.profile()
        for changed in ({'preset':'02_character_consistency'},{'generation_model':'wild'},
                        {'generation_model':'cutie'},{'generation_workflow':'moody_zit_i2i'}):
            with self.assertRaisesRegex(ValueError,'仅支持'): lv.validate(self.body(**changed))

    def test_invalid_values_duplicates_and_limits(self):
        self.profile()
        for changed in ({'strength':float('nan')},{'strength':True},{'enabled':'false'},
                        {'strength':3},{'clip_strength':1}):
            with self.assertRaises(ValueError): lv.validate(self.body([self.row(**changed)]))
        with self.assertRaisesRegex(ValueError,'重复'): lv.validate(self.body([self.row(),self.row()]))
        with self.assertRaisesRegex(ValueError,'一个风格'): lv.validate(self.body([self.row(),self.row(id='loras/second.safetensors')]))

    def test_explicit_model_only_ports_and_stages(self):
        self.profile(); result = lv.validate(self.body()); graph = self.graph()
        graph['unrelated'] = {'class_type':'UNETConsumer','inputs':{'model':['1',0]}}
        original = copy.deepcopy(graph); lv.apply(graph,result)
        self.assertEqual(graph['6']['inputs']['model'],['generation_v2_lora',0])
        self.assertEqual(graph['7'],original['7']);self.assertEqual(graph['12'],original['12'])
        self.assertEqual(graph['4'],original['4']);self.assertEqual(graph['unrelated'],original['unrelated'])
        self.assertEqual(graph['generation_v2_lora']['class_type'],'WebUIGenerationLoraLoaderModelOnly')
        self.assertNotIn('clip',graph['generation_v2_lora']['inputs'])

    def test_clip_ports_and_wrong_topology(self):
        self.write_lora(self.path,clip=True); self.profile(patch_target='model_clip')
        body = self.body([self.row(clip_strength=0.4)]); result = lv.validate(body)
        graph = self.graph(); lv.apply(graph,result)
        self.assertEqual(graph['4']['inputs']['clip'],['generation_v2_lora',1])
        self.assertEqual(graph['generation_v2_lora']['inputs']['strength_clip'],0.4)
        for changed in (('6','model',['wrong',0]),('1','unet_name','wrong.safetensors'),('12','model',['1',0])):
            graph = self.graph(); graph[changed[0]]['inputs'][changed[1]] = changed[2]
            before = copy.deepcopy(graph)
            with self.assertRaises(ValueError): lv.apply(graph,result)
            self.assertEqual(graph,before)


class ServerTests(unittest.IsolatedAsyncioTestCase):
    async def test_submission_and_history_use_new_adapter(self):
        import server
        fixture = LibraryTests();fixture.setUp()
        try:
            fixture.profile(); body = fixture.body(); body['seed'] = 234
            result = lv.validate(body); body['lora_v2']['acknowledgement'] = result['acknowledgement']
            captured = {}
            async def backend(app,path,data=None):
                if path.startswith('/object_info/'): return {path.rsplit('/',1)[1]:{}}
                captured.update(data['prompt']); return {'prompt_id':'test-lora-v2'}
            async def request_json(): return body
            with patch.object(server,'backend',backend),patch.object(server,'save'),patch.object(server,'JOBS',[]):
                response = await server.generate(SimpleNamespace(app={},json=request_json))
            job = json.loads(response.body)
            self.assertEqual(job['prompt'],body['prompt'])
            self.assertEqual(captured['4']['inputs']['text'],job['final_prompt'])
            self.assertEqual(job['lora_v2']['items'][0]['sha256'],fixture.row()['sha256'])
            self.assertEqual(job['lora_v2_snapshot']['graph_sha256'],lv.digest(captured))
            self.assertEqual(job['loras'][0]['stages'],['base','refine'])
            self.assertEqual(captured['6']['inputs']['model'],['generation_v2_lora',0])
        finally: fixture.tearDown()


if __name__=='__main__': unittest.main()
