"""Import official wiki art and structured metadata; no runtime network needed."""
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urljoin, unquote
from urllib.request import Request, urlopen
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'preview' / 'wiki-cache'
BASE = 'https://stoneshard.com'
CACHE.mkdir(parents=True, exist_ok=True)

def fetch(url, target):
    target = Path(target)
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        req = Request(url, headers={'User-Agent': 'WayfarerPrototype/0.2 (local Stoneshard fan planner)'})
        with urlopen(req, timeout=35) as response:
            content = response.read()
        target.write_bytes(content)
    return target

def page(title):
    filename = re.sub(r'[^a-zA-Z0-9_-]', '_', title) + '.html'
    return fetch(BASE + '/wiki/' + quote(title.replace(' ', '_'), safe='()/_'), CACHE / filename).read_text(encoding='utf-8')

class Node:
    def __init__(self, tag='', attrs=(), parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []
    def all(self, tag=None, **attrs):
        found = []
        for child in self.children:
            if not isinstance(child, Node): continue
            if (tag is None or child.tag == tag) and all(child.attrs.get(k) == v for k, v in attrs.items()): found.append(child)
            found.extend(child.all(tag, **attrs))
        return found
    def text(self):
        return ' '.join(' '.join(child.text() if isinstance(child, Node) else child for child in self.children).split())

class Parser(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node('root'); self.current = self.root
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current); self.current.children.append(node)
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}: self.current = node
    def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs)
    def handle_endtag(self, tag):
        node = self.current
        while node.parent:
            if node.tag == tag: self.current = node.parent; break
            node = node.parent
    def handle_data(self, data): self.current.children.append(data)

TREE_NAMES = {
    'sword':'Swords', 'axe':'Axes', 'mace':'Maces', 'dagger':'Daggers',
    'two-handed-sword':'Two-Handed Swords', 'two-handed-axe':'Two-Handed Axes', 'two-handed-mace':'Two-Handed Maces',
    'spear':'Spears', 'ranged':'Ranged Weapons', 'shield':'Shields', 'staff':'Staves',
    'dual-wielding':'Dual Wielding', 'athletics':'Athletics', 'survival':'Survival', 'warfare':'Warfare',
    'armored-combat':'Armored Combat', 'magic-mastery':'Magic Mastery',
    'pyromancy':'Pyromancy', 'geomancy':'Geomancy', 'electromancy':'Electromancy', 'arcanistics':'Arcanistics'
}
HERO_NAMES = ['Arna', 'Jorgrim', 'Dirwin', 'Jonna', 'Velmir', 'Mahir', 'Leosthenes', 'Hilda']
ATTRS = {'STR': 'strength', 'AGL': 'agility', 'AGI': 'agility', 'PRC': 'perception', 'PER': 'perception', 'VIT': 'vitality', 'WIL': 'willpower'}
ROMAN = {'I': 1, 'II': 2, 'III': 3, 'IV': 4}

def slug(name): return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

