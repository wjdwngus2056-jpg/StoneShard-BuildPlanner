const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const P=require('../planner.js');
const D=require('../data.js');
const S=require('../sharing.js');
const source=fs.readFileSync(path.join(__dirname,'../community.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const id='22222222-2222-4222-8222-222222222222',owner='11111111-1111-4111-8111-111111111111';
function fixture({hash='#builder',loggedIn=false,configured=true,publishedBuild=P.demo()}={}){
  const nodes=new Map(),docEvents=new Map(),winEvents=new Map(),storage=new Map(),calls=[];
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  function node(selector){
    if(nodes.has(selector))return nodes.get(selector);
    if(selector.startsWith('#'))assert.ok(ids.has(selector.slice(1)),`Unknown UI selector ${selector}`);
    let markup='';const events=new Map(),classes=new Set();
    const element={value:'',textContent:'',hidden:false,disabled:false,checked:false,open:false,dataset:{},
      get innerHTML(){return markup;},set innerHTML(value){markup=value;if(selector==='#publish-target')element.value=value.match(/<option value="([^"]+)" selected/)?.[1]||'';},
      classList:{toggle:(key,value)=>value?classes.add(key):classes.delete(key)},
      addEventListener:(name,fn)=>events.set(name,fn),showModal(){element.open=true;},close(){element.open=false;},focus(){},select(){},
      fire:name=>events.get(name)?.({target:element,preventDefault(){}})};
    nodes.set(selector,element);return element;
  }
  let current=null,plan=P.demo(),hashValue=hash;
  const location={origin:'https://example.pages.dev',pathname:'/',search:'',get hash(){return hashValue;},set hash(value){const next=value.startsWith('#')?value:`#${value}`;if(next===hashValue)return;hashValue=next;queueMicrotask(()=>winEvents.get('hashchange')?.());},get href(){return `${location.origin}${location.pathname}${location.search}${hashValue}`;}};
  let published={...S.publication(publishedBuild,'작성자','<script>소개</script>'),id,owner_id:owner,created_at:'2026-10-21T00:00:00Z',updated_at:'2026-10-21T00:00:00Z'};
  const session=loggedIn?{user:{id:owner,user_metadata:{full_name:'작성자'}}}:null;
  const api={configured,session:async()=>session,watch:async()=>{},list:async options=>{calls.push(['list',options]);return {items:[S.readCard({...published,investment_events:published.build.events})],count:1};},get:async key=>{calls.push(['get',key]);return published;},
    signIn:async url=>calls.push(['signIn',url]),signOut:async()=>{},remove:async key=>calls.push(['remove',key]),
    save:async(build,author,summary,target)=>{calls.push(['save',build,author,summary,target]);published={...S.publication(build,author,summary),id,owner_id:owner,created_at:published.created_at,updated_at:published.updated_at};return published;}};
  const editor={getBuild:()=>structuredClone(plan),getPublic:()=>current?structuredClone(current):null,
    openPublic:row=>{current=structuredClone(row);calls.push(['open',row.id]);window.WayfarerCommunity?.editorChanged();},
    returnPrivate:()=>{current=null;window.WayfarerCommunity?.editorChanged();},
    copyPublic:()=>{if(current)plan=structuredClone(current.build);current=null;window.WayfarerCommunity?.editorChanged();},
    notify:value=>calls.push(['notice',value])};
  const window={WAYFARER_DATA:D,WayfarerPlanner:P,WayfarerSharing:S,WayfarerEditor:editor,WayfarerCloud:{create:()=>api},WAYFARER_CLOUD:{},location,
    history:{replaceState:(_a,_b,value)=>{calls.push(['replace',value]);hashValue=new URL(value,location.origin).hash;}},addEventListener:(name,fn)=>winEvents.set(name,fn)};
  vm.runInNewContext(source,{window,document:{querySelector:node,addEventListener:(name,fn)=>docEvents.set(name,fn)},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},navigator:{},URL,console});
  return {node,calls,api,editor,window,setPlan:value=>{plan=value;},click:dataset=>docEvents.get('click')({target:{closest:()=>({dataset})}})};
}
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
test('direct public links survive initial account rendering and open without login',async()=>{
  const ui=fixture({hash:`#build=${id}`});await settle();
  assert.ok(ui.calls.some(call=>call[0]==='get'&&call[1]===id));
  assert.ok(ui.calls.some(call=>call[0]==='open'&&call[1]===id));
  assert.ok(!ui.calls.some(call=>call[0]==='replace'));
  assert.equal(ui.node('.workspace').hidden,false);assert.equal(ui.node('#public-build-banner').hidden,false);
  assert.equal(ui.node('#public-edit').hidden,true);
});
test('public lists are available anonymously and untrusted card text stays escaped',async()=>{
  const ui=fixture({hash:'#community'});await settle();
  assert.equal(ui.node('#community-page').hidden,false);assert.equal(ui.node('.workspace').hidden,true);
  const markup=ui.node('#community-list').innerHTML;
  assert.ok(markup.includes('&lt;script&gt;소개&lt;/script&gt;'));assert.ok(!markup.includes('<script>'));
  assert.ok(!markup.includes('data-public-delete'));assert.equal(ui.node('#community-mine').disabled,true);
});
test('logged-out publication never uploads data and requests Google login explicitly',async()=>{
  const ui=fixture();await settle();ui.node('#open-publish').fire('click');await settle();
  assert.equal(ui.node('#publish-dialog').open,true);assert.equal(ui.node('#publish-submit').disabled,true);
  await ui.node('#publish-form').fire('submit');assert.ok(!ui.calls.some(call=>call[0]==='save'));
  ui.node('#publish-sign-in').fire('click');await settle();
  assert.ok(ui.calls.some(call=>call[0]==='signIn'&&call[1]==='https://example.pages.dev/#publish'));
});
test('explicit logged-in submission includes shared final equipment and tier tactics in its public share link',async()=>{
  const ui=fixture({loggedIn:true});await settle();
  const plan=P.fresh('hilda');plan.tierPlans[3].description='운영';plan.equipmentPlan.equipment.mainHand='창';plan.equipmentPlan.recommendedEnchantments='명중률';plan.equipmentPlan.equipmentNotes='선택 이유';plan.souvenirs=['gulon-liver'];ui.setPlan(plan);
  ui.node('#open-publish').fire('click');await settle();
  ui.node('#publish-author').value='빌더';ui.node('#publish-summary').value='내 소개';
  await ui.node('#publish-form').fire('submit');await settle();
  const save=ui.calls.find(call=>call[0]==='save');assert.ok(save);
  assert.deepEqual(save[1].tierPlans,plan.tierPlans);assert.deepEqual(save[1].equipmentPlan,plan.equipmentPlan);assert.deepEqual(save[1].souvenirs,plan.souvenirs);assert.equal(save[4],'');
  assert.equal(ui.node('#share-url').value,`https://example.pages.dev/#build=${id}`);assert.equal(ui.node('#share-dialog').open,true);
});
test('unconfigured public features report connection state instead of inventing a local public board',async()=>{
  const ui=fixture({hash:'#community',configured:false});await settle();
  assert.ok(!ui.calls.some(call=>call[0]==='list'));
  assert.equal(ui.node('#community-list').innerHTML,'');assert.ok(ui.node('#community-status').textContent.includes('준비 중'));
});


test('public cards show icons and paid counts for all invested trees before opening the build',async()=>{
  const build=P.demo();build.events.push({id:'survival',level:10,type:'skill',key:'survival-cauterize-wounds'},
    {id:'book',level:10,type:'treatise',key:'athletics:1'},
    {id:'athletics',level:10,type:'skill',key:'athletics-disengage'});
  const ui=fixture({hash:'#community',publishedBuild:build});await settle();
  const markup=ui.node('#community-list').innerHTML;
  const badges=[...markup.matchAll(/role="listitem" aria-label="([^"]+) (\d+)개 투자"/g)].map(([,name,count])=>[name,Number(count)]);
  assert.deepEqual(badges,[['검',5],['방패',2],['체술',1],['생존',1]]);
  assert.equal((markup.match(/alt="" draggable="false"/g)||[]).length,4);
  assert.ok(!markup.includes('public-card-trees'));
  assert.ok(!ui.calls.some(call=>call[0]==='get'));
  assert.equal((markup.match(/<button/g)||[]).length,2);
  ui.click({publicOpen:id});await settle();
  assert.ok(ui.calls.some(call=>call[0]==='get'&&call[1]===id));
});

test('public cards with no paid skills omit investment badges instead of counting free starting skills',async()=>{
  const ui=fixture({hash:'#community',publishedBuild:P.fresh('dirwin')});await settle();
  const markup=ui.node('#community-list').innerHTML;
  assert.ok(!markup.includes('public-card-investments'));
  assert.ok(markup.includes('data-public-open='));
});
