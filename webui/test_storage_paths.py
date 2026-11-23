import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import storage_paths

class StorageTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        root=Path(temp.name)
        self.roots={key:root/key for key in storage_paths.DEFAULTS}
        for folder in self.roots.values():folder.mkdir()
        self.config=root/'paths.json'
        for name,value in [('CONFIG',self.config),('DEFAULTS',self.roots),('ACTIVE',dict(self.roots))]:
            p=patch.object(storage_paths,name,value);p.start();self.addCleanup(p.stop)
        self.target=root/'new output';self.target.mkdir()

    def test_saved_paths_pending_until_restart(self):
        storage_paths.save({'output':str(self.target)})
        self.assertEqual(storage_paths.configured()['output'],self.target)
        self.assertEqual(storage_paths.path('output'),self.roots['output'])
        self.assertIn(str(self.roots['output']),storage_paths.engine_arguments())

    def test_rejects_invalid_paths_without_changing_configuration(self):
        for value in [{'unknown':str(self.target)}, {'output':'relative'},
                      {'output':str(self.target/'absent')}, {'input':str(self.roots['output'])},
                      {'workflows':str(self.target)}, {'local_pe':str(self.target)}]:
            with self.assertRaises(ValueError):storage_paths.save(value)
        self.assertFalse(self.config.exists())

    def test_data_directory_requires_existing_records(self):
        (self.roots['data']/'prompt_library.json').write_text('[]')
        with self.assertRaises(ValueError):storage_paths.save({'data':str(self.target)})
        (self.target/'prompt_library.json').write_text('[]')
        storage_paths.save({'data':str(self.target)})
        self.assertTrue((self.roots['data']/'prompt_library.json').exists())

    def test_running_engine_directory_arguments(self):
        roots=storage_paths.engine_roots(['main.py','--models-directory',str(self.target),'--input-directory='+str(self.roots['input'])])
        self.assertEqual(roots['models'],self.target)
        self.assertEqual(roots['input'],self.roots['input'])

if __name__=='__main__':unittest.main()
