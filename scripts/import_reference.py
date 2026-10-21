"""Cache public reference metadata for Korean names and tree prerequisites."""
from import_wiki import fetch, ROOT
from concurrent.futures import ThreadPoolExecutor
from reference_parser import parse_reference, parse_acquisition
from import_connections import add_connections
import json
import re

BASE = 'https://stoneshard-00.web.app/'

def download(path):
    return fetch(BASE + path, ROOT / 'preview' / 'reference' / path.replace('/', '__'))

if __name__ == '__main__':
    files = ['flutter_bootstrap.js', 'main.dart.js', 'assets/AssetManifest.bin.json']
    with ThreadPoolExecutor(max_workers=3) as pool:
        paths = list(pool.map(download, files))
    code = paths[1].read_text(encoding='utf-8')
    raw_skills, raw_trees = parse_reference(code)
    acquisition = parse_acquisition(code)
    entries = [{'refId':entry['refId'], 'english':entry.get('title',''), 'name':entry.get('titleKr',''), 'parents':entry['parents'],
                'parentGroups':entry['parentGroups'], 'links':entry['links'],
                'defaultOpen':entry.get('defaultOpen',False), 'effects':[line for line in entry.get('paramsKr',[]) if line],
                'types':entry.get('types',[]), 'combat':{key:entry[key] for key in ['energy','cooldown','range','target','tiles'] if key in entry}}
               for entry in raw_skills]
    wiki = json.loads((ROOT / 'wiki-data.json').read_text(encoding='utf8'))
    def comparable(value): return re.sub(r'[^a-z]', '', value.lower().replace("'s", ''))
    prefixes = {'sword':'sw','axe':'ax','mace':'mc','dagger':'dg','two-handed-sword':'ts','two-handed-axe':'ta','two-handed-mace':'tm','spear':'sp','ranged':'rw','shield':'sh','staff':'st','dual-wielding':'dw','athletics':'at','survival':'sv','warfare':'wf','armored-combat':'ac','magic-mastery':'mg','pyromancy':'py','geomancy':'ge','electromancy':'el','arcanistics':'ar'}
    tree_keys = {'sword':'swords','axe':'axes','mace':'maces','dagger':'daggers','two-handed-sword':'twoswords','two-handed-axe':'twoaxes','two-handed-mace':'twomaces','spear':'spears','ranged':'ranged','shield':'shields','staff':'staves','dual-wielding':'dual','athletics':'athletics','survival':'survival','warfare':'warfare','armored-combat':'armored','magic-mastery':'magic','pyromancy':'pyromancy','geomancy':'geomancy','electromancy':'electromancy','arcanistics':'arcanistics'}
    previous_names = {'two-handed-sword':'양손검','two-handed-axe':'양손도끼','two-handed-mace':'양손철퇴','dual-wielding':'쌍수','athletics':'운동 능력','warfare':'전투 기술','armored-combat':'기갑 전투','magic-mastery':'마법 숙련','pyromancy':'화염술','geomancy':'대지술','electromancy':'전격술','arcanistics':'비전술'}
    for tree_id, key in tree_keys.items():
        entry = next(tree for tree in raw_trees if tree['key']==key)
        wiki['trees'][tree_id].update(name=entry['name'],nameSource=BASE,aliases=[previous_names[tree_id]] if tree_id in previous_names and previous_names[tree_id]!=entry['name'] else [])
        wiki['trees'][tree_id]['acquisition'] = {'trainer':acquisition['trainers'].get(key), 'purchases':acquisition['purchases'], 'source':BASE}
    matches = {}
    for skill in wiki['skills']:
        match = next((entry for entry in entries if entry['refId'].startswith(prefixes[skill['tree']]) and comparable(entry['english']) == comparable(skill['english'])), None)
        if not match:
            position_order = sorted([s for s in wiki['skills'] if s['tree'] == skill['tree']], key=lambda s: (s['position']['top'], s['position']['left']))
            index = next(i for i,s in enumerate(position_order) if s['id'] == skill['id'])
            match = next((entry for entry in entries if entry['refId'] == prefixes[skill['tree']] + '_' + str(index).zfill(4)), None)
        if not match: raise ValueError('Missing Korean name for ' + skill['english'])
        skill['name'] = '일시 휴식' if skill['id'] == 'survival-make-a-halt' else match['name']
        skill['referenceId'] = match['refId']
        skill['nameSource'] = BASE
        skill['effects'] = match['effects']
        skill['effectSource'] = BASE
        skill['types'] = match['types']
        skill['combat'] = match['combat']
        skill['passive'] = 'passive' in match['types']
        matches[match['refId']] = skill['id']
    for skill in wiki['skills']:
        entry = next(item for item in entries if item['refId'] == skill['referenceId'])
        unknown = [parent for parent in entry['parents'] if parent not in matches]
        if unknown: raise ValueError(f'Unknown prerequisite for {skill["id"]}: {unknown}')
        # `requires` is the flat edge inventory for inspection; the nested
        # `prerequisites` is the actual OR-of-AND acquisition rule.
        skill['requires'] = [matches[parent] for parent in entry['parents']]
        skill['prerequisites'] = [[matches[parent] for parent in group] for group in entry['parentGroups']]
        skill['prerequisitesSource'] = BASE
        if skill['id'] == 'ranged-dexterity': skill['tier'] = 1
    print('Traced original connector branches:', add_connections(wiki))
    (ROOT / 'reference-data.json').write_text(json.dumps({'source': BASE, 'trees':raw_trees, 'acquisition':acquisition, 'skills': entries}, ensure_ascii=False, indent=2), encoding='utf8')
    (ROOT / 'wiki-data.json').write_text(json.dumps(wiki, ensure_ascii=False, indent=2), encoding='utf8')
    (ROOT / 'game-data.js').write_text('/* Art/layout/unlock metadata: official wiki. Korean names and connections: user-provided reference site. */\n(function(root){const data=' + json.dumps(wiki, ensure_ascii=False) + ';root.WAYFARER_WIKI=data;if(typeof module!=="undefined")module.exports=data;})(typeof window!=="undefined"?window:globalThis);\n', encoding='utf8')
    print(f'Matched {len(wiki["skills"])} Korean skill names and prerequisite lists.')
    print('Alternative paths:', sum(len(s['prerequisites']) > 1 for s in wiki['skills']))
    print('All-required paths:', sum(any(len(group) > 1 for group in s['prerequisites']) for s in wiki['skills']))
    print('Tree names:', ', '.join(t['name'] for t in wiki['trees'].values()))
    print('Skills without Korean effects:', [s['id'] for s in wiki['skills'] if not s['effects']])
    print('Expressions:', sorted(set(expression for skill in wiki['skills'] for line in skill['effects'] for expression in re.findall(r'\$\{([^{}]+)\}',line))))
