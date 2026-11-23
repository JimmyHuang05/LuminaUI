"""Attach a saved identity reference to the existing Krea2 sampling graph."""
import storage_paths
from PIL import Image
import character_cards
import prompt_covers
import krea_edit
import character_prompt
from regions import save_input, input_path

def apply(graph, body, prompt):
    identifier = body.get('character_card_id')
    references = body.get('generation_references', [])
    if not identifier and not references:
        return prompt, None
    if body.get('generation_model') == 'pro_mix' and identifier:
        row = body.get('character_card_snapshot')
        if not row or row.get('id') != identifier or body.get('i2i_workflow') != 'moody_zit_i2i':
            raise ValueError('人物卡参考图未准备完成，请重新选择人物卡')
        final = prompt + '\n\nCharacter appearance (overrides conflicting appearance descriptions):\n' + row.get('prompt', '')
        graph['4']['inputs']['text'] = final
        return final, row
    if body.get('generation_model', 'cutie') not in ('cutie', 'mix_v8'):
        raise ValueError('人物卡目前支持 Krea2 Cutie / Mix')
    row = next((r for r in character_cards.read() if r['id'] == identifier), None)
    if identifier and not row:
        raise ValueError('人物卡不存在，请重新选择')
    if not (storage_paths.path('models')/'loras' / krea_edit.LORA).is_file():
        raise ValueError('缺少人物参考所需的 Krea2 identity edit 模型')
    images = []
    instructions = []
    if row:
        cover = row['cover_id']
        prompt_covers.validate_id(cover)
        path = next(iter(prompt_covers.DIRECTORY.glob(cover + '-original.*')), None)
        if path is None:
            raise ValueError('人物卡参考图已丢失，请重新上传')
        with Image.open(path) as image:
            from PIL import ImageOps
            images.append(save_input(krea_edit.resize(character_cards.reference_image(image, row), 1), 'character'))
        prompt = character_prompt.compose(prompt, row)
    roles={'subject':'subject appearance','identity':'facial identity','pose':'pose','clothing':'clothing','composition':'composition','scene':'background','style':'style and lighting','custom':'the specified details'}
    if not isinstance(references, list) or len(references) + len(images) > 2:
        raise ValueError('Krea2 最多使用两张参考图，人物卡占一张')
    for ref in references:
        role = ref.get('role', 'custom')
        if role not in roles:
            raise ValueError('参考图用途无效')
        with Image.open(input_path(ref.get('image'))) as image:
            images.append(save_input(krea_edit.resize(image.convert('RGB'), 1), 'generation_reference'))
        instructions.append(character_prompt.reference(ref, len(images), bool(row)))
    reference = images[0]
    final = ('Create a new image following the scene prompt. Reference images supply only the assigned features; '
             'preserve all other clothing, pose, composition, lighting and background from the scene prompt.\n'
             'Scene prompt:\n' + prompt + '\nReference instructions:\n' + '\n'.join(instructions))
    model = graph['7']['inputs']['model']
    graph['character_image'] = {'class_type':'LoadImage','inputs':{'image':reference}}
    graph['character_encode'] = {'class_type':'VAEEncode','inputs':{'pixels':['character_image',0],'vae':['3',0]}}
    graph['character_lora'] = {'class_type':'LoraLoaderModelOnly','inputs':{'model':model,'lora_name':krea_edit.LORA,'strength_model':1.0}}
    graph['character_patch'] = {'class_type':'Krea2EditModelPatch','inputs':{'model':['character_lora',0],
        'source_latent':['character_encode',0],'vae':['3',0],'source_image':['character_image',0],
        'target_latent':['5',0],'fit_mode':'fit','ref_boost':4.0,'ref_boost_a':1.0}}
    graph['4'] = {'class_type':'Krea2EditGroundedEncode','inputs':{'clip':['2',0],'prompt':final,'image':['character_image',0],'grounding_px':768}}
    graph['7']['inputs']['model'] = ['character_patch',0]
    if len(images) == 2:
        graph['reference_b']={'class_type':'LoadImage','inputs':{'image':images[1]}}
        graph['reference_b_encode']={'class_type':'VAEEncode','inputs':{'pixels':['reference_b',0],'vae':['3',0]}}
        graph['4']['inputs']['image_b']=['reference_b',0]
        graph['character_patch']['inputs'].update(source_image_b=['reference_b',0],source_latent_b=['reference_b_encode',0])
    if '11' in graph and graph['11'].get('class_type') == 'KSampler':
        # Each sampler needs its own patch primed at that sampler's latent size.
        from copy import deepcopy
        refinement = deepcopy(graph['character_patch'])
        refinement['inputs']['target_latent'] = graph['11']['inputs']['latent_image']
        refinement_model = graph['11']['inputs']['model']
        if refinement_model != model:
            graph['character_refine_lora'] = {'class_type':'LoraLoaderModelOnly','inputs':{'model':refinement_model,'lora_name':krea_edit.LORA,'strength_model':1.0}}
            refinement['inputs']['model'] = ['character_refine_lora',0]
        graph['character_refine_patch'] = refinement
        graph['11']['inputs']['model'] = ['character_refine_patch',0]
    return final, {**row, 'reference_image':reference} if row else None

