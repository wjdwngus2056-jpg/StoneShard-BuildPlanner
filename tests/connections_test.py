"""Verify generated connector rectangles remain on the original game artwork."""
from pathlib import Path
import json
import re
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from import_connections import read_png


class ConnectionArtworkTests(unittest.TestCase):
    def test_all_masks_only_color_original_pixels_and_keep_joint_masks_separate(self):
        wiki=json.loads((ROOT/'wiki-data.json').read_text(encoding='utf8'))
        art={key:read_png(ROOT/tree['image'])[2] for key,tree in wiki['trees'].items()}
        branches=0
        def points(parts,pixels):
            result=set()
            for part in parts:
                matches=list(re.finditer(r'M(\d+) (\d+)h(\d+)v(\d+)h(-\d+)z',part['d']))
                self.assertEqual(''.join(m[0] for m in matches),part['d'])
                for match in matches:
                    x,y,w,h,back=map(int,match.groups());self.assertEqual(back,-w)
                    for xx in range(x,x+w):
                        for yy in range(y,y+h):
                            self.assertIn((xx,yy),pixels)
                            self.assertEqual(part['color'],'#'+''.join(f'{v:02x}' for v in pixels[xx,yy]))
                            result.add((xx,yy))
            return result
        for skill in wiki['skills']:
            for group in skill['connections']:
                joint=points(group['join'],art[skill['tree']])
                for branch in group['branches']:
                    pixels=points(branch['parts'],art[skill['tree']])
                    self.assertTrue(pixels,skill['id'])
                    self.assertFalse(joint & pixels,skill['id'])
                    branches+=1
        self.assertEqual(branches,257)


if __name__=='__main__':
    unittest.main()
