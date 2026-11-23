"""Read all generated outputs for one stable library prompt identity."""
from urllib.parse import urlencode


def collect(jobs, identity, resolve_image, include_all=False):
    result, seen = [], set()
    for job in sorted(jobs, key=lambda j: j.get('finished') or j.get('created') or 0, reverse=True):
        snapshot = job.get('library_prompt') or {}
        linked_id = job.get('library_prompt_id') or snapshot.get('id')
        if (not include_all and linked_id != identity) or job.get('status') != 'success':
            continue
        for index, image in enumerate(job.get('images', [])):
            if image.get('type') != 'output':
                continue
            try:
                path = resolve_image(image)
            except (ValueError, OSError):
                continue
            key = str(path)
            if key in seen:
                continue
            seen.add(key)
            media = {k: image.get(k, '') for k in ('filename', 'subfolder', 'type')}
            result.append({**media, 'url': '/image?' + urlencode(media),
                'job_id': job.get('prompt_id'), 'image_index': index,
                'created': job.get('finished') or job.get('created'),
                'model': job.get('generation_model') or job.get('preset') or '',
                'seed': job.get('seed'),
                'revision': job.get('library_prompt_revision') or snapshot.get('revision')})
            if include_all:
                result[-1].update(title=snapshot.get('title') or job.get('label') or '生成图片',
                    library_prompt_id=linked_id,
                    prompt=job.get('final_prompt') or job.get('prompt') or job.get('original_prompt') or '',
                    library_prompt=snapshot.get('prompt') or '')
    return result
