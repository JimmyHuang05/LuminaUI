import asyncio
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from PIL import Image
import regions
import server


class EditWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.folder=Path(self.temp.name)
        for name in ('source.png','reference.png'):
            Image.new('RGB',(768,1024),'blue').save(self.folder/name)
        Image.new('L',(768,1024),255).save(self.folder/'edit_mask_test.png')
        self.path_patch=patch.object(regions,'INPUT',self.folder)
        self.path_patch.start()
        self.source='webui/source.png'
        self.reference='webui/reference.png'
        self.body={'preset':'03_image_edit','image':self.source,'edit_model':'qwen',
                   'edit_task':'head','prompt':'Keep the scene.','seed':42,
                   'references':[{'image':self.reference,'role':'identity'}]}

    async def asyncTearDown(self):
        self.path_patch.stop()
        self.temp.cleanup()

    async def build(self, **changes):
        body=copy.deepcopy(self.body);body.update(changes)
        request=AsyncMock();request.json.return_value=body;request.app={}
        def resolve(name):
            return self.folder/Path(name).name
        def prepare(name, budget):
            return name
        backend=AsyncMock(return_value={'prompt_id':'test-only'})
        with patch.object(server,'input_path',resolve),patch.object(regions,'input_path',resolve),\
             patch.object(server,'prepare_reference',side_effect=prepare) as resized,\
             patch.object(server,'backend',backend),patch.object(server,'save'),\
             patch.object(server,'JOBS',[]),patch.object(server,'MEMORY_LOCK',asyncio.Lock()):
            response=await server.generate(request)
        return backend.call_args.args[2]['prompt'],json.loads(response.body),resized.call_args_list

    async def test_head_contract(self):
        graph,job,calls=await self.build()
        self.assertEqual(graph['4']['inputs']['images.image_1'],['10',0])
        self.assertEqual(graph['4']['inputs']['images.image_2'],['30',0])
        self.assertEqual(graph['50']['inputs']['strength_model'],1)
        self.assertEqual(graph['6']['inputs']['model'],['50',0])
        self.assertTrue(job['final_prompt'].startswith('head_swap:'))
        self.assertEqual(graph['7']['inputs']['latent_image'],['4',2])
        self.assertEqual(graph['4']['inputs']['resolution'],0)
        self.assertIn(((self.reference,512),{}),calls)

    async def test_body_independent_budgets(self):
        graph,job,calls=await self.build(edit_task='body')
        self.assertTrue(job['final_prompt'].startswith('body_swap:'))
        self.assertIn('body_swap_v1.0',graph['50']['inputs']['lora_name'])
        self.assertIn(((self.source,1440),{}),calls)
        self.assertIn(((self.reference,768),{}),calls)

    async def test_face_uses_matching_bfs_head_lora(self):
        graph,job,_=await self.build(edit_task='face',mask='webui/edit_mask_test.png',local_edit=False)
        self.assertIn('bfs_head_v1.1_qwen_2.1',graph['50']['inputs']['lora_name'])
        self.assertEqual(graph['6']['inputs']['model'],['50',0])
        self.assertTrue(job['final_prompt'].startswith('head_swap:'))
        self.assertEqual(job['lora'],graph['50']['inputs']['lora_name'])
        self.assertIn('Edit <image1> only.',job['final_prompt'])
        self.assertIn('identity from <image2>',job['final_prompt'])
        self.assertTrue(job['local_edit'])
        self.assertEqual(graph['7']['inputs']['latent_image'],['23',0])
        self.assertEqual(graph['22']['inputs']['pixels'],['10',0])

    async def test_face_requires_mask(self):
        with self.assertRaisesRegex(ValueError,'面部'):
            await self.build(edit_task='face')

    async def test_face_rejects_conflicting_modes(self):
        for option in ({'annotation':'webui/annotation.png'},{'transparent':True},{'frame':'outpaint'}):
            with self.assertRaisesRegex(ValueError,'换脸请使用面部选区|扩图不能同时'):
                await self.build(edit_task='face',mask='webui/edit_mask_test.png',**option)

    async def test_free_edit_unchanged(self):
        graph,job,_=await self.build(edit_task='general',references=[])
        self.assertNotIn('50',graph)
        self.assertEqual(job['final_prompt'],'Keep the scene.')

    async def test_face_mask_constrains_crop_sampling_and_original_composite(self):
        graph,job,_=await self.build(edit_task='face',local_edit=True,
                                   mask='webui/edit_mask_test.png',prompt='参考图2的五官')
        self.assertEqual(graph['4']['inputs']['images.image_2'],['30',0])
        self.assertNotIn('images.image_3',graph['4']['inputs'])
        self.assertNotIn('20',graph)
        self.assertEqual(graph['23']['inputs']['mask'],['21',0])
        self.assertIn('identity from <image2>',job['final_prompt'])
        self.assertIn('参考图2的五官',job['final_prompt'])
        self.assertEqual(graph['7']['inputs']['latent_image'],['23',0])
        self.assertIsNotNone(job['crop_box'])
        self.assertEqual(job['edit_diagnostics']['route'],'face_crop')
        self.assertEqual(job['composite_mask'],'webui/edit_mask_test.png')

    async def test_reference_head_crop_is_used_and_original_retained(self):
        refs=[{'image':self.reference,'role':'identity','crop_rect':[.2,.1,.5,.5]}]
        graph,job,calls=await self.build(references=refs)
        prepared=graph['30']['inputs']['image']
        self.assertNotEqual(prepared,self.reference)
        self.assertEqual(job['references'],refs)
        with Image.open(self.folder/Path(prepared).name) as crop:
            self.assertEqual(crop.size,(384,512))
        with self.assertRaisesRegex(ValueError,'完整全身'):
            await self.build(edit_task='body',references=refs)
        for rect in ([0,0,2,1],[0,0,.001,.001],[float('nan'),0,.5,.5]):
            with self.assertRaises(ValueError):
                await self.build(references=[{'image':self.reference,'role':'identity','crop_rect':rect}])

    async def test_general_local_edit_uses_crop_stitch_without_hint(self):
        graph,job,_=await self.build(edit_task='local',references=[],local_edit=True,mask='webui/edit_mask_test.png')
        self.assertEqual(graph['7']['inputs']['latent_image'],['23',0])
        self.assertNotIn('20',graph)
        self.assertEqual(graph['4']['inputs']['images.image_1'],['24',1])
        self.assertEqual(graph['22']['inputs']['pixels'],['24',1])
        self.assertEqual(graph['23']['inputs']['mask'],['24',2])
        self.assertEqual(graph['9']['inputs']['images'],['25',0])
        self.assertTrue(job['hires_local'])
        self.assertIsNone(job['crop_box'])

    async def test_local_task_cannot_silently_become_whole_image(self):
        graph,job,_=await self.build(edit_task='local',references=[],local_edit=False,mask='webui/edit_mask_test.png')
        self.assertTrue(job['local_edit'])
        self.assertTrue(job['hires_local'])
        self.assertEqual(graph['9']['inputs']['images'],['25',0])
        with self.assertRaisesRegex(ValueError,'涂抹'):
            await self.build(edit_task='local',references=[],local_edit=False)
        for options in ({'frame':'outpaint'},{'annotation':'webui/annotation.png'},{'transparent':True}):
            with self.assertRaisesRegex(ValueError,'局部修改请'):
                await self.build(edit_task='local',mask='webui/edit_mask_test.png',**options)

    async def test_outpaint_compositor_never_feathers_gray_placeholder(self):
        job=dict(image=self.source,mask='webui/edit_mask_test.png',frame='outpaint',feather=32)
        with patch.object(server,'composite_outpaint') as outpaint,patch.object(server,'composite') as normal:
            server.compose_edit_result(job,'generated.png','result.png')
            outpaint.assert_called_once_with(self.source,'generated.png',job['mask'],'result.png')
            normal.assert_not_called()

    async def test_local_reference_stays_image_two(self):
        graph,job,calls=await self.build(edit_task='local',local_edit=True,mask='webui/edit_mask_test.png')
        self.assertEqual(graph['4']['inputs']['images.image_2'],['30',0])
        self.assertFalse(any(call.args[0]==self.source for call in calls))

    async def test_rebuild_hides_source_but_keeps_reference_and_composite(self):
        graph,job,_=await self.build(edit_task='local',local_edit=True,mask='webui/edit_mask_test.png',local_content='rebuild',local_resolution=1024)
        self.assertEqual(graph['4']['inputs']['images.image_1'],['27',1])
        self.assertEqual(graph['22']['inputs']['pixels'],['24',1])
        self.assertEqual(graph['26']['inputs']['mask'],['21',0])
        self.assertEqual(graph['26']['inputs']['image'],['10',0])
        self.assertEqual(graph['27']['inputs'],{**graph['24']['inputs'],'image':['26',0]})
        self.assertEqual(graph['4']['inputs']['images.image_2'],['30',0])
        self.assertEqual(graph['24']['inputs']['output_target_width'],1024)
        self.assertEqual(job['composite_mask'],'webui/edit_mask_test.png')
        self.assertEqual(job['edit_diagnostics']['local_content'],'rebuild')
        self.assertIn('blue-covered',job['final_prompt'])

    async def test_local_options_validation(self):
        with self.assertRaisesRegex(ValueError,'未知图片编辑模式'):
            await self.build(edit_task='typo')
        for options in ({'local_content':'invalid'},{'local_resolution':True},{'local_resolution':8192},{'local_resolution':'768'}):
            with self.assertRaises(ValueError):
                await self.build(edit_task='local',local_edit=True,mask='webui/edit_mask_test.png',**options)
        with self.assertRaisesRegex(ValueError,'仅适用于'):
            await self.build(local_content='rebuild')

    async def test_rebuild_only_changes_visual_conditioning_for_both_models(self):
        for model in ('qwen','ray'):
            options=dict(edit_model=model,edit_task='local',local_edit=True,mask='webui/edit_mask_test.png')
            original,_,_=await self.build(**options)
            rebuilt,_,_=await self.build(**options,local_content='rebuild')
            self.assertEqual(set(rebuilt)-set(original),{'26','27'})
            for node in original:
                if node!='4':self.assertEqual(original[node],rebuilt[node],f'{model} node {node}')

    async def test_invalid_masks_never_submit(self):
        for size,value in (((768,1024),0),((512,512),255)):
            Image.new('L',size,value).save(self.folder/'edit_mask_bad.png')
            with self.assertRaisesRegex(ValueError,'选区为空或与原图尺寸不符'):
                await self.build(edit_task='local',local_edit=True,mask='webui/edit_mask_bad.png',local_content='rebuild')

    async def test_preserve_default_and_all_sizes(self):
        for size in (512,768,1024):
            graph,job,_=await self.build(edit_task='local',local_edit=True,mask='webui/edit_mask_test.png',local_resolution=size)
            self.assertNotIn('26',graph)
            self.assertEqual(graph['24']['inputs']['output_target_width'],size)
            self.assertEqual(job['local_content'],'preserve')

    async def test_large_local_crop_scales_blend_not_small_regions(self):
        for name in ('source.png','edit_mask_test.png'):
            Image.new('L' if name.startswith('edit_mask') else 'RGB',(4096,4096),255).save(self.folder/name)
        graph,job,_=await self.build(edit_task='local',references=[],mask='webui/edit_mask_test.png',local_resolution=1024)
        self.assertLessEqual(graph['24']['inputs']['mask_blend_pixels'],8)
        self.assertEqual(job['edit_diagnostics']['crop_blend_pixels'],graph['24']['inputs']['mask_blend_pixels'])

    async def test_swap_requires_reference(self):
        with self.assertRaisesRegex(ValueError,'图2'):
            await self.build(references=[])

    async def test_consistency_lora_chains_after_functional_lora(self):
        for task in ('head','body','general'):
            graph,job,_=await self.build(edit_task=task,anti_shift=True)
            self.assertEqual(graph['51']['inputs']['strength_model'],1)
            self.assertEqual(graph['51']['inputs']['model'],['1',0] if task=='general' else ['50',0])
            self.assertEqual(graph['6']['inputs']['model'],['51',0])
            self.assertTrue(job['anti_shift'])

    async def test_outpaint_does_not_force_window_scene(self):
        with patch.object(server,'outpaint_reference',return_value=(self.source,'webui/edit_mask_test.png',[0,0,768,1024])):
            graph,job,_=await self.build(edit_task='general',references=[],frame='outpaint',prompt='延展砖墙和木地板')
        self.assertIn('延展砖墙和木地板',job['final_prompt'])
        self.assertNotIn('窗台',job['final_prompt'])
        self.assertNotIn('玻璃窗',job['final_prompt'])
        self.assertFalse(job['hires_local'])
        self.assertIn('outpaint-v2',graph['50']['inputs']['lora_name'])
        self.assertEqual(graph['50']['inputs']['strength_model'],1)
        self.assertEqual(graph['7']['inputs']['latent_image'],['4',2])
        self.assertNotIn('images.image_2',graph['4']['inputs'])
        self.assertNotIn('23',graph)
        self.assertTrue(job['final_prompt'].startswith('Outpaint the image:'))

    async def test_fusion_is_explicit_and_uses_one_composite(self):
        graph,job,_=await self.build(edit_task='fusion',references=[],prompt='融入红色花瓶')
        self.assertIn('Fusion_2000',job['lora'])
        self.assertEqual(graph['6']['inputs']['model'],['50',0])
        self.assertTrue(job['final_prompt'].startswith('Blend the inserted object into the image seamlessly.'))
        self.assertNotIn('images.image_2',graph['4']['inputs'])
        for options in ({'local_edit':True},{'frame':'outpaint'},{'references':[{'image':self.reference,'role':'subject'}]}):
            with self.assertRaises(ValueError):
                await self.build(**{'edit_task':'fusion','references':[],**options})

    async def test_head_requires_mask_for_local_route(self):
        with self.assertRaisesRegex(ValueError,'涂抹'):
            await self.build(local_edit=True)

    async def test_head_body_local_bfs_crop_stitch_contract(self):
        for task in ('head','body'):
            graph,job,_=await self.build(edit_task=task,local_edit=True,mask='webui/edit_mask_test.png')
            self.assertEqual(graph['6']['inputs']['model'],['50',0])
            self.assertEqual(graph['4']['inputs']['images.image_1'],['24',1])
            self.assertEqual(graph['4']['inputs']['images.image_2'],['30',0])
            self.assertEqual(graph['23']['inputs']['mask'],['24',2])
            self.assertEqual(graph['9']['inputs']['images'],['25',0])
            self.assertTrue(job['hires_local'])
            self.assertEqual(job['composite_mask'],'webui/edit_mask_test.png')
            with self.assertRaisesRegex(ValueError,'普通精确局部'):
                await self.build(edit_task=task,local_edit=True,mask='webui/edit_mask_test.png',local_content='rebuild')


if __name__=='__main__':unittest.main()
