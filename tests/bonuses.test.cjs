const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../data.js');
const P=require('../planner.js');
let sequence=0;
const event=(level,type,key,extra={})=>({id:`bonus-${++sequence}`,level,type,key,...extra});
const trait=(level,character)=>event(level,'trait',P.character(character).statBonus.key);
const circle=(level,choice='emerald')=>event(level,'reward','boulder-circle',{choice});

test('optional stat traits add their fixed maximum only from the acquisition level',()=>{
  for(const [character,max] of [['jorgrim',5],['velmir',4],['dirwin',3]]){
    const build=P.fresh(character);build.level=5;
    assert.equal(P.replay(build).statBonus,0);assert.equal(P.replay(build).statPoints,4);
    build.events.push(trait(5,character));
    assert.equal(P.replay(build,4).statBonus,0);assert.equal(P.replay(build,4).statPoints,3);
    assert.equal(P.replay(build).statBonus,max);assert.equal(P.replay(build).statPoints,4+max);
    assert.equal(P.replay(build,30).statPoints,29+max);
  }
});
test('a trait cannot be duplicated or transferred to another character',()=>{
  const build=P.fresh('jorgrim');build.events=[trait(1,'jorgrim'),trait(1,'jorgrim')];
  const normalized=P.normalize(build);assert.equal(normalized.events.length,1);assert.equal(P.replay(normalized).statPoints,5);
  normalized.characterId='arna';assert.equal(P.normalize(normalized).events.length,0);
  normalized.characterId='velmir';assert.equal(P.normalize(normalized).events.length,0);
});
test('every character can apply one Boulder Circle SP and exactly one gem effect',()=>{
  const expected={emerald:{health:5,energy:0,physicalResistance:0},sapphire:{health:0,energy:5,physicalResistance:0},ruby:{health:0,energy:0,physicalResistance:4}};
  for(const hero of D.characters)for(const [choice,bonuses] of Object.entries(expected)){
    const build=P.fresh(hero.id);build.events=[circle(1,choice)];
    const view=P.replay(build);
    assert.equal(view.eventBonus,1);assert.equal(view.statPoints,1);assert.equal(view.skillPoints,2);
    assert.deepEqual(view.permanentBonuses,bonuses,`${hero.id}/${choice}`);
    assert.deepEqual(view.values,Object.fromEntries(D.stats.map((s,i)=>[s.id,hero.values[i]])));
  }
});
test('a future event grants neither SP nor permanent gem effects in earlier levels',()=>{
  const build=P.fresh();build.level=8;
  build.events=[circle(8,'ruby'),event(7,'stat','strength')];
  assert.equal(P.replay(build,7).eventBonus,0);
  assert.equal(P.replay(build,7).permanentBonuses.physicalResistance,0);
  assert.equal(P.replay(build,8).eventBonus,1);
  assert.equal(P.replay(build,8).permanentBonuses.physicalResistance,4);
});
test('SP investments cannot borrow a bonus that has not been received yet',()=>{
  const build=P.fresh('jorgrim');build.events=[event(1,'stat','strength'),trait(1,'jorgrim'),event(1,'stat','strength')];
  let normalized=P.normalize(build);assert.equal(normalized.events.filter(e=>e.type==='stat').length,1);
  const circleBuild=P.fresh();circleBuild.events=[event(1,'stat','strength'),circle(2),event(2,'stat','strength'),event(2,'stat','strength')];
  normalized=P.normalize(circleBuild);assert.equal(normalized.events.filter(e=>e.type==='stat').length,2);
  assert.equal(P.replay(normalized,1).values.strength,11);
});
test('trait and event rewards combine independently and survive save/restore',()=>{
  const build=P.fresh('jorgrim');build.level=10;build.events=[trait(4,'jorgrim'),circle(5,'ruby'),event(5,'stat','strength')];
  const restored=P.normalize(JSON.parse(JSON.stringify(build)));
  let view=P.replay(restored);assert.equal(view.statPoints,14);assert.equal(view.statBonus,5);assert.equal(view.eventBonus,1);
  assert.equal(restored.rewardChoices['boulder-circle'],'ruby');
  restored.events=restored.events.filter(e=>e.type!=='trait');view=P.replay(P.normalize(restored));
  assert.equal(view.statBonus,0);assert.equal(view.eventBonus,1);assert.equal(view.permanentBonuses.physicalResistance,4);
});
test('gem changes do not duplicate SP; the selection is preserved while the reward is off',()=>{
  const build=P.fresh();build.events=[circle(1,'sapphire')];
  let normalized=P.normalize(build);assert.equal(normalized.rewardChoices['boulder-circle'],'sapphire');
  normalized.events[0].choice='ruby';normalized=P.normalize(normalized);
  assert.equal(P.replay(normalized).statPoints,1);assert.deepEqual(P.replay(normalized).permanentBonuses,{health:0,energy:0,physicalResistance:4});
  normalized.events=[];normalized=P.normalize(JSON.parse(JSON.stringify(normalized)));
  assert.equal(normalized.rewardChoices['boulder-circle'],'ruby');assert.equal(P.replay(normalized).eventBonus,0);
  normalized.events=[circle(1,normalized.rewardChoices['boulder-circle'])];
  assert.equal(P.replay(normalized).permanentBonuses.physicalResistance,4);
});
test('duplicate events, unknown rewards and invalid gems never grant extra points',()=>{
  const build=P.fresh();build.events=[circle(1,'ruby'),circle(1,'emerald'),circle(1,'invalid'),event(1,'reward','unknown',{choice:'ruby'}),event(1,'reward','__proto__',{choice:'ruby'})];
  const normalized=P.normalize(build);assert.equal(normalized.events.length,1);assert.equal(P.replay(normalized).statPoints,1);
});
test('removing a trait cascades through stat-based unlocks while a separate event remains',()=>{
  const build=P.fresh('jorgrim');build.level=2;
  build.events=[trait(1,'jorgrim'),circle(2,'emerald'),...Array.from({length:5},()=>event(1,'stat','strength')),event(1,'skill','sword-cleaving-strike'),event(1,'skill','sword-gloat')];
  assert.equal(P.replay(build).rejected.length,0);
  const before=P.replay(build).skillPoints;
  build.events=build.events.filter(e=>e.type!=='trait');
  const view=P.replay(P.normalize(build));
  assert.equal(view.spentStats,0);assert.equal(view.statBonus,0);assert.equal(view.eventBonus,1);
  assert.ok(view.learned.has('sword-cleaving-strike'));assert.ok(!view.learned.has('sword-gloat'));
  assert.equal(view.skillPoints,before+1);
});
test('the primary stat cap still applies with both SP rewards active',()=>{
  const build=P.fresh('jorgrim');build.level=30;
  build.events=[trait(1,'jorgrim'),circle(1),...Array.from({length:35},()=>event(30,'stat','strength'))];
  const view=P.replay(P.normalize(build));assert.equal(view.values.strength,30);assert.equal(view.statPoints,16);
});
test('Mahir grants AP for six qualified trees at most five times; SP stays separate',()=>{
  const build=P.fresh('mahir');build.level=30;
  const trees=['sword','axe','mace','two-handed-sword','two-handed-axe','staff'];
  build.events=[...P.validBooks].filter(key=>trees.includes(key.split(':')[0])).map(key=>event(1,'treatise',key));
  for(const tree of trees){
    const skills=D.skills.filter(s=>s.tree===tree).sort((a,b)=>a.position.top-b.position.top||a.position.left-b.position.left).slice(0,6);
    build.events.push(...skills.map(s=>event(30,'skill',s.id)));
  }
  const view=P.replay(build);
  assert.equal(view.rejected.length,0);assert.equal(view.spentSkills,36);assert.equal(view.bonus,5);assert.equal(view.skillPoints,0);assert.equal(view.statPoints,29);
});
test('Dirwin AP rewards exclude free skills while optional SP rewards are off',()=>{
  const build=P.fresh('dirwin');build.level=30;
  build.events=[event(1,'treatise','survival:1'),event(1,'treatise','survival:2'),...D.skills.filter(s=>s.tree==='survival'&&!P.character('dirwin').free.includes(s.id)).map(s=>event(30,'skill',s.id))];
  const view=P.replay(build);assert.equal(view.rejected.length,0);assert.equal(view.spentSkills,9);assert.equal(view.bonus,3);assert.equal(view.statPoints,29);
});

