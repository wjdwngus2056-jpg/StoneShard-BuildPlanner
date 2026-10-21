const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../planner.js');
const D = require('../data.js');
let sequence=0;
const event=(level,type,key)=>({id:String(++sequence),level,type,key});

test('level 1 and 30 budgets; demo is entirely valid',()=>{
  const build=P.fresh();
  assert.equal(P.replay(build).statPoints,0);assert.equal(P.replay(build).skillPoints,2);
  assert.equal(P.replay(build,30).statPoints,29);assert.equal(P.replay(build,30).skillPoints,31);
  assert.equal(P.demo().events.filter(e=>e.type==='skill').length,7);
  assert.equal(P.replay(P.demo(),30).rejected.length,0);
});
test('viewing an earlier level preserves future skills, stats and treatises',()=>{
  const build=P.demo();build.events.push(event(12,'treatise','survival:1'));
  const count=build.events.length;build.level=1;
  assert.equal(P.replay(build).learned.size,3);assert.equal(P.replay(build).values.strength,11);
  assert.equal(P.replay(build).books.size,0);assert.equal(P.normalize(build).events.length,count);
});
test('removing a prerequisite cascades to dependent skills and refunds AP',()=>{
  const build=P.demo(),before=P.replay(build).skillPoints;
  build.events=build.events.filter(e=>e.key!=='sword-cleaving-strike');
  const view=P.replay(P.normalize(build));
  assert.ok(!view.learned.has('sword-gloat'));assert.ok(view.learned.has('sword-fencer-stance'));assert.ok(view.skillPoints>before);
});
test('reading a specific treatise unlocks skills with insufficient attributes',()=>{
  const build=P.fresh('jorgrim');build.level=2;
  build.events=[event(1,'skill','sword-cleaving-strike')];
  assert.equal(P.availability(build,'sword-gloat').available,false);
  build.events.push(event(2,'treatise','sword:2'));
  const state=P.requirements(build,'sword-gloat');
  assert.equal(state.book,true);assert.equal(state.attributes,false);assert.equal(state.byLevel,false);
  assert.equal(P.availability(build,'sword-gloat').available,true);
  assert.equal(P.replay(build).skillPoints,2);
});
test('combined attributes include the character baseline and unlock without books',()=>{
  const build=P.fresh('jorgrim');build.level=6;
  build.events=[event(1,'skill','sword-cleaving-strike')];
  for(let level=2;level<=6;level++)build.events.push(event(level,'stat',level%2?'perception':'strength'));
  const state=P.requirements(build,'sword-gloat');
  assert.equal(state.current,8);assert.equal(state.attributes,true);assert.equal(state.book,false);
  assert.equal(P.availability(build,'sword-gloat').available,true);
});
test('wiki level alternative is applied independently of the book and stat routes',()=>{
  const build=P.fresh('jorgrim');build.level=10;build.events=[event(1,'skill','sword-cleaving-strike')];
  const state=P.requirements(build,'sword-gloat');
  assert.ok(state.byLevel);assert.ok(!state.book);assert.ok(!state.attributes);assert.ok(P.availability(build,'sword-gloat').available);
});
test('treatises are recorded at the level read and have no effect in the past',()=>{
  const build=P.fresh('jorgrim');build.level=3;
  build.events=[event(1,'skill','sword-cleaving-strike'),event(3,'treatise','sword:2')];
  build.level=2;assert.equal(P.availability(build,'sword-gloat').available,false);
  build.level=3;assert.equal(P.availability(build,'sword-gloat').available,true);
});
test('removing a book invalidates a skill learned before its other unlock conditions',()=>{
  const build=P.fresh('jorgrim');build.level=12;
  build.events=[event(1,'skill','sword-cleaving-strike'),event(2,'treatise','sword:2'),event(2,'skill','sword-gloat')];
  assert.equal(P.replay(build).rejected.length,0);
  build.events=build.events.filter(e=>e.type!=='treatise');
  assert.ok(!P.replay(P.normalize(build)).learned.has('sword-gloat'));
});
test('free learned skill is distinct from an unlocked starting tree; Dirwin bonus',()=>{
  const build=P.fresh('dirwin');assert.ok(P.replay(build).learned.has('survival-make-a-halt'));assert.equal(P.replay(build).skillPoints,2);
  build.level=2;build.events=[event(1,'treatise','survival:1'),event(1,'skill','survival-resourcefulness'),event(1,'skill','survival-pathfinder'),event(2,'skill','survival-cauterize-wounds')];
  const view=P.replay(build);assert.equal(view.rejected.length,0);assert.equal(view.bonus,1);assert.equal(view.skillPoints,1);
  assert.ok(P.requirements(P.fresh('arna'),'sword-cleaving-strike').affinity);
  assert.ok(!P.replay(P.fresh('arna')).learned.has('sword-cleaving-strike'));
});
test('every character starts with free Butchering and the full AP budget',()=>{
  for(const hero of D.characters){
    const build=P.fresh(hero.id),view=P.replay(build),state=P.requirements(build,'survival-butchering');
    assert.ok(view.learned.has('survival-butchering'),hero.id);
    assert.equal(view.skillPoints,2);assert.equal(view.spentSkills,0);assert.ok(state.free);
  }
});
test('old paid Butchering is refunded while valid dependent investments survive',()=>{
  const old=P.fresh('jorgrim');old.level=3;
  old.events=[event(1,'skill','survival-butchering'),event(2,'treatise','survival:1'),event(2,'skill','survival-resourcefulness')];
  const migrated=P.normalize(old),view=P.replay(migrated);
  assert.ok(!migrated.events.some(e=>e.type==='skill'&&e.key==='survival-butchering'));
  assert.ok(view.learned.has('survival-butchering'));assert.ok(view.learned.has('survival-resourcefulness'));
  assert.equal(view.spentSkills,1);assert.equal(view.skillPoints,3);assert.equal(view.rejected.length,0);
  assert.deepEqual(P.normalize(migrated),migrated);
});
test('Mahir receives one bonus per tree, including an incomplete larger tree',()=>{
  const build=P.fresh('mahir');build.level=5;
  build.events=[event(1,'treatise','sword:1'),event(1,'treatise','sword:2')];
  ['sword-cleaving-strike','sword-blade-maintenance','sword-keeping-distance','sword-gloat','sword-fencer-stance','sword-steady-tempo'].forEach((key,i)=>build.events.push(event(Math.max(1,i),'skill',key)));
  const view=P.replay(build);assert.equal(view.rejected.length,0);assert.equal(view.bonus,1);assert.equal(view.skillPoints,1);
});
test('later investments never borrow future points; primary stats capped at 30',()=>{
  const build=P.fresh();build.level=30;
  build.events=[event(2,'stat','strength'),event(2,'stat','agility')];
  assert.equal(P.normalize(build).events.length,1);
  build.events=Array.from({length:29},(_,i)=>event(i+2,'stat','strength'));
  assert.equal(P.replay(P.normalize(build)).values.strength,30);
});
test('legacy draft migration preserves stat history and replaces global books assumption',()=>{
  const old={characterId:'arna',level:10,name:'legacy',treatise:true,events:[event(1,'skill','sword-1'),event(2,'stat','strength')]};
  const build=P.normalize(old);assert.equal(build.schemaVersion,2);assert.ok(build.events.some(e=>e.key==='sword-cleaving-strike'));assert.ok(P.replay(build).books.has('sword:2'));
  assert.equal(P.normalize(build).events.length,build.events.length);
});
test('all imported assets, coordinates and prerequisite DAGs are complete',()=>{
  assert.equal(D.characters.length,8);assert.equal(D.trees.length,21);assert.equal(D.skills.length,228);
  assert.equal(D.trees.filter(tree=>tree.category==='weapon').length,11);
  assert.equal(D.trees.filter(tree=>tree.category==='utility').length,6);
  assert.equal(D.trees.filter(tree=>tree.category==='magic').length,4);
  for(const item of [...D.characters,...D.trees,...D.skills])assert.ok(fs.existsSync(path.join(__dirname,'..',item.image)),item.image);
  const seen=new Set(),visiting=new Set();
  function walk(key){if(seen.has(key))return;assert.ok(!visiting.has(key),'cycle '+key);visiting.add(key);for(const parent of P.bySkill[key].requires){assert.ok(P.bySkill[parent],parent);walk(parent);}visiting.delete(key);seen.add(key);}
  for(const skill of D.skills){walk(skill.id);const tree=P.byTree[skill.tree];assert.ok(skill.position.left>=0&&skill.position.top>=0&&skill.position.left+skill.position.width<=tree.width&&skill.position.top+skill.position.height<=tree.height);assert.ok(skill.name&&skill.name!==skill.english);}
});
test('starting affinities come only from the character section, never the page navigation',()=>{
  assert.ok(P.character('arna').affinity.includes('sword'));
  assert.ok(!P.character('arna').affinity.includes('pyromancy'));
  assert.ok(P.character('jonna').affinity.includes('pyromancy'));
  assert.ok(!P.character('jonna').affinity.includes('shield'));
  assert.ok(P.character('jorgrim').affinity.includes('two-handed-axe'));
  assert.ok(!P.requirements(P.fresh('jorgrim'),'survival-resourcefulness').affinity);
});
