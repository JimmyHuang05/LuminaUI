import unittest
from PIL import Image
from character_cards import reference_image
from character_generation import set_reference_strength
import workflow_controls
class CharacterReferenceTests(unittest.TestCase):
 def test_crop_keeps_source(self):
  source=Image.new('RGB',(1000,1400));cropped=reference_image(source,{'reference_crop':[.16,.015,.86,.5]})
  self.assertEqual(cropped.size,(700,679));self.assertEqual(source.size,(1000,1400))
  self.assertEqual(reference_image(source,{}).size,source.size)
  with self.assertRaises(ValueError):reference_image(source,{'reference_crop':[1,0,0,1]})
 def test_stages_and_slot(self):
  for second in [False,True]:
   graph={key:{'inputs':{'ref_boost':4,'ref_boost_a':1}} for key in ['character_patch','character_refine_patch','hd_character_patch']}
   set_reference_strength(graph,2,second)
   for node in graph.values():
    self.assertEqual(node['inputs']['ref_boost_a' if second else 'ref_boost'],2)
    self.assertEqual(node['inputs']['ref_boost' if second else 'ref_boost_a'],4 if second else 1)
 def test_default_and_limits(self):
  self.assertEqual(workflow_controls.resolve({})['character_strength'],2)
  with self.assertRaises(ValueError):workflow_controls.resolve({'workflow_settings':{'character_strength':9}})
if __name__=='__main__':unittest.main()
