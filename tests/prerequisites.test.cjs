const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../data.js');
const P=require('../planner.js');
const reference=require('../reference-data.json');
let sequence=0;
const event=(level,type,key)=>({id:`prereq-${++sequence}`,level,type,key});
function plan(tree,skills){
  const build=P.fresh('arna');build.level=10;
  build.events=[1,2,3,4].filter(tier=>P.validBooks.has(`${tree}:${tier}`)).map(tier=>event(1,'treatise',`${tree}:${tier}`));
  build.events.push(...skills.map((key,index)=>event(index+1,'skill',`${tree}-${key}`)));
  return build;
}

test('Austerity accepts Make a Halt or Cauterize Wounds independently',()=>{
  assert.equal(P.availability(plan('survival',[]),'survival-austerity').available,false);
  for(const parent of ['make-a-halt','cauterize-wounds']){
    const build=plan('survival',[parent,'austerity']),view=P.replay(build);
    assert.equal(view.rejected.length,0,parent);assert.ok(view.learned.has('survival-austerity'));
    const state=P.requirements(build,'survival-austerity');
    assert.equal(state.prerequisites.paths.filter(p=>p.met).length,1);assert.deepEqual(state.missing,[]);
  }
});
test('Adaptability accepts the Austerity branch or the First Aid branch',()=>{
  for(const branch of [['make-a-halt','austerity'],['cauterize-wounds','first-aid']]){
    const build=plan('survival',[...branch,'adaptability']);
    assert.equal(P.replay(build).rejected.length,0);
    assert.ok(P.replay(P.normalize(build)).learned.has('survival-adaptability'));
  }
});
test('Will to Survive requires First Aid; Austerity does not substitute for it',()=>{
  const wrong=plan('survival',['make-a-halt','austerity','will-to-survive']);
  assert.equal(P.availability(wrong,'survival-will-to-survive').available,false);
  assert.deepEqual(P.replay(wrong).rejected.map(e=>e.key),['survival-will-to-survive']);
  assert.match(P.availability(wrong,'survival-will-to-survive').reason,/응급 처치/);
  const right=plan('survival',['cauterize-wounds','first-aid','will-to-survive']);
  assert.equal(P.replay(right).rejected.length,0);
  assert.ok(P.replay(right).learned.has('survival-will-to-survive'));
  assert.ok(!P.replay(right).learned.has('survival-austerity'));
});
test('the free Butchering branch unlocks Pathfinder without Make a Halt',()=>{
  const build=plan('survival',['pathfinder']);
  assert.equal(P.replay(build).rejected.length,0);assert.ok(!P.replay(build).learned.has('survival-make-a-halt'));
});
test('a gem junction still requires both Onrush prerequisites',()=>{
  const left=['blade-maintenance','fencer-stance'],right=['keeping-distance','steady-tempo'];
  for(const branch of [left,right])assert.equal(P.availability(plan('sword',branch),'sword-onrush').available,false);
  const build=plan('sword',[...left,...right,'onrush']);
  assert.equal(P.replay(build).rejected.length,0);assert.ok(P.replay(build).learned.has('sword-onrush'));
  build.events=build.events.filter(e=>e.key!=='sword-steady-tempo');
  assert.ok(!P.replay(P.normalize(build)).learned.has('sword-onrush'));
});
test('removing one OR branch preserves its child; removing the final branch cascades and refunds',()=>{
  const build=plan('survival',['make-a-halt','cauterize-wounds','austerity','first-aid','adaptability','will-to-survive']);
  assert.equal(P.replay(build).rejected.length,0);
  build.events=build.events.filter(e=>e.key!=='survival-austerity');
  let normalized=P.normalize(build),view=P.replay(normalized);
  assert.ok(view.learned.has('survival-adaptability'));assert.ok(view.learned.has('survival-will-to-survive'));
  const before=view.skillPoints;
  normalized.events=normalized.events.filter(e=>e.key!=='survival-first-aid');
  view=P.replay(P.normalize(normalized));
  assert.ok(!view.learned.has('survival-adaptability'));assert.ok(!view.learned.has('survival-will-to-survive'));
  assert.equal(view.skillPoints,before+3);
});
test('prerequisites are evaluated at acquisition time and never borrow a future OR branch',()=>{
  const build=plan('survival',[]);
  build.events.push(event(1,'skill','survival-austerity'),event(2,'skill','survival-make-a-halt'));
  assert.ok(!P.replay(P.normalize(build)).learned.has('survival-austerity'));
});
test('all 228 prerequisite rules preserve source groups for every immediate-parent combination',()=>{
  const byReference=Object.fromEntries(D.skills.map(s=>[s.referenceId,s.id]));
  for(const skill of D.skills){
    const raw=reference.skills.find(s=>s.refId===skill.referenceId);
    const expected=raw.links.map(link=>link.data.map(edge=>byReference[edge.parent]));
    assert.deepEqual(skill.prerequisites,expected,skill.id);
    assert.deepEqual([...new Set(expected.flat())],skill.requires,skill.id);
    for(let mask=0;mask<2**skill.requires.length;mask++){
      const learned=new Set(skill.requires.filter((_,i)=>mask&(1<<i)));
      const expectedMet=!expected.length||expected.some(group=>group.every(id=>learned.has(id)));
      assert.equal(P.prerequisiteStatus(skill,learned).met,expectedMet,`${skill.id} mask=${mask}`);
    }
  }
  assert.equal(D.skills.filter(s=>s.prerequisites.length>1).length,16);
  assert.equal(D.skills.filter(s=>s.prerequisites.some(group=>group.length>1)).length,58);
});
test('compound alternative paths retain AND inside each path',()=>{
  const skill={requires:['a','b','c'],prerequisites:[['a','b'],['c']]};
  assert.ok(!P.prerequisiteStatus(skill,new Set(['a'])).met);
  assert.ok(!P.prerequisiteStatus(skill,new Set(['b'])).met);
  assert.ok(P.prerequisiteStatus(skill,new Set(['a','b'])).met);
  assert.ok(P.prerequisiteStatus(skill,new Set(['c'])).met);
});
test('the corrected Korean character name uses the existing stable ID',()=>{
  assert.equal(P.character('dirwin').name,'디르윈');
  assert.equal(D.stats.find(s=>s.id==='vitality').name,'생명력');
  assert.equal(P.fresh('dirwin').name,'디르윈의 새로운 여정');
  const old={...P.fresh('dirwin'),name:'내 저장 빌드'};
  assert.equal(P.normalize(old).characterId,'dirwin');assert.equal(P.normalize(old).name,'내 저장 빌드');
});
test('every prerequisite branch has an original-pixel mask and AND joints stay grouped',()=>{
  let branches=0;
  for(const skill of D.skills){
    assert.equal(skill.connections.length,skill.prerequisites.length,skill.id);
    for(const [i,connection] of skill.connections.entries()){
      assert.deepEqual(connection.branches.map(b=>b.parent),skill.prerequisites[i]);
      for(const branch of connection.branches){assert.ok(branch.parts.length,`${skill.id} <- ${branch.parent}`);branches++;}
      if(connection.branches.length>1)assert.ok(connection.join.length,`${skill.id} gem/stem`);
      for(const part of [...connection.branches.flatMap(b=>b.parts),...connection.join]){
        assert.match(part.color,/^#[0-9a-f]{6}$/);assert.match(part.d,/^M[\d hMvz-]+$/);
      }
    }
  }
  assert.equal(branches,257);
});
test('reference purchase and trainer locations are present without adding drop sources',()=>{
  const sword=D.trees.find(t=>t.id==='sword'),survival=D.trees.find(t=>t.id==='survival');
  assert.equal(sword.acquisition.trainer,'만샤이어 경비대장 (총독성채앞, 또는 1층)');
  assert.equal(sword.acquisition.purchases['1'],'만샤이어 집사 (총독성채 1층)');
  assert.equal(sword.acquisition.purchases['2'],'브린 인쇄소');
  assert.equal(survival.acquisition.trainer,null);
  for(const tree of D.trees){assert.equal(tree.acquisition.source,reference.source);assert.deepEqual(Object.keys(tree.acquisition.purchases),['1','2']);assert.ok(!Object.hasOwn(tree.acquisition,'drops'));}
});
