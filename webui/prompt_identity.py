import uuid
from datetime import datetime, timezone


def normalize(rows, previous=None):
    old = {r['id']: r for r in (previous or []) if r.get('id')}
    seen = set()
    for row in rows:
        identity = row.get('id')
        if identity:
            try: identity = str(uuid.UUID(identity))
            except (ValueError, TypeError, AttributeError): raise ValueError('提示词 ID 无效')
        else:
            matches = [r for r in (previous or []) if r.get('title') == row.get('title') and r.get('prompt') == row.get('prompt')]
            identity = matches[0]['id'] if len(matches) == 1 else str(uuid.uuid4())
        if identity in seen: raise ValueError('提示词 ID 重复')
        seen.add(identity)
        prior = old.get(identity)
        if prior:
            ignored = ('id','revision','last_used_at')
            changed = {k:v for k,v in row.items() if k not in ignored} != {k:v for k,v in prior.items() if k not in ignored}
            revision = prior.get('revision',1) + int(changed)
            row.pop('last_used_at',None)
            if 'last_used_at' in prior:row['last_used_at']=prior['last_used_at']
            if changed:row['last_used_at']=datetime.now(timezone.utc).isoformat()
        else:
            revision = 1 if previous is not None else row.get('revision',1)
            if previous is not None:row['last_used_at']=datetime.now(timezone.utc).isoformat()
        if type(revision) is not int or revision < 1: raise ValueError('提示词版本无效')
        row.update(id=identity, revision=revision)
    return rows


def link_jobs(jobs, rows):
    changed = False
    for job in jobs:
        snapshot = job.get('library_prompt')
        if not isinstance(snapshot,dict) or snapshot.get('id'): continue
        matches = [r for r in rows if r.get('title') == snapshot.get('title') and r.get('prompt') == snapshot.get('prompt')]
        if len(matches) != 1: continue
        row = matches[0]
        snapshot.update(id=row['id'], revision=row['revision'])
        job.update(library_prompt_id=row['id'], library_prompt_revision=row['revision'])
        changed = True
    return changed
