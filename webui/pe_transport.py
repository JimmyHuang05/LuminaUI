"""Translate the shared PE request to vendor wire formats (no SDK dependency)."""
import copy
import json
import re


def request(config, payload):
    body = copy.deepcopy(payload)
    protocol = config.get('protocol', 'openai')
    vendor = config.get('vendor', 'deepseek')
    headers = {'Authorization': 'Bearer ' + config['api_key']}
    base = config['base_url'].rstrip('/')
    if vendor != 'deepseek':
        body.pop('thinking', None)
    schema = None
    if body.get('tools'):
        schema = body['tools'][0]['function']['parameters']
    if protocol == 'anthropic':
        system = '\n'.join(m['content'] for m in body['messages'] if m['role'] == 'system')
        messages = []
        for m in body['messages']:
            if m['role'] == 'system':
                continue
            content = m['content']
            if isinstance(content, list):
                parts = []
                for part in content:
                    if part['type'] == 'image_url':
                        url = part['image_url']['url']
                        mime, data = url.split(';base64,', 1)
                        parts.append({'type': 'image', 'source': {'type': 'base64', 'media_type': mime[5:], 'data': data}})
                    else:
                        parts.append(part)
                content = parts
            messages.append({'role': m['role'], 'content': content})
        if schema:
            system += '\nReturn only JSON matching this schema: ' + json.dumps(schema, ensure_ascii=False)
        result = {'model': body['model'], 'system': system, 'messages': messages, 'max_tokens': 12000}
        headers = {'x-api-key': config['api_key'], 'anthropic-version': '2023-06-01'}
        return base + '/messages', headers, result
    if protocol == 'responses':
        messages = []
        for m in body['messages']:
            content = m['content']
            if isinstance(content, list):
                content = [{'type': 'input_text', 'text': p['text']} if p['type'] == 'text' else
                           {'type': 'input_image', 'image_url': p['image_url']['url']} for p in content]
            messages.append({'role': m['role'], 'content': content})
        result = {'model': body['model'], 'input': messages, 'max_output_tokens': 12000, 'store': False}
        if schema:
            result['text'] = {'format': {'type': 'json_schema', 'name': 'pe_result', 'strict': True, 'schema': schema}}
        elif body.get('response_format'):
            result['text'] = {'format': {'type': 'json_object'}}
        return base + '/responses', headers, result
    # Most compatible APIs accept JSON mode but differ in forced tool-call support.
    if schema and vendor != 'deepseek':
        body.pop('tools', None)
        body.pop('tool_choice', None)
        body['messages'][0]['content'] += '\nReturn only JSON matching this schema: ' + json.dumps(schema, ensure_ascii=False)
        body['response_format'] = {'type': 'json_object'}
    if vendor == 'openai':
        body['max_completion_tokens'] = body.pop('max_tokens', 6000) * 2
    elif vendor == 'minimax':
        body['reasoning_split'] = True
        # MiniMax does not document response_format. Use the explicit JSON instruction.
        body.pop('response_format', None)
        body['max_tokens'] = 12000
    elif vendor == 'qwen-cloud':
        body['enable_thinking'] = False
    elif vendor in ('glm', 'kimi'):
        body['max_tokens'] = 12000
    return base + '/chat/completions', headers, body


def normalize(config, data, schema=None):
    protocol = config.get('protocol', 'openai')
    if protocol == 'anthropic':
        reason = data.get('stop_reason')
        content = ''.join(p.get('text', '') for p in data.get('content', []) if p.get('type') == 'text')
        data = {'choices': [{'finish_reason': 'length' if reason == 'max_tokens' else 'content_filter' if reason == 'refusal' else 'stop', 'message': {'content': content}}]}
    elif protocol == 'responses':
        parts = [p for item in data.get('output', []) for p in item.get('content', [])]
        content = ''.join(p.get('text', '') for p in parts if p.get('type') == 'output_text')
        refusal = any(p.get('type') == 'refusal' for p in parts)
        reason = 'content_filter' if refusal else 'length' if data.get('status') == 'incomplete' else 'stop'
        if data.get('error') or data.get('status') in ('failed', 'cancelled'):
            raise ValueError('模型请求未完成')
        data = {'choices': [{'finish_reason': reason, 'message': {'content': content}}]}
    if schema and data.get('choices'):
        if data['choices'][0].get('finish_reason') in ('length', 'content_filter') or data['choices'][0]['message'].get('refusal'):
            return data
        message = data['choices'][0]['message']
        if not message.get('tool_calls') and isinstance(message.get('content'), str):
            content = message['content'].strip()
            content = re.sub(r'^```(?:json)?\s*|\s*```$', '', content)
            # Parse before synthesizing the common tool result; callers validate task schemas.
            json.loads(content)
            message['tool_calls'] = [{'function': {'name': 'return_metadata', 'arguments': content}}]
    return data


def validate_schema(value, schema):
    """Validate the JSON schema subset used by PE task contracts, before consuming output."""
    if 'anyOf' in schema:
        for choice in schema['anyOf']:
            try:
                validate_schema(value, choice)
                return
            except ValueError:
                pass
        raise ValueError('模型返回的数据类型不符合要求')
    kind = schema.get('type')
    types = {'object': dict, 'array': list, 'string': str, 'null': type(None), 'boolean': bool, 'integer': int, 'number': (int, float)}
    if kind in types and (not isinstance(value, types[kind]) or (kind in ('integer', 'number') and isinstance(value, bool))):
        raise ValueError('模型返回的数据类型不符合要求')
    if 'enum' in schema and value not in schema['enum']:
        raise ValueError('模型返回的选项无效')
    if kind == 'object':
        props = schema.get('properties', {})
        if any(k not in value for k in schema.get('required', [])) or (schema.get('additionalProperties') is False and set(value) - set(props)):
            raise ValueError('模型返回的字段不完整或包含额外字段')
        for key, item in value.items():
            if key in props:
                validate_schema(item, props[key])
    if kind == 'array':
        if not schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', 100000):
            raise ValueError('模型返回的列表长度不符合要求')
        for item in value:
            validate_schema(item, schema.get('items', {}))
