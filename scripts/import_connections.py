"""Trace the game's exact connector pixels; emit SVG masks, not new elbow lines.

Uses only the standard library. The source PNGs remain unchanged.
"""
from collections import defaultdict, deque
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
COLORS = {(193,154,255), (233,219,255), (145,104,211)}


def read_png(path):
    raw=Path(path).read_bytes()
    if raw[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('Not a PNG')
    offset,compressed,palette,alpha=8,bytearray(),[],[]
    while offset<len(raw):
        length=struct.unpack('>I',raw[offset:offset+4])[0]
        kind=raw[offset+4:offset+8]; data=raw[offset+8:offset+8+length]; offset+=length+12
        if kind==b'IHDR': width,height,depth,mode,compression,filtering,interlace=struct.unpack('>IIBBBBB',data)
        elif kind==b'PLTE': palette=[tuple(data[i:i+3]) for i in range(0,len(data),3)]
        elif kind==b'tRNS': alpha=list(data)
        elif kind==b'IDAT': compressed.extend(data)
        elif kind==b'IEND': break
    if depth!=8 or mode not in (2,3,6) or interlace: raise ValueError('Unsupported PNG format')
    channels={2:3,3:1,6:4}[mode]; stride=width*channels
    stream=zlib.decompress(compressed); previous=bytearray(stride); rows=[]; offset=0
    for _ in range(height):
        kind=stream[offset]; offset+=1
        row=bytearray(stream[offset:offset+stride]); offset+=stride
        for i in range(stride):
            left=row[i-channels] if i>=channels else 0; above=previous[i]; upper_left=previous[i-channels] if i>=channels else 0
            if kind==1: predictor=left
            elif kind==2: predictor=above
            elif kind==3: predictor=(left+above)//2
            elif kind==4:
                estimate=left+above-upper_left; distances=[abs(estimate-left),abs(estimate-above),abs(estimate-upper_left)]
                predictor=[left,above,upper_left][distances.index(min(distances))]
            elif kind==0: predictor=0
            else: raise ValueError('Unknown PNG filter')
            row[i]=(row[i]+predictor)&255
        rows.append(row); previous=row
    pixels={}
    for y,row in enumerate(rows):
        for x in range(width):
            i=x*channels
            if mode==3: color=palette[row[i]]; opacity=alpha[row[i]] if row[i]<len(alpha) else 255
            else: color=tuple(row[i:i+3]); opacity=row[i+3] if mode==6 else 255
            if opacity and color in COLORS: pixels[x,y]=color
    return width,height,pixels


def vector_parts(points,pixels):
    """Merge original colored pixels into integer rectangles, grouped by color."""
    by_color=defaultdict(lambda:defaultdict(set))
    for x,y in points: by_color[pixels[x,y]][y].add(x)
    parts=[]
    for color,rows in sorted(by_color.items()):
        spans=defaultdict(list)
        for y,xs in sorted(rows.items()):
            values=sorted(xs); start=last=values[0]
            for x in values[1:]+[None]:
                if x is not None and x==last+1: last=x; continue
                spans[start,last-start+1].append(y)
                if x is not None: start=last=x
        rectangles=[]
        for (x,width),ys in sorted(spans.items()):
            start=last=ys[0]
            for y in ys[1:]+[None]:
                if y is not None and y==last+1: last=y; continue
                rectangles.append(f'M{x} {start}h{width}v{last-start+1}h{-width}z')
                if y is not None: start=last=y
        parts.append({'color':'#'+''.join(f'{v:02x}' for v in color),'d':''.join(rectangles)})
    return parts


def add_connections(wiki):
    count=0
    for tree_id,tree in wiki['trees'].items():
        width,height,art=read_png(ROOT/tree['image'])
        assert (width,height)==(tree['width'],tree['height'])
        nodes=[s for s in wiki['skills'] if s['tree']==tree_id]; by_id={s['id']:s for s in nodes}
        # Artwork inside skill squares belongs to the node, not the connector.
        art={point:color for point,color in art.items() if not any(s['position']['left']<=point[0]<s['position']['left']+s['position']['width'] and s['position']['top']<=point[1]<s['position']['top']+s['position']['height'] for s in nodes)}
        for skill in nodes:
            skill['connections']=[]
            pos=skill['position']; end=(pos['left']+pos['width']/2,pos['top']-1)
            for group in skill['prerequisites']:
                parents=[by_id[key]['position'] for key in group]
                # Some branches leave the side of a skill square, not its bottom.
                lower=min(p['top'] for p in parents)
                pixels={point:color for point,color in art.items() if lower<=point[1]<pos['top']+pos['height']}
                def ports(rect):
                    return [point for point in pixels if rect['left']-3<=point[0]<=rect['left']+rect['width']+2 and rect['top']-3<=point[1]<=rect['top']+rect['height']+2]
                def border_distance(rect,point):
                    return max(rect['left']-point[0],0,point[0]-(rect['left']+rect['width']-1))+max(rect['top']-point[1],0,point[1]-(rect['top']+rect['height']-1))
                roots=sorted(ports(pos),key=lambda point:(border_distance(pos,point),(point[0]-end[0])**2+(point[1]-end[1])**2,point))
                # Two dark outline pixels can separate a gemstone from its arm.
                offsets=sorted([(dx,dy) for dx in range(-3,4) for dy in range(-3,4) if dx or dy],key=lambda d:(max(abs(d[0]),abs(d[1])),d))
                visited=set(); targets=None
                for root in roots:
                    if root in visited: continue
                    previous={root:None}; distances={root:0}; queue=deque([root])
                    while queue:
                        x,y=queue.popleft()
                        for dx,dy in offsets:
                            point=x+dx,y+dy
                            if point in pixels and point not in previous:
                                previous[point]=(x,y); distances[point]=distances[x,y]+1; queue.append(point)
                    candidates=[[point for point in ports(parent) if point in previous] for parent in parents]
                    if all(candidates):
                        targets=[min(points,key=lambda point:(border_distance(parent,point),distances[point],point)) for parent,points in zip(parents,candidates)]
                        break
                    visited.update(previous)
                if targets is None: raise ValueError(f'Untraceable connector: {skill["id"]} from {group}')
                paths=[]
                for target in targets:
                    path=[]; point=target
                    while point is not None: path.append(point); point=previous[point]
                    paths.append(list(reversed(path)))
                def corridor(path):
                    result=set()
                    for a,b in zip(path,path[1:]+path[-1:]):
                        for x in range(min(a[0],b[0])-1,max(a[0],b[0])+2):
                            for y in range(min(a[1],b[1])-1,max(a[1],b[1])+2):
                                if (x,y) in pixels: result.add((x,y))
                    return result
                join=set()
                if len(paths)>1:
                    shared=[]
                    for points in zip(*paths):
                        if len(set(points))!=1: break
                        shared.append(points[0])
                    join=corridor(shared)
                    if shared:
                        x,y=shared[-1]
                        gem=[point for point,color in pixels.items() if color!=(193,154,255) and abs(point[0]-x)<=10 and abs(point[1]-y)<=10]
                        if gem:
                            x0,x1=min(p[0] for p in gem)-2,max(p[0] for p in gem)+2
                            y0,y1=min(p[1] for p in gem)-2,max(p[1] for p in gem)+2
                            join.update(point for point in pixels if x0<=point[0]<=x1 and y0<=point[1]<=y1)
                skill['connections'].append({'branches':[{'parent':key,'parts':vector_parts(corridor(path)-join,pixels)} for key,path in zip(group,paths)],'join':vector_parts(join,pixels)})
                count+=len(group)
    return count
