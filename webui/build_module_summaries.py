"""Compile reviewed display-only module summaries. Never changes the prompt library."""
import hashlib
import json
import re
from pathlib import Path
HERE = Path(__file__).resolve().parent
OUT = HERE / 'data' / 'module-summaries'
HEADER = re.compile(r'^[ \t]*(?:#{1,6}[ \t]+)?\[([^\]\r\n]+)\][ \t]*\r?\n?', re.M)

def sections(text):
    matches = list(HEADER.finditer(text))
    if not matches:
        return [text.strip()] if text.strip() else []
    values = []
    if text[:matches[0].start()].strip():
        values.append(text[:matches[0].start()].strip())
    values.extend(text[m.end():matches[i + 1].start() if i + 1 < len(matches) else len(text)].strip() for i, m in enumerate(matches))
    return values

def main():
    rows = json.loads((OUT / 'prompt-library-before.json').read_text(encoding='utf-8'))
    reviewed = json.loads((OUT / 'manual.json').read_text(encoding='utf-8'))
    cache = {}
    count = 0
    for i, row in enumerate(rows):
        bodies = sections(row['prompt'])
        summaries = reviewed[str(i)]
        if len(bodies) != len(summaries):
            raise ValueError(f'Section mismatch: prompt {i}, {len(bodies)} != {len(summaries)}')
        for body, summary in zip(bodies, summaries):
            if not isinstance(summary, str) or not 0 < len(summary) <= 30:
                raise ValueError(f'Invalid summary: prompt {i}')
            if body:
                key = hashlib.sha256(body.encode()).hexdigest()
                cache.setdefault(key, summary)
                count += 1
    current = json.loads((HERE / 'data' / 'prompt_library.json').read_text(encoding='utf-8'))
    before = {r['id']: r['prompt'] for r in rows}
    after = {r['id']: r['prompt'] for r in current}
    if before != after:
        raise ValueError('Library changed since backup; review updated entries before applying')
    (OUT / 'summaries.json').write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')
    path = HERE / 'index.html'
    html = path.read_text(encoding='utf-8')
    payload = json.dumps(cache, ensure_ascii=False).replace('<', '\\u003c')
    block = '<script id="prompt-module-summaries">window.promptModuleSummaries=' + payload + ';</script>'
    if '<script id="prompt-module-summaries">' in html:
        html = re.sub(r'<script id="prompt-module-summaries">.*?</script>', lambda _: block, html, flags=re.S)
    else:
        html = html.replace('<style id="module-prompt-cards">', block + '\n<style id="module-prompt-cards">')
    path.write_text(html, encoding='utf-8')
    print(f'{len(rows)} prompts, {count} modules, {len(cache)} unique summaries; max {max(map(len,cache.values()))} characters; originals unchanged.')

if __name__ == '__main__':
    main()
