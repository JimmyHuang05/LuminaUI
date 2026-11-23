"""Prepare a reversible structural cleanup; never overwrite the live library."""
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

HEADINGS = ['Subject Description', 'Clothing & Accessories', 'Action & Pose',
            'Scene / Background', 'Composition / View', 'Lighting & Color',
            'Style & Texture', 'Essential Constraints']
ALIASES = {'Composition / Camera': 'Composition / View',
           'Essential Pose Emphasis': 'Action & Pose'}
HEADER = re.compile(r'^\s*(?:#+\s*)?\[([^\]\n]+)\][ \t]*\r?\n?', re.M)
PLACEHOLDER = re.compile(r'^(?:None|Not specified)\.?\s*$', re.I)


def prepare(row):
    text = row['prompt']
    matches = list(HEADER.finditer(text))
    sections = {h: [] for h in HEADINGS}
    changes, review = [], []
    if not matches:
        return copy.deepcopy(row), {}, [], ['无法识别章节，保留原文待复核']
    if text[:matches[0].start()].strip():
        review.append('章节前有正文，保留在开头，待人工归位')
    for n, match in enumerate(matches):
        original_heading = match[1]
        heading = ALIASES.get(original_heading, original_heading)
        body = text[match.end():matches[n+1].start() if n+1 < len(matches) else len(text)].strip()
        if heading not in sections:
            sections[heading] = []
            review.append('非标准章节：' + heading)
        if heading != original_heading:
            changes.append(f'章节归位：{original_heading} → {heading}')
        if PLACEHOLDER.fullmatch(body):
            changes.append('移除空占位章节：' + heading)
            continue
        body = re.sub(r'^Not specified\.\s+(?=\S)', '', body, flags=re.I)
        if body:
            sections[heading].append(body)
    sections = {h: '\n\n'.join(parts) for h, parts in sections.items()}

    # Exact existing sentences only: move, do not invent or paraphrase details.
    moves = [
        ('Clothing & Accessories', 'Action & Pose', 'Her other hand rests near her waist.'),
        ('Clothing & Accessories', 'Action & Pose', 'She rides a simple white city bicycle.'),
        ('Clothing & Accessories', 'Action & Pose', 'She is holding a coffee cup.'),
        ('Composition / View', 'Lighting & Color', 'Soft daylight falls beneath a palm-thatch awning, with warm wooden surfaces and green accents throughout the background.'),
    ]
    for source, target, sentence in moves:
        if sentence in sections[source]:
            sections[source] = sections[source].replace(sentence, '').strip()
            if sentence not in sections[target]:
                sections[target] = (sections[target] + '\n' + sentence).strip()
            changes.append(f'原句归位：{source} → {target}')

    # Remove only literally repeated paragraphs within the same section.
    for heading, body in sections.items():
        paragraphs = re.split(r'\n\s*\n', body)
        unique = list(dict.fromkeys(paragraphs))
        if unique != paragraphs:
            changes.append('删除同节完全重复段落：' + heading)
        sections[heading] = '\n\n'.join(unique).strip()

    clothing, pose = sections['Clothing & Accessories'], sections['Action & Pose']
    if re.search(r'She (?:is )?also wear', clothing, re.I):
        review.append('服装含追加穿着描述，需确认是叠穿还是互斥方案')
    if re.search(r'She (?:is )?also (?:lying|sitting|has a pose)', pose, re.I):
        review.append('动作含第二套姿势描述，需确认是否冲突')
    if re.search(r'\b(?:bed|sofa)\b', pose, re.I) and re.search(r'\b(?:car interior|vehicle interior|high stool)\b', text, re.I):
        review.append('动作支撑物与场景可能不一致')
    constraints = sections['Essential Constraints']
    if re.search(r'Must preserve|Preserve the', constraints, re.I):
        review.append('关键约束重新绑定人物、服装或场景，暂不作为独立可复用模块')
    if 'neon melancholy through rain-soaked glass' in constraints:
        review.append('约束追加雨窗霓虹环境，需与前文光线和场景核对')
    if re.search(r'\b(?:gaze|expression|looks|looking|smile)\b', sections['Subject Description'], re.I):
        review.append('主体段含表情或视线，拆分人物与姿势前需进一步归位')
    if any(re.search(r'\b(?:foreground|background|lighting|lens|camera)\b', sections[h], re.I)
           for h in ['Clothing & Accessories', 'Action & Pose']):
        review.append('服装或动作段有空间/镜头关联，需保留依赖关系')
    prefix = text[:matches[0].start()].strip()
    cleaned = '\n\n'.join(f'## [{h}]\n{body}' for h, body in sections.items() if body)
    if prefix:
        cleaned = prefix + '\n\n' + cleaned
    result = copy.deepcopy(row)
    result['prompt'] = cleaned
    return result, {h: v for h, v in sections.items() if v}, changes, review


def main(directory):
    directory = Path(directory)
    rows = json.loads((directory/'original.json').read_text(encoding='utf-8'))
    cleaned, modules, report = [], [], []
    for row in rows:
        result, sections, changes, review = prepare(row)
        cleaned.append(result)
        modules.append({'source_id': row['id'], 'source_revision': row.get('revision'),
                        'source_hash': hashlib.sha256(row['prompt'].encode()).hexdigest(),
                        'sections': sections, 'ready_for_recombination': False})
        report.append({'id': row['id'], 'title': row['title'], 'changes': changes,
                       'needs_review': review})
        assert {k:v for k,v in row.items() if k!='prompt'} == {k:v for k,v in result.items() if k!='prompt'}
    for filename, data in [('cleaned-draft.json', cleaned), ('modules-draft.json', modules), ('review.json', report)]:
        (directory/filename).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'total':len(rows),'changed':sum(a['prompt']!=b['prompt'] for a,b in zip(rows,cleaned)),
                      'needs_review':sum(bool(r['needs_review']) for r in report)},ensure_ascii=False))


if __name__=='__main__':
    main(sys.argv[1])
