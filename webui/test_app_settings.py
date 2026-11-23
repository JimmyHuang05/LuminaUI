import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import app_settings
import workflow_controls

class Request:
    method = 'POST'
    def __init__(self, body, memory):
        self.body = body
        self.app = {'runtime_memory': memory}
    async def json(self):
        return self.body

class SettingsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.patch = patch.object(app_settings, 'PATH', Path(self.temp.name)/'settings.json')
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.memory = {'idle_release_seconds': 90}

    async def test_workflow_persists_and_generation_uses_default_without_overwriting_request(self):
        body = {'workflow': 'moody_zit_simple', 'values': {'zit_scale': 1.4}}
        await app_settings.settings(Request(body, self.memory))
        self.assertEqual(workflow_controls.resolve({'generation_model': 'pro_mix'})['zit_scale'], 1.4)
        self.assertEqual(workflow_controls.resolve({'generation_model': 'pro_mix', 'workflow_settings': {'zit_scale': 1.8}})['zit_scale'], 1.8)
        self.assertEqual(app_settings.schema()['profiles']['moody_zit_simple']['defaults']['zit_scale'], 1.4)
        await app_settings.settings(Request({'workflow': 'moody_zit_simple', 'values': {}}, self.memory))
        self.assertEqual(workflow_controls.resolve({'generation_model': 'pro_mix'})['zit_scale'], 1.7)

    async def test_invalid_update_is_atomic(self):
        for body in [{'idle_release_seconds': -1}, {'idle_release_seconds': True},
                     {'workflow': 'moody_zit_simple', 'values': {'face_steps': 3}},
                     {'idle_release_seconds': 30, 'workflow': 'moody_zit_simple', 'values': {'zit_scale': 99}},
                     {'workflow': 'unknown', 'values': {}}, {'path': 'arbitrary'}]:
            with self.assertRaises(ValueError):
                await app_settings.settings(Request(body, self.memory))
        self.assertEqual(self.memory['idle_release_seconds'], 90)
        self.assertFalse(app_settings.PATH.exists())

    async def test_runtime_persists_and_public_response_has_no_secret(self):
        result = await app_settings.settings(Request({'idle_release_seconds': 0}, self.memory))
        self.assertEqual(self.memory['idle_release_seconds'], 0)
        self.assertEqual(app_settings.load()['idle_release_seconds'], 0)
        self.assertNotIn('api_key', json.loads(result.text))

    async def test_folder_action_rejects_unlisted_path(self):
        with self.assertRaises(ValueError):
            await app_settings.open_folder(Request({'location': '../'}, self.memory))

if __name__ == '__main__':
    unittest.main()
