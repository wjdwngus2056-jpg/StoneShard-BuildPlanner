const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../data.js');
const P=require('../planner.js');

test('souvenir data preserves the supplied signs, units and strongest values',()=>{
  assert.equal(D.souvenirs.options.length,12);assert.equal(D.souvenirs.limit,3);
  assert.equal(new Set(D.souvenirs.options.map(option=>option.id)).size,12);
  for(const [id,base,max,unit] of [
    ['gulon-liver',2,7,'%'],['troll-gland',-3,-10,'%'],
    ['bison-horns',3,10,''],['energy-horns',2,8,''],
    ['wolf-tongue',-3,-8,'%'],['moose-kidney',3,15,'%'],['rockeater-gland',3,20,'%']
  ]){
    const option=P.bySouvenir[id];
    assert.equal(option.base,base);assert.equal(option.max,max);assert.equal(option.unit,unit);
  }
  assert.equal(P.bySouvenir['energy-horns'].trophy,'사슴 뿔 / 산양 뿔');
});

test('Hilda selection normalization rejects unknown IDs, duplicates and a fourth effect',()=>{
  const build=P.fresh('hilda');
  build.souvenirs=['invalid','gulon-liver','gulon-liver',null,'__proto__','troll-gland','bear-fat','energy-horns'];
  const original=[...build.souvenirs];
  const normalized=P.normalize(build);
  assert.deepEqual(normalized.souvenirs,['gulon-liver','troll-gland','bear-fat']);
  assert.deepEqual(P.replay(normalized).souvenirs.map(option=>option.id),normalized.souvenirs);
  assert.deepEqual(P.normalize(normalized),normalized);
  assert.deepEqual(build.souvenirs,original);
});

test('other characters never inherit Hilda souvenir effects',()=>{
  for(const hero of D.characters.filter(hero=>hero.id!=='hilda')){
    const build=P.fresh(hero.id);build.souvenirs=['gulon-liver','troll-gland','bear-fat'];
    assert.deepEqual(P.replay(build).souvenirs,[]);
    assert.deepEqual(P.normalize(build).souvenirs,[]);
  }
});

test('older saves and malformed souvenir containers start with no selection',()=>{
  for(const value of [undefined,null,'gulon-liver',{},42]){
    const build=P.fresh('hilda');build.souvenirs=value;
    assert.deepEqual(P.normalize(build).souvenirs,[]);
  }
});

test('saved Hilda choices retain base and max ranges without assuming kills or altering points',()=>{
  const build=P.fresh('hilda');build.level=20;
  const before=P.replay(build);
  build.souvenirs=['gulon-liver','troll-gland','energy-horns'];
  const restored=P.normalize(JSON.parse(JSON.stringify(build))),after=P.replay(restored);
  assert.deepEqual(restored.souvenirs,build.souvenirs);
  assert.equal(after.souvenirs[0].base,2);assert.equal(after.souvenirs[0].max,7);
  assert.deepEqual(after.values,before.values);assert.deepEqual(after.permanentBonuses,before.permanentBonuses);
  assert.equal(after.statPoints,before.statPoints);assert.equal(after.skillPoints,before.skillPoints);
  assert.deepEqual(P.replay(restored,1).souvenirs,after.souvenirs);
});
