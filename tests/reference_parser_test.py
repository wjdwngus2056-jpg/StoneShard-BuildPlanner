"""Regression coverage for nested data that used to be flattened by regex."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from reference_parser import parse_reference, static_value


class ReferenceParserTests(unittest.TestCase):
    def test_nested_maps_and_arrays_are_data_only(self):
        source='A.a([A.d(["data",A.a([A.d(["parent","sw_0001"],k,v),A.d(["parent","sw_0002"],k,v)],t),"bottom",A.d(["imageType","03"],k,v)],k,v)],t)'
        value=static_value(source,{})
        self.assertEqual(value[0]['data'],[{'parent':'sw_0001'},{'parent':'sw_0002'}])
        self.assertEqual(value[0]['bottom'],{'imageType':'03'})

    def test_or_paths_preserve_their_internal_and_groups(self):
        source='()=>{var flag=!0;A.d(["id","sw_0000","title","Test","defaultOpen",flag,"links",A.a([A.d(["data",A.a([A.d(["parent","sw_0001"],k,v),A.d(["parent","sw_0002"],k,v)],t)],k,v),A.d(["data",A.a([A.d(["parent","sw_0003"],k,v)],t)],k,v)],t)],k,v)}'
        skills,trees=parse_reference(source)
        self.assertEqual(skills[0]['parentGroups'],[['sw_0001','sw_0002'],['sw_0003']])
        self.assertEqual(skills[0]['parents'],['sw_0001','sw_0002','sw_0003'])
        self.assertTrue(skills[0]['defaultOpen'])
        self.assertEqual(trees,[])

    def test_empty_path_is_rejected_instead_of_unlocking_a_skill(self):
        source='()=>{var flag=!0;A.d(["id","sw_0000","links",A.a([A.d(["data",A.a([],t)],k,v)],t)],k,v)}'
        with self.assertRaisesRegex(ValueError,'Empty prerequisite path'):
            parse_reference(source)

    def test_executable_expressions_are_rejected(self):
        for source in ['process.exit()','A.d(["parent",eval("evil")],k,v)']:
            with self.assertRaises(ValueError):
                static_value(source,{})


if __name__ == '__main__':
    unittest.main()
