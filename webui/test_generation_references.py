import copy
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from PIL import Image
import character_generation as generation


class GenerationReferencesTest(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.photo = Path(self.directory.name) / 'reference.png'
        Image.new('RGB', (32, 32), 'white').save(self.photo)
        self.refs = [{'image':'webui/ref.png', 'role':'pose', 'description':'standing'}]
        p = patch.object(generation, 'input_path', return_value=self.photo)
        p.start()
        self.addCleanup(p.stop)

    def test_routes(self):
        for model in ('qwen', 'pro_mix'):
            body = dict(preset='01_text_to_image', generation_model=model,
                        generation_references=copy.deepcopy(self.refs))
            generation.route(body)
            self.assertEqual(body['preset'], '02_character_consistency')
            self.assertEqual(body['image'], 'webui/ref.png')
            if model == 'pro_mix':
                self.assertEqual(body['i2i_workflow'], 'moody_zit_i2i')
            else:
                self.assertEqual(body['primary_reference']['role'], 'pose')

    def test_unsupported_and_overflow(self):
        for model, refs in [('wild', self.refs), ('pro_mix', self.refs * 2), ('qwen', self.refs * 4)]:
            with self.assertRaises(ValueError):
                generation.route(dict(preset='01_text_to_image', generation_model=model, generation_references=refs))

    def test_qwen_character(self):
        row = {'id':'sample','cover_id':'a'*32,'prompt':'Black hair'}
        body = dict(preset='01_text_to_image', generation_model='qwen', character_card_id='sample', generation_references=copy.deepcopy(self.refs))
        with patch.object(generation.character_cards, 'read', return_value=[row]), patch.object(Path, 'glob', return_value=iter([self.photo])), patch.object(generation, 'save_input', return_value='webui/identity.png'):
            generation.route(body)
        self.assertEqual(body['primary_reference']['image'], 'webui/identity.png')
        self.assertEqual(body['references'], self.refs)
        self.assertEqual(body['requested_generation_references'], self.refs)
        self.assertEqual(body['character_card_snapshot']['prompt'], 'Black hair')

    def test_zit_character_routes_and_injects(self):
        row = {'id':'sample','cover_id':'a'*32,'prompt':'Black hair'}
        body = dict(preset='01_text_to_image', generation_model='pro_mix', character_card_id='sample', generation_references=[])
        with patch.object(generation.character_cards, 'read', return_value=[row]), patch.object(Path, 'glob', return_value=iter([self.photo])), patch.object(generation, 'save_input', return_value='webui/identity.png'):
            generation.route(body)
        self.assertEqual(body['image'], 'webui/identity.png')
        self.assertEqual(body['i2i_workflow'], 'moody_zit_i2i')
        self.assertEqual(body['generation_references'], [])
        graph = {'4':{'inputs':{'text':'A green coat in a cafe'}}}
        prompt, snapshot = generation.apply(graph, body, 'A green coat in a cafe')
        self.assertIn('A green coat in a cafe', prompt)
        self.assertEqual(prompt.count('Black hair'), 1)
        self.assertEqual(graph['4']['inputs']['text'], prompt)
        self.assertEqual(snapshot['reference_image'], 'webui/identity.png')
        self.assertNotIn('character_lora', graph)

    def test_zit_card_rejects_extra_image_before_preparation(self):
        body = dict(preset='01_text_to_image', generation_model='pro_mix', character_card_id='sample', generation_references=self.refs)
        with patch.object(generation.character_cards, 'read', return_value=[{'id':'sample'}]), patch.object(generation, 'save_input') as save:
            with self.assertRaisesRegex(ValueError, '人物卡已占用'):
                generation.route(body)
            save.assert_not_called()

    def test_krea_card_uses_shared_composition(self):
        row = {'id':'sample','cover_id':'a'*32,'prompt':'Black hair'}
        scene = '[Subject Description]\nA woman with blonde hair, smiling.'
        body = dict(generation_model='mix_v8',character_card_id='sample',generation_references=self.refs)
        graph = {'7':{'inputs':{'model':['1',0]}}}
        with patch.object(generation.character_cards, 'read', return_value=[row]), patch.object(Path, 'glob', return_value=iter([self.photo])), patch.object(Path, 'is_file', return_value=True), patch.object(generation, 'save_input', return_value='webui/prepared.png'):
            final, snapshot = generation.apply(graph, body, scene)
        self.assertIn('A woman with black hair, smiling.',final)
        self.assertIn('Image 2 (<image2>): reference only pose',final)
        self.assertIn('identity from Image 1',final)
        self.assertEqual(final.count('Black hair'),1)
        self.assertEqual(graph['4']['inputs']['prompt'],final)
        self.assertEqual(snapshot['prompt'],row['prompt'])
        self.assertIn('blonde hair',scene)

    def test_refinement_keeps_reference(self):
        graph = {'7':{'inputs':{'model':['1',0]}}, '11':{'class_type':'KSampler','inputs':{'model':['1',0],'latent_image':['10',0]}}}
        with patch.object(generation, 'save_input', return_value='webui/prepared.png'), patch.object(generation.character_cards, 'read', return_value=[]), patch.object(Path, 'is_file', return_value=True):
            generation.apply(graph, dict(generation_model='mix_v8',krea_simple_mode='refine',generation_references=self.refs * 2), 'A green coat')
        self.assertEqual(graph['character_refine_patch']['inputs']['target_latent'], ['10',0])
        self.assertEqual(graph['character_refine_patch']['inputs']['source_image_b'], ['reference_b',0])
        self.assertEqual(graph['11']['inputs']['model'], ['character_refine_patch',0])
        self.assertEqual(graph['character_patch']['inputs']['target_latent'], ['5',0])

    def test_plain_text_unchanged(self):
        graph = {'existing':'value'}
        self.assertEqual(generation.apply(graph, {}, 'A garden'), ('A garden', None))
        self.assertEqual(graph, {'existing':'value'})

    def test_dual_reference_graph(self):
        graph = {'7':{'inputs':{'model':['1',0]}}, '5':{'class_type':'EmptyLatentImage'}}
        with patch.object(generation, 'save_input', return_value='webui/prepared.png'), \
             patch.object(generation.character_cards, 'read', return_value=[]), \
             patch.object(Path, 'is_file', return_value=True):
            prompt, character = generation.apply(graph, dict(generation_model='cutie', generation_references=self.refs * 2), 'A green coat')
        self.assertIn('A green coat', prompt)
        self.assertIn('Image 2 (<image2>): reference only pose', prompt)
        self.assertEqual(graph['4']['inputs']['image_b'], ['reference_b',0])
        self.assertEqual(graph['character_patch']['inputs']['source_latent_b'], ['reference_b_encode',0])
        self.assertEqual(graph['5']['class_type'], 'EmptyLatentImage')
        self.assertIsNone(character)


if __name__ == '__main__':
    unittest.main()
