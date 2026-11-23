"""Local per-request diagnostics; never stores request headers or API credentials."""
import storage_paths
import contextvars,json,logging
from pathlib import Path
CURRENT=contextvars.ContextVar('pe_audit',default=None)
DIRECTORY=storage_paths.path('data')/'pe-logs'

def capture(status,response,secret=''):
    record=CURRENT.get()
    if record is None:return
    raw=json.dumps(response,ensure_ascii=False) if not isinstance(response,str) else response
    if secret:raw=raw.replace(secret,'[REDACTED]')
    record['http_status']=status
    try:record['response']=json.loads(raw)
    except ValueError:record['response']=raw

def save(record):
    try:
        DIRECTORY.mkdir(exist_ok=True)
        (DIRECTORY/(record['id']+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    except OSError:
        logging.getLogger(__name__).exception('Could not write PE diagnostic log')