test('Dirwin optional SP, automatic AP and event rewards remain independent after save/restore',()=>{
  const build=P.fresh('dirwin');build.level=30;
  build.events=[event(1,'treatise','survival:1'),event(1,'treatise','survival:2'),trait(5,'dirwin'),circle(6,'ruby'),...D.skills.filter(s=>s.tree==='survival'&&!P.character('dirwin').free.includes(s.id)).map(s=>event(30,'skill',s.id))];
  const restored=P.normalize(JSON.parse(JSON.stringify(build)));
  assert.equal(restored.events.length,build.events.length);
  assert.equal(P.replay(restored,4).statBonus,0);assert.equal(P.replay(restored,5).statBonus,3);
  let view=P.replay(restored);
  assert.equal(view.rejected.length,0);assert.equal(view.statBonus,3);assert.equal(view.statPoints,33);
  assert.equal(view.bonus,3);assert.equal(view.skillPoints,25);assert.equal(view.eventBonus,1);assert.equal(view.permanentBonuses.physicalResistance,4);
  restored.events=restored.events.filter(e=>e.type!=='trait');
  const withoutTrait=P.normalize(restored);view=P.replay(withoutTrait);
  assert.equal(view.statBonus,0);assert.equal(view.statPoints,30);
  assert.equal(view.bonus,3);assert.equal(view.skillPoints,25);assert.equal(view.spentSkills,9);
  assert.equal(view.eventBonus,1);assert.equal(view.permanentBonuses.physicalResistance,4);
  withoutTrait.events.push(trait(5,'dirwin'),trait(5,'dirwin'));
  view=P.replay(P.normalize(withoutTrait));assert.equal(view.statBonus,3);assert.equal(view.statPoints,33);
});
test('old builds load with optional rewards off and their investments intact',()=>{
  const old={schemaVersion:2,characterId:'jorgrim',level:4,name:'기존 빌드',events:[event(2,'stat','strength'),event(3,'stat','perception')]};
  const build=P.normalize(old),view=P.replay(build);
  assert.equal(build.events.length,2);assert.equal(view.statBonus,0);assert.equal(view.eventBonus,0);assert.equal(view.statPoints,1);
  assert.equal(build.name,old.name);assert.deepEqual(P.normalize(build),build);
});


