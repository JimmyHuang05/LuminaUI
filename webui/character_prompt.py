"""Shared, deterministic character-card composition. Never edits the saved prompt."""
import re

ROLES = {'subject':'subject appearance', 'identity':'facial identity', 'pose':'pose and action',
         'clothing':'clothing and accessories', 'composition':'composition and camera angle',
         'scene':'background', 'style':'style and lighting', 'custom':'the explicitly described features'}
FIELDS = r'hair color|hair style|eye color|body type|发色|发型|瞳色|体型|脸型'

def merge_scene(scene, specification):
    # Only replace standalone labelled values; never remove prose or whole subject modules.
    values = {m.group(1).lower():m.group(2).strip() for m in
              re.finditer(r'^\s*(' + FIELDS + r')\s*[:：]\s*([^\n]+)$', specification, re.I | re.M)}
    def replace(match):
        value = values.get(match.group(2).lower())
        return match.group(1) + match.group(2) + ': ' + value if value else match.group(0)
    scene = re.sub(r'^(\s*)(' + FIELDS + r')\s*[:：]\s*([^\n]+)$', replace, scene, flags=re.I | re.M)
    colors = r'platinum blonde|golden blonde|chestnut brown|dark brown|light brown|black|blonde|blond|brown|red|silver|white|pink|blue|green'
    hair = re.compile(r'\b(' + colors + r')(\s+(?:(?:long|short|straight|curly|wavy|layered|silky)\s+)*hair)\b', re.I)
    card_colors = {m.group(1).lower() for m in hair.finditer(specification)}
    if len(card_colors) == 1:
        color = next(iter(card_colors))
        def subject(match):
            content = match.group(2)
            if re.search(r'\b(man|men|women|people|couple|two|another)\b|另一|两人|多人|男子', content, re.I):
                return match.group(0)
            return match.group(1) + hair.sub(lambda m:color + m.group(2), content)
        scene = re.sub(r'(\[(?:Subject Description|Hair)\]\s*)(.*?)(?=\n\[|\Z)', subject, scene, flags=re.I | re.S)
    return scene

def compose(scene, card):
    specification = str(card.get('prompt', '')).strip()
    scene = merge_scene(scene, specification)
    return ('Create the requested scene with the main character from Image 1. '
            'Use Image 1 only for facial identity and appearance details absent from the character specification. '
            'The character specification overrides conflicting face, hair, eye and body descriptions in the scene or any image. '
            'Character fields Identity, Face, Hair, Body and Skin define only the main character identity and appearance; empty fields impose no requirement. '
            'Essential Constraints in the character card apply only to identity and appearance. '
            'The scene controls expression, gaze, pose, action, clothing, accessories, background, framing, lighting and visual style. '
            'Do not copy clothing, pose, background or framing from the character photo. '
            'Keep other people unchanged. Other reference images supply only their assigned features and must not replace the main character identity.\n'
            'Scene:\n' + scene + '\nCharacter specification:\n' + specification)

def reference(ref, index, has_character=False):
    role = ref.get('role', 'custom')
    if role not in ROLES:
        raise ValueError('参考图用途无效')
    description = ref.get('description', '')
    if not isinstance(description, str) or len(description) > 1000:
        raise ValueError('每张参考图用途说明最多 1000 字')
    if role == 'custom' and not description.strip():
        raise ValueError('自由描述用途需要填写说明')
    text = f'Image {index} (<image{index}>): reference only {ROLES[role]}. ' + description.strip()
    if has_character:
        text += ' Preserve the main character identity from Image 1 and the character specification.'
    return text
