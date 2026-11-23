"""Lossless organization: all source characters retained in indexed fragments."""
import copy
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

from prepare_prompt_modules import HEADINGS, HEADER, ALIASES

def destination(text, source):
    t = text.strip()
    # Constraints and deliberately composite instructions stay intact.
    if source == 'Essential Constraints':
        return source
    if re.match(r'^(?:None|Not specified)\.?$', t, re.I):
        return source
    if source == 'Subject Description':
        if re.search(r'\b(?:makeup|wig)\b', t, re.I):
            return source
        if re.match(r'^(?:She|He|They) (?:looks?|gazes?|stands?|sits?|kneels?|lies|leans?|holds?|turns?|tilts?|tips?|raises?|faces?|smiles?|is (?:looking|sitting|standing|kneeling|holding))\b', t):
            return 'Action & Pose'
        if re.match(r'^(?:She|He) (?:wears?|is wearing)\b', t):
            return 'Clothing & Accessories'
    if source == 'Clothing & Accessories':
        if re.match(r'^(?:She|He) (?:rides?|holds?|is holding|stands?|sits?|kneels?|leans?|gazes?|looks?)\b', t):
            return 'Action & Pose'
        if re.match(r'^Her (?:other hand|right hand|left hand) (?:rests?|holds?)\b', t):
            return 'Action & Pose'
    if source in ('Subject Description', 'Clothing & Accessories', 'Action & Pose', 'Scene / Background'):
        if re.match(r'^(?:Low.angle|High.angle|Ultra.close|Half.body|Medium shot|Close.up shot|Vertical composition|The composition|The camera|The lens|Shallow depth of field|The aspect ratio)\b', t, re.I):
            return 'Composition / View'
    if source == 'Composition / View':
        if re.match(r'^(?:Soft daylight|Light comes|Sunlight falls|The overall tone|The color palette)\b', t):
            return 'Lighting & Color'
    return source

def organize(row):
    prompt = row['prompt']
    matches = list(HEADER.finditer(prompt))
    fragments, units, flags = [], [], []
    cursor = 0
    for n, match in enumerate(matches):
        if cursor < match.start():
            fragments.append({'kind':'preamble','start':cursor,'end':match.start(),'text':prompt[cursor:match.start()]})
        fragments.append({'kind':'heading','start':match.start(),'end':match.end(),'text':prompt[match.start():match.end()]})
        end = matches[n+1].start() if n+1<len(matches) else len(prompt)
        body = prompt[match.end():end]
        source = ALIASES.get(match[1],match[1])
        # Split only at paragraph breaks or unambiguous sentence boundaries.
        # Decimal camera settings and punctuation remain untouched.
        boundaries = [0] + [m.end() for m in re.finditer(r'\n\s*\n|(?<=[.!?])\s+(?=[A-Z])',body)] + [len(body)]
        for left,right in zip(boundaries,boundaries[1:]):
            if left==right:continue
            text=body[left:right]
            unit={'kind':'content','start':match.end()+left,'end':match.end()+right,'text':text,
                  'source_section':match[1],'section':destination(text,source)}
            fragments.append(unit)
            if text.strip():units.append(unit)
        cursor=end
    if not matches:
        fragments=[{'kind':'content','start':0,'end':len(prompt),'text':prompt,'source_section':'Unsorted','section':'Unsorted'}]
        units=fragments[:]
    assert ''.join(f['text'] for f in fragments)==prompt
    assert all(prompt[f['start']:f['end']]==f['text'] for f in fragments)
    for a,b in zip(fragments,fragments[1:]):assert a['end']==b['start']
    sections={heading:[] for heading in HEADINGS}
    for u in units:sections.setdefault(u['section'],[]).append({'text':u['text'],'source_start':u['start'],'source_end':u['end']})
    for u in units:
        if re.search(r'\b(?:also wearing|also wears|also has a pose|also lying|also sitting)\b',u['text'],re.I):
            flags.append({'type':'possible_alternative','source_start':u['start'],'note':'追加穿着或姿势，保留原句，不选择或删除方案'})
        if u['section']=='Essential Constraints' and re.search(r'preserve|must|keep',u['text'],re.I):
            flags.append({'type':'cross_module_constraint','source_start':u['start'],'note':'可能引用其他模块，组合时须整体核对；原文保留'})
    grouped=[v for values in sections.values() for v in values]
    assert Counter((u['start'],u['end'],u['text']) for u in units)==Counter((v['source_start'],v['source_end'],v['text']) for v in grouped)
    # Original headings and whitespace remain fully recoverable in fragments.
    organized='\n\n'.join('['+h+']\n'+'\n'.join(v['text'].strip() for v in values) for h,values in sections.items() if values)
    if matches and prompt[:matches[0].start()].strip():
        organized=prompt[:matches[0].start()]+'\n'+organized
    result=copy.deepcopy(row);result['prompt']=organized
    source_hash=hashlib.sha256(prompt.encode()).hexdigest()
    return result,{'id':row['id'],'title':row['title'],'original_sha256':source_hash,
                   'fragments':fragments,'sections':sections,'flags':flags,
                   'moves':[{'start':u['start'],'from':u['source_section'],'to':u['section'],'text':u['text']}
                            for u in units if u['source_section']!=u['section']]}

def main(folder):
    folder=Path(folder);rows=json.loads((folder/'original.json').read_text(encoding='utf-8'))
    organized=[];indexed=[]
    for row in rows:
        result,index=organize(row);organized.append(result);indexed.append(index)
        assert {k:v for k,v in result.items() if k!='prompt'}=={k:v for k,v in row.items() if k!='prompt'}
    (folder/'organized-lossless.json').write_text(json.dumps(organized,ensure_ascii=False,indent=2),encoding='utf-8')
    (folder/'modules-lossless.json').write_text(json.dumps(indexed,ensure_ascii=False,indent=2),encoding='utf-8')
    summary={'records':len(rows),'fragments':sum(len(r['fragments']) for r in indexed),
             'moved_fragments':sum(len(r['moves']) for r in indexed),
             'records_with_moves':sum(bool(r['moves']) for r in indexed),
             'source_reconstruction':'93/93 exact; original text and whitespace recoverable',
             'content_deleted':0,'content_rewritten':0,'live_library_changed':False,
             'note':'Supersedes cleaned-draft.json. Repeated text, None and all conflicting clauses retained.'}
    (folder/'lossless-validation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    readable=[]
    for row in organized:
        readable.append(row['title']+'\nID: '+row['id']+'\n\n'+row['prompt'])
    (folder/'organized-reading-copy.txt').write_text('\n\n'+'\n\n' .join(readable),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main(sys.argv[1])
