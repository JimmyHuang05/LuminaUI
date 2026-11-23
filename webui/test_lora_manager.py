import copy
import hashlib
import importlib.util
import json
import struct
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import lora_manager as lm


class LoRAManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.files = []
        for name in ('a', 'b'):
            header = {'__metadata__': {'ss_base_model_version': 'krea2'},
                      'diffusion_model.blocks.0.attn.wq.lora_A.weight': {'dtype': 'F32', 'shape': [1, 1], 'data_offsets': [0, 4]},
                      'diffusion_model.blocks.0.attn.wq.lora_B.weight': {'dtype': 'F32', 'shape': [1, 1], 'data_offsets': [4, 8]}}
            encoded = json.dumps(header).encode()
            path = self.base / (name + '.safetensors')
            path.write_bytes(struct.pack('<Q', len(encoded)) + encoded + bytes(8))
            self.files.append({'id': 'loras/' + path.name, 'name': path.name, 'installed': True, 'label': name.upper(), 'bytes': path.stat().st_size})
        self.patches = [patch.object(lm, 'BASE', self.base), patch.object(lm, 'model_inventory', lambda: {'groups': [{'name': 'loras', 'files': self.files}]})]
        for p in self.patches:p.start()
        self.a, self.b = [f['id'] for f in self.files]

    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        self.temp.cleanup()

    def selected(self, mid, **kw):
        return {'id': mid, 'enabled': True, 'strength': 1.0, 'clip_strength': None, 'use_trigger': False, **kw}

    def check(self, rows, model='cutie', mode='01_text_to_image', prompt='A cat'):
        return lm.validate(rows, mode, model, prompt)

    def profile(self, index):
        p = copy.deepcopy(lm.items()[index]['lora']);self.files[index]['lora'] = p
        return p

    def test_incompatible_and_missing_do_not_disappear(self):
        self.assertTrue(self.check([self.selected(self.a)], model='qwen')['errors'])
        self.assertTrue(self.check([self.selected('loras/missing.safetensors')])['errors'])
        self.assertTrue(self.check([self.selected(self.a)],model='qwen',mode='02_character_consistency')['errors'])

    def test_disabled_zero_and_duplicate(self):
        self.assertEqual(self.check([self.selected(self.a, enabled=False), self.selected(self.b, strength=0)])['active'], [])
        with self.assertRaises(ValueError):self.check([self.selected(self.a), self.selected(self.a)])
        with self.assertRaises(ValueError):self.check([self.selected(self.a, strength=float('nan'))])

    def test_negative_strength_requires_own_range(self):
        self.assertTrue(self.check([self.selected(self.a, strength=-1)])['errors'])
        p=self.profile(0);p.update(kind='slider',min_strength=-5,max_strength=6,recommended_min=-2,recommended_max=2)
        self.assertFalse(self.check([self.selected(self.a,strength=-1)])['errors'])
        self.assertTrue(any(w['code'].startswith('recommended:') for w in self.check([self.selected(self.a,strength=3)])['warnings']))

    def test_dependency_and_conditional_conflicts(self):
        p=self.profile(0);p['requires']=[self.b]
        self.assertTrue(any(e['code'].startswith('dependency:') for e in self.check([self.selected(self.a)])['errors']))
        p['conflicts']=[{'id':self.b,'reason':'Author documented conflict','level':'error','models':['cutie'],'modes':[],'min_strength':1.5}]
        rows=[self.selected(self.a),self.selected(self.b)]
        self.assertFalse(self.check(rows)['errors'])
        rows[0]['strength']=1.6
        self.assertTrue(self.check(rows)['errors'])
        self.assertFalse(self.check(rows,model='mix_v8')['errors'])

    def test_overlap_is_warning_not_false_incompatibility(self):
        self.profile(0)['kind']='character';self.profile(1)['kind']='character'
        result=self.check([self.selected(self.a),self.selected(self.b)])
        self.assertFalse(result['errors']);self.assertTrue(any(w['code']=='overlap:character' for w in result['warnings']))

    def test_trigger_ownership_and_required_notice(self):
        self.profile(0).update(triggers='aesthetic_token',trigger_required=True)
        row=self.selected(self.a)
        self.assertTrue(any(w['code'].startswith('trigger:') for w in self.check([row])['warnings']))
        row['use_trigger']=True
        result=self.check([row],prompt='A cat')
        self.assertEqual(result['final_prompt'],'A cat\naesthetic_token')
        self.assertEqual(self.check([row],prompt=result['final_prompt'])['final_prompt'],result['final_prompt'])

    def test_runtime_acknowledgement_and_changed_file(self):
        rows=[self.selected(self.a)];result=self.check(rows)
        body={'preset':'01_text_to_image','prompt':'A cat','loras':rows}
        with self.assertRaises(ValueError):lm.prepare(body,'cutie')
        body['lora_acknowledged']=[w['code'] for w in result['warnings']]
        actual=lm.prepare(body,'cutie');rows[0]['sha256']=actual['snapshots'][0]['sha256']
        path=lm.file_path(self.a);path.write_bytes(path.read_bytes()[:-1]+b'1')
        with self.assertRaisesRegex(ValueError,'文件已变更'):lm.prepare(body,'cutie')

    def test_chain_preserves_cache_and_clip(self):
        graph={'1':{'class_type':'UNETLoader','inputs':{}},'2':{'class_type':'CLIPLoader','inputs':{}},
               '6':{'class_type':'QwenImage21Cache','inputs':{'model':['1',0]}},
               '4':{'class_type':'Encode','inputs':{'clip':['2',0]}},
               '7':{'class_type':'KSampler','inputs':{'model':['6',0]}}}
        snapshots=[{'name':'a.safetensors','strength':1,'clip_strength':None,'sha256':'a'},{'name':'b.safetensors','strength':.5,'clip_strength':.2,'sha256':'b'}]
        lm.apply(graph,snapshots)
        self.assertEqual(graph['generation_lora_1']['inputs']['model'],['1',0])
        self.assertEqual(graph['generation_lora_2']['inputs']['model'],['generation_lora_1',0])
        self.assertEqual(graph['6']['inputs']['model'],['generation_lora_2',0])
        self.assertEqual(graph['4']['inputs']['clip'],['generation_lora_2',1])
        self.assertEqual(graph['7']['inputs']['model'],['6',0])

    def test_no_lora_graph_unchanged(self):
        graph={'7':{'inputs':{'model':['1',0]}}};before=copy.deepcopy(graph);lm.apply(graph,[]);self.assertEqual(graph,before)

    def test_profile_evidence_range_and_scope(self):
        p=copy.deepcopy(lm.items()[0]['lora']);p['verification']='verified'
        with self.assertRaises(ValueError):lm.clean_profile(p)
        p['evidence']='Author specifies Krea2';p['verified_models']=['cutie'];self.assertEqual(lm.clean_profile(p)['verification'],'verified')
        p['default_strength']=1000
        with self.assertRaises(ValueError):lm.clean_profile(p)
        with self.assertRaises(ValueError):lm.config_key('02_character_consistency','cutie')

    def test_conflict_scope_round_trip_and_invalid_shape(self):
        p=copy.deepcopy(lm.items()[0]['lora'])
        p['conflicts']=[{'id':self.b,'reason':'Documented combination issue','level':'warning',
                         'models':['cutie','mix_v8'],'modes':list(lm.MODES),'min_strength':1.5}]
        self.assertEqual(lm.clean_profile(p)['conflicts'][0]['models'],['cutie','mix_v8'])
        p['conflicts'][0]['modes']=None
        with self.assertRaises(ValueError):lm.clean_profile(p)

    def test_lokr_header_is_recognized(self):
        path=lm.file_path(self.a)
        with path.open('rb') as stream:
            size=struct.unpack('<Q',stream.read(8))[0];header=json.loads(stream.read(size));data=stream.read()
        header={key.replace('lora_A.weight','lokr_w1').replace('lora_B.weight','lokr_w2'):value for key,value in header.items()}
        encoded=json.dumps(header).encode();path.write_bytes(struct.pack('<Q',len(encoded))+encoded+data)
        self.assertEqual(lm.inspect_file(path)['error'],'')
        self.assertFalse(self.check([self.selected(self.a)])['errors'])

    def add_presets(self):
        p=self.profile(0);p.update(presets_enabled=True,triggers='soft lighting',presets=[
            {'id':'stand','name':'站姿','prompt':'standing upright'},
            {'id':'sit','name':'坐姿','prompt':'sitting on a chair'}])
        return p

    def test_only_selected_preset_and_common_trigger_are_appended(self):
        self.add_presets();row=self.selected(self.a,preset_id='stand',use_trigger=True)
        self.assertEqual(self.check([row])['final_prompt'],'A cat\nsoft lighting\nstanding upright')
        row['preset_id']='sit'
        result=self.check([row]);self.assertEqual(result['final_prompt'],'A cat\nsoft lighting\nsitting on a chair')
        self.assertNotIn('standing upright',result['final_prompt'])

    def test_no_preset_off_disabled_and_zero_do_not_append(self):
        p=self.add_presets();row=self.selected(self.a,preset_id='sit')
        p['presets_enabled']=False
        self.assertEqual(self.check([row])['final_prompt'],'A cat');self.assertEqual(len(p['presets']),2)
        p['presets_enabled']=True
        for override in ({'preset_id':''},{'enabled':False},{'strength':0}):
            self.assertEqual(self.check([{**row,**override}])['final_prompt'],'A cat')

    def test_unknown_or_modified_historical_preset_rejected(self):
        p=self.add_presets();row=self.selected(self.a,preset_id='missing')
        self.assertTrue(any(e['code'].startswith('preset:') for e in self.check([row])['errors']))
        row.update(preset_id='stand',preset_hash=lm.preset_fingerprint(p['presets'][0]))
        self.assertFalse(self.check([row])['errors'])
        p['presets'][0]['prompt']='standing in sunlight'
        self.assertTrue(self.check([row])['errors'])
        p['presets_enabled']=False
        self.assertTrue(self.check([row])['errors'])

    def test_preset_words_already_in_user_prompt_are_not_duplicated(self):
        self.add_presets();prompt='A cat standing upright'
        self.assertEqual(self.check([self.selected(self.a,preset_id='stand')],prompt=prompt)['final_prompt'],prompt)

    def test_snapshot_and_saved_configuration_keep_preset(self):
        self.add_presets();rows=[self.selected(self.a,preset_id='sit')]
        result=self.check(rows)
        body={'preset':'01_text_to_image','prompt':'A cat','loras':rows,'lora_acknowledged':[w['code'] for w in result['warnings']]}
        prepared=lm.prepare(body,'cutie');snapshot=prepared['snapshots'][0]
        self.assertEqual(snapshot['preset']['name'],'坐姿');self.assertEqual(snapshot['preset']['prompt'],'sitting on a chair')
        self.assertEqual(lm.selections(prepared['items'])[0]['preset_id'],'sit')
        self.assertEqual(snapshot['preset_hash'],lm.preset_fingerprint(snapshot['preset']))

    def test_preset_profile_validation_and_legacy_configuration(self):
        p=self.add_presets();self.assertEqual(lm.clean_profile(p)['presets'],p['presets'])
        p['presets'].append(copy.deepcopy(p['presets'][0]))
        with self.assertRaises(ValueError):lm.clean_profile(p)
        p['presets'].pop();p['presets'][0]['prompt']=''
        with self.assertRaises(ValueError):lm.clean_profile(p)
        with self.assertRaises(ValueError):lm.selections([self.selected(self.a,preset_id=['stand','sit'])])
        old=lm.selections([self.selected(self.a)])[0]
        self.assertEqual(old['preset_id'],'');self.assertEqual(old['preset_hash'],'')


class StrictLoaderTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'neutral.safetensors'
        self.path.write_bytes(b'neutral fixture');self.digest=hashlib.sha256(self.path.read_bytes()).hexdigest()
        class Parent:
            @classmethod
            def INPUT_TYPES(cls):return {'required':{'model':('MODEL',),'clip':('CLIP',),'strength_clip':('FLOAT',)}}
            def load_lora(loader, model, clip, name, strength_model, strength_clip):
                return self.result_model, self.result_clip
        spec=importlib.util.spec_from_file_location('strict_loader_test',Path(__file__).resolve().parents[1]/'ComfyUI/custom_nodes/webui_generation_loras/__init__.py')
        self.module=importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules,{'nodes':types.SimpleNamespace(LoraLoader=Parent),
                                   'folder_paths':types.SimpleNamespace(get_full_path_or_raise=lambda category,name:str(self.path))}):
            spec.loader.exec_module(self.module)
        self.model=types.SimpleNamespace(patches={'weight':[('existing',)]})
        self.result_model=types.SimpleNamespace(patches={'weight':[('existing',),('new',)]})
        self.clip=types.SimpleNamespace(patcher=types.SimpleNamespace(patches={}))
        self.result_clip=types.SimpleNamespace(patcher=types.SimpleNamespace(patches={'text':[('new',)]}))

    def tearDown(self):self.temp.cleanup()

    def test_accepts_incremental_patch_chain(self):
        loader=self.module.GenerationLoraLoaderModelOnly()
        self.assertEqual(loader.load_lora(self.model,self.path.name,0.5,self.digest),(self.result_model,))

    def test_rejects_unmatched_model(self):
        self.result_model=self.model
        with self.assertRaisesRegex(ValueError,'没有匹配到模型参数'):
            self.module.GenerationLoraLoaderModelOnly().load_lora(self.model,self.path.name,0.5,self.digest)

    def test_rejects_unmatched_clip(self):
        self.result_clip=self.clip
        with self.assertRaisesRegex(ValueError,'没有匹配到文本编码器参数'):
            self.module.GenerationLoraLoader().load_lora(self.model,self.clip,self.path.name,0,1,self.digest)

    def test_rejects_changed_file_before_loading(self):
        self.path.write_bytes(b'replaced neutral fixture')
        with self.assertRaisesRegex(ValueError,'版本不一致'):
            self.module.GenerationLoraLoaderModelOnly().load_lora(self.model,self.path.name,0.5,self.digest)


if __name__ == '__main__':unittest.main()