test('learned totals include each starting skill while Dirwin AP rewards still count direct investment only',()=>{
  const D=require('../data.js');
  for(const hero of D.characters){
    const view=P.replay(P.fresh(hero.id));
    assert.deepEqual(view.learnedCounts,{survival:hero.free.length});
    assert.deepEqual(view.counts,{});assert.equal(view.spentSkills,0);
  }
  const build=P.fresh('dirwin');build.level=2;
  build.events=[{id:'book',level:1,type:'treatise',key:'survival:1'},
    {id:'first',level:1,type:'skill',key:'survival-cauterize-wounds'},
    {id:'second',level:1,type:'skill',key:'survival-austerity'}];
  const first=P.replay(build);
  assert.equal(first.learnedCounts.survival,4);assert.equal(first.counts.survival,2);
  assert.equal(first.bonus,0);assert.equal(first.skillPoints,1);
  build.events.push({id:'third',level:2,type:'skill',key:'survival-first-aid'});
  const next=P.replay(build);
  assert.equal(next.learnedCounts.survival,5);assert.equal(next.counts.survival,3);
  assert.equal(next.bonus,1);assert.equal(next.skillPoints,1);
  assert.equal(Object.values(next.learnedCounts).reduce((a,b)=>a+b,0),next.learned.size);
});
