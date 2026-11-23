import unittest
import character_prompt as cp

class CharacterPromptTest(unittest.TestCase):
    def test_subject_color_preserves_scene(self):
        scene = '[Subject Description]\nA woman with blonde hair, smiling.\n[Clothing & Accessories]\nA red coat.\n[Scene / Background]\nA cafe.'
        result = cp.compose(scene, {'prompt':'long black hair'})
        self.assertIn('A woman with black hair, smiling.', result)
        self.assertIn('A red coat.', result)
        self.assertIn('A cafe.', result)
        self.assertIn('blonde hair', scene)

    def test_multiple_people_not_rewritten(self):
        scene = '[Subject Description]\nTwo women with blonde hair.'
        self.assertEqual(cp.merge_scene(scene, 'black hair'), scene)

    def test_labelled_fields_only(self):
        scene = '发色：金色\n动作：举手\n服装：白色裙子'
        self.assertEqual(cp.merge_scene(scene, '发色：黑色'), '发色: 黑色\n动作：举手\n服装：白色裙子')

    def test_repeat_composition_from_source(self):
        card = {'prompt':'Black hair'}
        source = 'A green coat'
        first = cp.compose(source, card)
        self.assertEqual(first, cp.compose(source, card))
        self.assertEqual(first.count('Black hair'), 1)

    def test_reference_boundaries(self):
        text = cp.reference({'role':'pose','description':'standing'}, 2, True)
        self.assertIn('Image 2 (<image2>)',text)
        self.assertIn('identity from Image 1',text)
        with self.assertRaises(ValueError): cp.reference({'role':'custom'},2)

if __name__ == '__main__': unittest.main()