def route(body):
    """Resolve a unified generation request to an existing backend workflow."""
    refs = body.get('generation_references', [])
    identifier = body.get('character_card_id')
    if (not refs and not identifier) or body.get('preset') != '01_text_to_image':
        return
    if not isinstance(refs, list) or len(refs) > 3:
        raise ValueError('最多三张参考图')
    for ref in refs:
        if not isinstance(ref, dict):
            raise ValueError('参考图格式无效')
        input_path(ref.get('image'))
    model = body.get('generation_model', 'cutie')
    if model in ('cutie', 'mix_v8'):
        return
    if identifier:
        if model not in ('qwen', 'pro_mix'):
            raise ValueError('人物卡支持 Krea2、Qwen 和 ZIT Pro Mix')
        row = next((r for r in character_cards.read() if r['id'] == identifier), None)
        if not row:
            raise ValueError('人物卡不存在，请重新选择')
        if model == 'pro_mix' and refs:
            raise ValueError('ZIT 仅支持一张参考图，人物卡已占用；请移除其他参考图或取消人物卡')
        if len(refs) > 2:
            raise ValueError('Qwen 最多三张参考图，人物卡占一张')
        prompt_covers.validate_id(row['cover_id'])
        path = next(iter(prompt_covers.DIRECTORY.glob(row['cover_id'] + '-original.*')), None)
        if path is None:
            raise ValueError('人物参考图已丢失，请重新上传')
        from PIL import ImageOps
        with Image.open(path) as image:
            reference = save_input(krea_edit.resize(character_cards.reference_image(image, row), 1), 'character_' + model)
        body['character_card_snapshot'] = {**row, 'reference_image':reference}
        body['requested_generation_references'] = list(refs)
        refs = [{'image':reference, 'role':'identity', 'description':'仅提供人物身份；发型、发色和体型以人物卡设定为准，不参考照片的服装、背景、动作。'}] + refs

    if model not in ('qwen', 'pro_mix'):
        raise ValueError('当前模型不支持参考图片，请选择 Krea2、Qwen 或 Pro Mix')
    body['preset'] = '02_character_consistency'
    body['image'] = refs[0]['image']
    body['primary_reference'] = refs[0]
    body['references'] = refs[1:]
    if model == 'pro_mix':
        if len(refs) != 1:
            raise ValueError('Pro Mix 重绘仅支持一张参考图')
        body['i2i_workflow'] = 'moody_zit_i2i'
        body['generation_references'] = []
    else:
        body['generation_references'] = []


def set_reference_strength(graph, strength, character_in_second_slot=False):
    for key in ('character_patch','character_refine_patch','hd_character_patch'):
        if key in graph:
            slot='ref_boost_a' if character_in_second_slot else 'ref_boost'
            graph[key]['inputs'][slot]=strength
