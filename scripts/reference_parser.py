"""Read a tiny, data-only subset of the compiled reference app without executing it."""
import ast
import re

STRING = r'''"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*' '''.strip()

def literal(token):
    result = ast.literal_eval(token)
    if isinstance(result, str):
        result = result.encode('utf-16', 'surrogatepass').decode('utf-16')
    return result

def array_body(source, start):
    assert source[start] == '['
    depth, quote, escaped = 1, None, False
    for index in range(start + 1, len(source)):
        char = source[index]
        if quote:
            if escaped: escaped = False
            elif char == '\\': escaped = True
            elif char == quote: quote = None
        elif char in '\"\'': quote = char
        elif char == '[': depth += 1
        elif char == ']':
            depth -= 1
            if not depth: return source[start + 1:index], index + 1
    raise ValueError('Unclosed data array')

def split_items(source):
    parts, start, depth, quote, escaped = [], 0, 0, None, False
    for index, char in enumerate(source):
        if quote:
            if escaped: escaped = False
            elif char == '\\': escaped = True
            elif char == quote: quote = None
        elif char in '\"\'': quote = char
        elif char in '[({': depth += 1
        elif char in '])}': depth -= 1
        elif char == ',' and not depth:
            parts.append(source[start:index].strip()); start = index + 1
    if source[start:].strip(): parts.append(source[start:].strip())
    return parts

def static_value(token, constants):
    token = token.strip()
    if token in constants: return constants[token]
    if token in ['null','undefined']: return None
    if token == '!0': return True
    if token == '!1': return False
    if token.startswith(('"', "'")): return literal(token)
    if re.fullmatch(r'-?\d+(?:\.\d+)?', token): return float(token) if '.' in token else int(token)
    if token.startswith('A.a(['):
        body, end = array_body(token, token.index('['))
        return [static_value(item, constants) for item in split_items(body)]
    if token.startswith('A.d(['):
        raw, end = fields(token, token.index('['))
        return {key:static_value(value, constants) for key,value in raw.items()}
    raise ValueError('Unsupported static value: ' + token[:80])

def fields(source, start):
    body, end = array_body(source, start)
    parts = split_items(body)
    return {literal(parts[index]):parts[index + 1] for index in range(0,len(parts),2)}, end


def parse_acquisition(code):
    """The reference displays a tree-level trainer list and book I/II shops."""
    start=code.index('A.agF.prototype=')
    end=code.index('\nA.',start+1)
    block=code[start:end]
    trainers={key:literal(value) for key,value in re.findall(r'if\(B\.e\.aZ\(k,"([^"]+)"\)\)s=l\?('+STRING+r')',block)}
    common=re.search(r'\bn=('+STRING+r'),m=',block)
    if common:
        for key in re.findall(r'if\(B\.e\.aZ\(k,"([^"]+)"\)\)s=l\?n:m',block): trainers[key]=literal(common[1])
    books=literal(re.search(r'\br=l\?('+STRING+r'):',block)[1])
    purchases={tier:place.strip() for tier,place in re.findall(r'(\d+)권:\s*([^/]+)',books)}
    if len(trainers)!=11 or set(purchases)!={'1','2'}: raise ValueError('Reference acquisition layout changed')
    return {'trainers':trainers,'purchases':purchases}

def parse_reference(code):
    first = code.index('"id","sw_0000"')
    start = code.rfind('()=>{var ',0,first)
    prefix = code[start:first]
    constants = {key:static_value(value,{}) for key,value in re.findall(r'\b(\w+)=(' + STRING + r'|null|!0|!1|-?\d+(?:\.\d+)?)',prefix)}
    skills = []
    for match in re.finditer(r'A\.d\(\["id","([a-z]{2}_\d{4})"',code):
        raw, end = fields(code,match.start()+4)
        skill = {'refId':match[1]}
        for key in ['title','titleKr','params','paramsKr','types','target','range','energy','cooldown','tiles','defaultOpen']:
            if key in raw: skill[key] = static_value(raw[key],constants)
        # Separate links are alternatives (OR); parents within one link are
        # required together (AND). Keep the groups instead of flattening them.
        skill['links'] = static_value(raw['links'],constants) if 'links' in raw else []
        skill['parentGroups'] = []
        for link in skill['links']:
            parents = list(dict.fromkeys(edge['parent'] for edge in link.get('data',[]) if edge.get('parent')))
            if not parents: raise ValueError('Empty prerequisite path for ' + skill['refId'])
            skill['parentGroups'].append(parents)
        skill['parents'] = list(dict.fromkeys(parent for group in skill['parentGroups'] for parent in group))
        skills.append(skill)
    trees = []
    for match in re.finditer(r'"([a-zA-Z_]+)",A\.d\(\["index",\d+,"title",',code):
        raw, end = fields(code,code.index('[',match.start()))
        if 'titleKr' not in raw or 'data' not in raw: continue
        trees.append({'key':match[1], 'english':static_value(raw['title'],constants), 'name':static_value(raw['titleKr'],constants)})
    return skills, trees
