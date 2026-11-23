import unittest,json
from unittest.mock import AsyncMock,patch
import camera_presets as c
P='[Identity]\nAdult woman\n\n[Top]\nBlue shirt\n\n[Location]\nTrain\n\n[Body Pose]\nStanding\n\n[Camera Angle]\nFront view'
class SmartTests(unittest.IsolatedAsyncioTestCase):
    async def test_rewrite_locked_and_replay(self):
        raw=json.dumps({'selected':'phone','reason':'列车坐席视角','modules':{'Camera Angle':'Seated passenger viewpoint'}})
        with patch('deepseek_client.complete',new=AsyncMock(return_value=raw)):
            r=await c.rewrite({'prompt':P,'camera_preset':{'id':'auto'}})
        self.assertIn('[Top]\nBlue shirt',r['prompt'])
        b={'preset':'01_text_to_image','prompt':P,'camera_preset':{'enabled':True,'engine':'smart','id':'auto','snapshot':r['snapshot']}}
        c.apply(b);self.assertEqual(b['prompt'],r['prompt'])
        b['prompt']=P+' changed'
        with self.assertRaises(ValueError):c.apply(b)
    async def test_out_of_scope_rejected(self):
        for modules in ({'Top':'Different shirt'},{'Gaze':'New gaze'}):
            with self.assertRaises(ValueError):c.merge_smart(P,modules,c.options({}))
    async def test_model_failure_and_bad_json(self):
        with patch('deepseek_client.complete',new=AsyncMock(return_value='broken')):
            with self.assertRaises(ValueError):await c.rewrite({'prompt':P})
        with patch('deepseek_client.complete',new=AsyncMock(side_effect=ValueError('offline'))):
            with self.assertRaises(ValueError):await c.rewrite({'prompt':P})
