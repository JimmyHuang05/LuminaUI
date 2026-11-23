"""Shared UI schema and validated, workflow-specific generation settings."""
import json
import math
from pathlib import Path

SCHEMA = json.loads(Path(__file__).with_suffix('.json').read_text(encoding='utf-8'))

def profile(body):
    model = body.get('generation_model', 'cutie')
    if model in ('qwen', 'ray'):
        return model
    if model == 'pro_mix':
        return 'moody_zit_simple'
    return body.get('generation_workflow', 'moody_krea2_simple')

def resolve(body, use_saved=True):
    key = profile(body)
    if key not in SCHEMA['profiles']:
        raise ValueError('未知工作流')
    supplied = body.get('workflow_settings', {})
    if not isinstance(supplied, dict):
        raise ValueError('工作流参数格式错误')
    allowed = SCHEMA['profiles'][key]['fields']
    saved = {}
    if use_saved:
        from app_settings import load
        saved = load().get('workflows', {}).get(key, {})
    if any(k not in allowed for k in supplied):
        raise ValueError('包含不适用于当前工作流的参数，请重新选择工作流')
    result = {}
    for key in allowed:
        field = SCHEMA['fields'][key]
        value = supplied.get(key, saved.get(key, field['default']))
        if field.get('type') == 'boolean':
            valid = type(value) is bool
        else:
            valid = type(value) in (int, float) and math.isfinite(value)
            if valid:
                valid = value in field['choices'] if 'choices' in field else field['min'] <= value <= field['max']
                if field.get('step') == 1:
                    valid = valid and int(value) == value
        if not valid:
            raise ValueError(field['label'] + '超出可用范围')
        result[key] = int(value) if field.get('step') == 1 or 'choices' in field else value
    return result
