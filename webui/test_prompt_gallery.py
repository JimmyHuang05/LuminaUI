import unittest
from pathlib import Path
from prompt_gallery import collect


class GalleryTests(unittest.TestCase):
    def test_global_gallery_keeps_generation_prompt_and_unlinked_outputs(self):
        jobs = [
            {'status': 'success', 'created': 2, 'final_prompt': 'actual input', 'prompt': 'draft',
             'library_prompt': {'id': 'a', 'title': 'Old title', 'prompt': 'old snapshot'}, 'images': [self.image('a.png')]},
            {'status': 'success', 'created': 1, 'prompt': 'standalone input', 'images': [self.image('b.png')]},
            {'status': 'success', 'images': [self.image('c.png')]}]
        result = collect(jobs, None, self.resolve, True)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]['prompt'], 'actual input')
        self.assertEqual(result[0]['library_prompt'], 'old snapshot')
        self.assertEqual(result[1]['prompt'], 'standalone input')
        self.assertEqual(result[2]['prompt'], '')

    def image(self, filename):
        return {'filename': filename, 'subfolder': '文生图', 'type': 'output'}

    def resolve(self, image):
        if image['filename'] == 'deleted.png': raise ValueError('gone')
        return Path('output') / image['subfolder'] / image['filename']

    def test_all_history_and_revisions_not_just_latest_hundred(self):
        jobs = [{'status': 'success', 'library_prompt_id': 'a', 'library_prompt_revision': i+1,
                 'created': i, 'images': [self.image(f'{i}.png')]} for i in range(140)]
        result = collect(jobs, 'a', self.resolve)
        self.assertEqual(len(result), 140)
        self.assertEqual(result[0]['revision'], 140)
        self.assertEqual(result[-1]['revision'], 1)

    def test_identity_not_title_and_snapshot_fallback(self):
        jobs = [
            {'status': 'success', 'library_prompt_id': 'a', 'library_prompt': {'title': 'Renamed'}, 'images': [self.image('a.png')]},
            {'status': 'success', 'library_prompt_id': 'b', 'library_prompt': {'id': 'a', 'title': 'Same title'}, 'images': [self.image('b.png')]},
            {'status': 'success', 'library_prompt': {'id': 'a', 'revision': 2}, 'images': [self.image('c.png')]},
            {'status': 'success', 'library_prompt': {'title': 'Same title'}, 'images': [self.image('d.png')]}]
        self.assertEqual([x['filename'] for x in collect(jobs, 'a', self.resolve)], ['a.png', 'c.png'])

    def test_multiple_outputs_dedup_missing_and_safe_urls(self):
        jobs = [{'status': 'success', 'library_prompt_id': 'a', 'images': [self.image('1 #.png'), self.image('2.png'), self.image('deleted.png'), self.image('2.png')]},
                {'status': 'error', 'library_prompt_id': 'a', 'images': [self.image('bad.png')]}]
        result = collect(jobs, 'a', self.resolve)
        self.assertEqual(len(result), 2)
        self.assertIn('1+%23.png', result[0]['url'])
        self.assertEqual(result[1]['image_index'], 1)
        self.assertEqual(collect(jobs, 'unknown', self.resolve), [])


if __name__ == '__main__': unittest.main()
