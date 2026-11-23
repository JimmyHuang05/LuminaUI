"""Small, read-only data projection for the desktop welcome page."""
from datetime import datetime


def used_timestamp(row):
    try:
        value = datetime.fromisoformat(row.get('last_used_at', '').replace('Z', '+00:00')).timestamp()
        return value if value > 0 else 0
    except (ValueError, TypeError, AttributeError, OverflowError):
        return 0


def summarize(jobs, images, prompts):
    recent = sorted((p for p in prompts if p.get('id') and used_timestamp(p)), key=used_timestamp, reverse=True)
    # Do not send the full prompt bodies or historical job payloads to the home page.
    image_fields = ('url', 'title', 'created', 'model', 'filename')
    return {
        'image_count': len(images), 'prompt_count': len(prompts),
        'active_jobs': sum(j.get('status') in ('queued', 'running') for j in jobs),
        'images': [{key: row.get(key) for key in image_fields} for row in images[:6]],
        'recent': [{'id': row['id'], 'title': row.get('title') or '未命名提示词',
                    'used_at': used_timestamp(row)} for row in recent[:4]],
    }
