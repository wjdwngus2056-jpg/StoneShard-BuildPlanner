(function(root){
  'use strict';
  const D=root.WAYFARER_DATA||(typeof require!=='undefined'?require('./data.js'):null);
  const P=root.WayfarerPlanner||(typeof require!=='undefined'?require('./planner.js'):null);
  const limits={title:60,author:30,summary:240,bytes:262144,events:500,pageSize:18};
  const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  function canonicalBuild(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||input.schemaVersion!==2)throw new Error('지원하지 않는 빌드 형식입니다.');
    if(!D.characters.some(hero=>hero.id===input.characterId))throw new Error('캐릭터 정보를 확인해주세요.');
    if(!Array.isArray(input.events)||input.events.length>limits.events)throw new Error('투자 내역이 올바르지 않습니다.');
    if(new TextEncoder().encode(JSON.stringify(input)).length>limits.bytes)throw new Error('빌드의 내용이 너무 큽니다. 설명을 조금 줄여주세요.');
    return P.normalize(input);
  }
  function publication(build,author,summary=''){
    const plan=canonicalBuild(build),title=plan.name.trim();
    const authorName=typeof author==='string'?author.trim():'';
    const excerpt=typeof summary==='string'?summary.trim():'';
    if(!title)throw new Error('공개할 빌드 이름을 입력해주세요.');
    if(!authorName||authorName.length>limits.author)throw new Error(`작성자 이름은 1~${limits.author}자로 입력해주세요.`);
    if(excerpt.length>limits.summary)throw new Error(`한 줄 소개는 ${limits.summary}자 이내로 입력해주세요.`);
    plan.name=title;
    const level=Math.max(plan.level,...plan.events.map(event=>event.level));
    const view=P.replay(plan,30);
    const trees=D.trees.filter(tree=>view.counts[tree.id]).sort((a,b)=>view.counts[b.id]-view.counts[a.id]).slice(0,3).map(tree=>tree.id);
    return {title,author_name:authorName,summary:excerpt,character_id:plan.characterId,level,trees,build:plan};
  }
  function readPublication(row){
    if(!row||!validId(row.id)||!validId(row.owner_id))throw new Error('공개 빌드 정보를 읽을 수 없습니다.');
    const payload=publication(row.build,row.author_name,row.summary);
    return {...payload,id:row.id,owner_id:row.owner_id,created_at:typeof row.created_at==='string'?row.created_at:'',updated_at:typeof row.updated_at==='string'?row.updated_at:''};
  }
  function readCard(row){
    if(!row||!validId(row.id)||!validId(row.owner_id)||!D.characters.some(hero=>hero.id===row.character_id))throw new Error('빌드 목록을 읽을 수 없습니다.');
    const text=(value,limit)=>typeof value==='string'?value.slice(0,limit):'';
    // Read only the event projection, so older publications need no migration.
    const events=Array.isArray(row.investment_events)&&row.investment_events.length<=limits.events?row.investment_events:[];
    const plan=P.normalize({schemaVersion:2,characterId:row.character_id,level:row.level,events});
    const {learnedCounts:counts}=P.replay(plan);
    const investments=D.trees.filter(tree=>counts[tree.id]>0).sort((a,b)=>counts[b.id]-counts[a.id]).map(tree=>({tree:tree.id,count:counts[tree.id]}));
    return {investments,id:row.id,owner_id:row.owner_id,title:text(row.title,limits.title),author_name:text(row.author_name,limits.author),summary:text(row.summary,limits.summary),character_id:row.character_id,level:P.clampLevel(row.level),trees:Array.isArray(row.trees)?[...new Set(row.trees)].filter(id=>Object.hasOwn(P.byTree,id)).slice(0,3):[],created_at:text(row.created_at,40),updated_at:text(row.updated_at,40)};
  }
  function buildLink(base,id){
    if(!validId(id))throw new Error('빌드 주소가 올바르지 않습니다.');
    const url=new URL(base);url.search='';url.hash=`build=${id}`;return url.href;
  }
  const api={limits,validId,canonicalBuild,publication,readPublication,readCard,buildLink};
  root.WayfarerSharing=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