def import_all():
    titles = [name + ' (skill tree)' for name in TREE_NAMES.values()] + HERO_NAMES
    with ThreadPoolExecutor(max_workers=5) as pool:
        documents = dict(zip(titles, list(pool.map(page, titles))))
    output = {'trees': {}, 'characters': {}, 'skills': []}
    assets = []
    provenance = []
    for tree_id, title in TREE_NAMES.items():
        doc = Parser(documents[title + ' (skill tree)']).root
        image = next(img for img in doc.all('img') if '_skilltree.' in img.attrs.get('src',''))
        source = urljoin(BASE, image.attrs['src'])
        local = f'assets/trees/{tree_id}.png'
        assets.append((source, ROOT / local))
        tree = {'image': local, 'width': int(image.attrs['width']), 'height': int(image.attrs['height']), 'source': BASE + '/wiki/' + quote(title.replace(' ', '_') + '_(skill_tree)', safe='()_')}
        output['trees'][tree_id] = tree
        provenance.append({'file': local, 'source': source, 'page': tree['source']})
        tiers = {}
        current_tier = 0
        for row in doc.all('tr'):
            text = row.text()
            heading = re.fullmatch(r'Treatise (I{1,3}|IV)', text)
            if heading: current_tier = ROMAN[heading[1]]
            if text == 'Unlocked for all characters': current_tier = 0
            for img in row.all('img'):
                if img.attrs.get('width') == '64': tiers[img.attrs.get('alt','')] = current_tier
        for img in doc.all('img'):
            if 'data-simple-tooltip' not in img.attrs: continue
            parent = img.parent
            box = parent.parent
            if 'position:absolute' not in box.attrs.get('style', '').replace(' ', ''): continue
            english = parent.attrs.get('title', '')
            tip = Parser(img.attrs['data-simple-tooltip']).root
            text = tip.text()
            point_match = re.search(r'put at least (\d+) points in the following attributes: ([^.]+)', text)
            level_match = re.search(r'reach level (\d+)', text)
            numeric = {key: int(value) for key, value in re.findall(r'(left|top|width|height):\s*(\d+)px', box.attrs['style'])}
            skill_id = tree_id + '-' + slug(english)
            icon_path = f'assets/skills/{skill_id}.png'
            icon_source = urljoin(BASE, img.attrs['src'])
            assets.append((icon_source, ROOT / icon_path))
            skill = {'id': skill_id, 'tree': tree_id, 'english': english, 'image': icon_path, 'tier': tiers.get(english, 0), 'passive': 'Passive' in text[:len(english) + 15], 'position': numeric,
                     'unlock': {'points': int(point_match[1]) if point_match else None, 'attributes': [ATTRS[key] for key in re.findall(r'\b(STR|AGL|AGI|PRC|PER|VIT|WIL)\b', point_match[2])] if point_match else [], 'level': int(level_match[1]) if level_match else None},
                     'source': urljoin(BASE, parent.attrs['href'])}
            output['skills'].append(skill)
            provenance.append({'file': icon_path, 'source': icon_source, 'page': skill['source']})
        print(tree_id, sum(s['tree'] == tree_id for s in output['skills']), 'skills', flush=True)
    for title in HERO_NAMES:
        doc = Parser(documents[title]).root
        image = next(img for img in doc.all('img') if img.attrs.get('alt') == title)
        path = f'assets/characters/{title.lower()}.png'
        source = urljoin(BASE, image.attrs['src'])
        assets.append((source, ROOT / path))
        html = documents[title]
        match = re.search(r'<h2 id="Affinity">.*?</h2></div>(.*?)(?=<div class="mw-heading mw-heading2">)', html, re.S)
        if not match: raise ValueError('Missing affinity section for ' + title)
        section = match[1]
        affinity = [tree_id for tree_id, name in TREE_NAMES.items() if f'title="{name} (skill tree)"' in section]
        output['characters'][title.lower()] = {'image': path, 'affinity': affinity, 'source': BASE + '/wiki/' + title}
        provenance.append({'file': path, 'source': source, 'page': BASE + '/wiki/' + title})
    with ThreadPoolExecutor(max_workers=5) as pool:
        list(pool.map(lambda item: fetch(*item), assets))
    (ROOT / 'wiki-data.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'assets' / 'sources.json').write_text(json.dumps({'origin': 'Official Stoneshard Wiki; game artwork belongs to Ink Stains Games.', 'assets': provenance}, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'game-data.js').write_text('/* Imported artwork, layout coordinates, and unlock metadata from the official Stoneshard wiki. */\n(function(root){ const data = ' + json.dumps(output, ensure_ascii=False) + '; root.WAYFARER_WIKI = data; if(typeof module !== "undefined") module.exports = data; })(typeof window !== "undefined" ? window : globalThis);\n', encoding='utf-8')
    print(f'Imported {len(output["skills"])} skills, {len(output["trees"])} trees, {len(output["characters"])} portraits.', flush=True)

if __name__ == '__main__': import_all()
