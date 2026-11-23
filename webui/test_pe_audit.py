import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import pe_audit,simple_pe

class AuditTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_summary_logs_raw_response_and_missing_keys(self):
        response={'choices':[{'message':{'content':json.dumps({'title':'木桌上的蓝色瓷杯','card_summary':'蓝色瓷杯','module_summaries':{},'rating':'G'})}}]}
        async def complete(*args,**kwargs):
            pe_audit.capture(200,response,'test-secret')
            return response['choices'][0]['message']['content']
        with tempfile.TemporaryDirectory() as directory,patch.object(pe_audit,'DIRECTORY',Path(directory)),patch.object(simple_pe.deepseek_client,'complete',complete):
            with self.assertRaisesRegex(ValueError,'摘要返回不完整'):
                await simple_pe.run('update','[Subject Description]\nA blue cup.')
            rows=list(Path(directory).glob('*.json'));self.assertEqual(len(rows),1)
            record=json.loads(rows[0].read_text(encoding='utf-8'))
            self.assertEqual(record['response'],response)
            self.assertEqual(record['validation_details']['missing_modules'],['Subject Description'])
            self.assertEqual(record['outcome'],'error')
            self.assertIsNone(pe_audit.CURRENT.get())
    def test_key_redaction(self):
        record={};token=pe_audit.CURRENT.set(record)
        try:
            pe_audit.capture(401,'invalid test-secret','test-secret')
            self.assertNotIn('test-secret',json.dumps(record))
        finally:pe_audit.CURRENT.reset(token)
