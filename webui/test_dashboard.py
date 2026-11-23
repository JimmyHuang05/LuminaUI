import unittest
from dashboard import summarize


class DashboardTests(unittest.TestCase):
    def test_recent_is_sorted_by_actual_time_and_excludes_unused(self):
        data = summarize([], [], [
            {'id': 'a', 'last_used_at': '2026-10-12T12:00:00+08:00'},
            {'id': 'b', 'last_used_at': '2026-10-12T06:00:00+00:00'},
            {'id': 'c'}, {'id': 'd', 'last_used_at': 'invalid'},
        ])
        self.assertEqual([p['id'] for p in data['recent']], ['b', 'a'])

    def test_summary_is_bounded_and_does_not_expose_full_prompts(self):
        images = [{'url': '/image?i='+str(i), 'prompt': 'private body'} for i in range(10)]
        data = summarize([{'status': s} for s in ['queued', 'running', 'success', 'error']], images, [])
        self.assertEqual(data['image_count'], 10)
        self.assertEqual(len(data['images']), 6)
        self.assertNotIn('prompt', data['images'][0])
        self.assertEqual(data['active_jobs'], 2)
        self.assertEqual(data['recent'], [])
