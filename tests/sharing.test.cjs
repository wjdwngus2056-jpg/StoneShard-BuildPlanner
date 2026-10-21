const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../planner.js');
const S=require('../sharing.js');
const C=require('../cloud.js');
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const settings={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_test'};
function row(){return {...S.publication(P.demo(),'작성자','설명'),id,owner_id:owner,created_at:'2026-10-21T00:00:00Z',updated_at:'2026-10-21T00:00:00Z'};}
function driver(response={data:row(),error:null}){
  const calls=[];let loggedIn=true;
  const query={};
  for(const name of ['select','order','eq','ilike','insert','update','delete'])query[name]=(...args)=>{calls.push([name,...args]);return query;};
  query.range=async(...args)=>{calls.push(['range',...args]);return response;};
  query.single=async()=>response;
  const client={from:table=>{calls.push(['from',table]);return query;},auth:{
    getUser:async()=>({data:{user:loggedIn?{id:owner}:null},error:null}),
    getSession:async()=>({data:{session:loggedIn?{user:{id:owner}}:null},error:null}),
    signInWithOAuth:async options=>{calls.push(['oauth',options]);return {error:null};},
    signOut:async options=>{calls.push(['logout',options]);return {error:null};}
  }};
  const cloud=C.create(settings,{loadSdk:async()=>({createClient:(...args)=>{calls.push(['client',...args]);return client;}})});
  return {cloud,calls,logout:()=>{loggedIn=false;}};
}
test('publication preserves every plan field and uses the highest planned level after viewing the past',()=>{
  const build=P.fresh('hilda');build.level=1;build.events=[{id:'future',level:20,type:'stat',key:'strength'}];
  build.souvenirs=['gulon-liver','troll-gland','energy-horns'];
  build.overview={features:'창을 사용하는 빌드\n운영 소개',pros:'긴 사거리',cons:'위치 선정 필요'};
  build.tierPlans[4].description='운영\n설명';build.equipmentPlan.equipment.mainHand='창';build.equipmentPlan.recommendedEnchantments='명중률';build.equipmentPlan.equipmentNotes='선택 이유';
  const payload=S.publication(build,' 작성자 ',' 소개 ');
  assert.equal(payload.level,20);assert.equal(payload.author_name,'작성자');assert.equal(payload.summary,'소개');
  assert.deepEqual(payload.build.tierPlans,build.tierPlans);assert.deepEqual(payload.build.souvenirs,build.souvenirs);
  assert.deepEqual(payload.build.overview,build.overview);assert.deepEqual(payload.build.equipmentPlan,build.equipmentPlan);
  assert.equal(build.level,1);
});
test('public payloads reject unsupported, oversized or malformed builds and metadata',()=>{
  assert.throws(()=>S.canonicalBuild({schemaVersion:99}));
  assert.throws(()=>S.canonicalBuild({...P.fresh(),characterId:'unknown'}));
  assert.throws(()=>S.canonicalBuild({...P.fresh(),extra:'가'.repeat(S.limits.bytes)}));
  assert.throws(()=>S.publication(P.fresh(),' '));assert.throws(()=>S.publication(P.fresh(),'a','a'.repeat(241)));
  assert.throws(()=>S.readPublication({...row(),owner_id:'invalid'}));
});
test('public card metadata is bounded and unknown trees never become UI selectors',()=>{
  const card=S.readCard({...row(),title:'가'.repeat(100),trees:['sword','__proto__','sword','unknown','shield']});
  assert.equal(card.title.length,60);assert.deepEqual(card.trees,['sword','shield']);
});
test('share links preserve repository subpaths while removing auth query parameters and old fragments',()=>{
  assert.equal(S.buildLink('https://example.com/planner/index.html?code=secret#community',id),`https://example.com/planner/index.html#build=${id}`);
  assert.throws(()=>S.buildLink('https://example.com','" onload="bad'));
});
test('cloud configuration accepts only public keys and keeps an unconfigured builder offline',()=>{
  assert.equal(C.create({}).configured,false);
  assert.deepEqual(C.configuration(settings),{url:'https://example.supabase.co',key:'sb_publishable_test'});
  assert.throws(()=>C.configuration({...settings,supabasePublishableKey:'sb_secret_private'}));
  const jwt=role=>`eyJ.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
  assert.ok(C.configuration({...settings,supabasePublishableKey:jwt('anon')}));
  assert.throws(()=>C.configuration({...settings,supabasePublishableKey:jwt('service_role')}));
  assert.throws(()=>C.configuration({...settings,supabaseUrl:'http://example.supabase.co'}));
});
test('anonymous listing requests only card metadata with bounded pagination and character filters',async()=>{
  const {cloud,calls}=driver({data:[row()],count:1,error:null});
  const result=await cloud.list({page:2,character:'arna',search:'검_100%'});
  assert.equal(result.items.length,1);assert.ok(calls.some(call=>call[0]==='range'&&call[1]===36&&call[2]===53));
  const select=calls.find(call=>call[0]==='select');assert.ok(!select[1].split(',').includes('build'));
  assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='character_id'&&call[2]==='arna'));
  assert.ok(calls.some(call=>call[0]==='ilike'&&call[2]==='%검\\_100\\%%'));
});
test('publishing sends no owner or timestamp fields; edits and deletes are scoped to the authenticated owner',async()=>{
  let env=driver();await env.cloud.save(P.demo(),'작성자','소개');
  const payload=env.calls.find(call=>call[0]==='insert')[1];
  for(const field of ['owner_id','id','created_at','updated_at'])assert.ok(!Object.hasOwn(payload,field));
  env=driver();await env.cloud.save(P.demo(),'작성자','소개',id);
  assert.ok(env.calls.some(call=>call[0]==='eq'&&call[1]==='owner_id'&&call[2]===owner));
  env=driver();await env.cloud.remove(id);
  assert.ok(env.calls.some(call=>call[0]==='eq'&&call[1]==='id'&&call[2]===id));
  assert.ok(env.calls.some(call=>call[0]==='eq'&&call[1]==='owner_id'&&call[2]===owner));
});
test('unauthenticated writes and missing-owner updates fail without claiming success',async()=>{
  const env=driver();env.logout();await assert.rejects(()=>env.cloud.save(P.demo(),'작성자',''),/로그인/);
  assert.ok(!env.calls.some(call=>call[0]==='insert'));
  const denied=driver({data:null,error:{code:'PGRST116'}});await assert.rejects(()=>denied.cloud.remove(id),/권한/);
});
test('Google login uses PKCE and signout is limited to this browser session',async()=>{
  const {cloud,calls}=driver();await cloud.signIn('https://example.com/#publish');await cloud.signOut();
  assert.equal(calls.find(call=>call[0]==='client')[3].auth.flowType,'pkce');
  assert.equal(calls.find(call=>call[0]==='oauth')[1].provider,'google');
  assert.equal(calls.find(call=>call[0]==='oauth')[1].options.redirectTo,'https://example.com/#publish');
  assert.equal(calls.find(call=>call[0]==='logout')[1].scope,'local');
});
