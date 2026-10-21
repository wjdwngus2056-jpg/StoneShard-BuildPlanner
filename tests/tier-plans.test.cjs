const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../planner.js');
const D = require('../data.js');

test('fresh builds have five independent tier plans and independent equipment slots', () => {
  const build = P.fresh('dirwin');
  assert.deepEqual(Object.keys(build.tierPlans), ['1','2','3','4','5']);
  for (const plan of Object.values(build.tierPlans)) {
    assert.equal(plan.description, '');
    assert.equal(plan.equipmentNotes, '');
    assert.deepEqual(Object.keys(plan.equipment), D.guide.equipmentSlots.map(slot => slot.id));
    assert.deepEqual(Object.keys(plan.enchantments), D.guide.equipmentSlots.map(slot => slot.id));
  }
  build.tierPlans[1].equipment.mainHand = '초반 무기';
  build.tierPlans[1].enchantments.mainHand = '명중률';
  build.tierPlans[1].description = '기력을 관리하면서 교전';
  assert.equal(build.tierPlans[2].equipment.mainHand, '');
  assert.equal(build.tierPlans[2].description, '');
  assert.equal(build.tierPlans[2].enchantments.mainHand, '');
  assert.equal(P.fresh('dirwin').tierPlans[1].description, '');
});

test('all tier notes and equipment survive save/restore independently of the selected level', () => {
  const build = P.demo();
  for (const tier of D.guide.tiers) {
    build.tierPlans[tier].description = `${tier}티어 운영\n기술 순서와 회복 시점 <메모> & "옵션"`;
    build.tierPlans[tier].equipmentNotes = `이전 장비를 유지하고 ${tier}번째 부위부터 교체`;
    for (const slot of D.guide.equipmentSlots) build.tierPlans[tier].equipment[slot.id] = `${tier}티어 ${slot.name}`;
    for (const slot of D.guide.equipmentSlots) build.tierPlans[tier].enchantments[slot.id] = `${tier}티어 ${slot.name} 인챈트`;
  }
  const restored = P.normalize(JSON.parse(JSON.stringify(build)));
  assert.deepEqual(restored.tierPlans, build.tierPlans);
  assert.deepEqual(restored.events, build.events);
  restored.level = 1;
  assert.deepEqual(P.normalize(restored).tierPlans, build.tierPlans);
  assert.deepEqual(P.normalize(restored).tierPlans[5].equipment, build.tierPlans[5].equipment);
});

test('legacy builds gain empty tier plans without changing investments or the source save', () => {
  const legacy = {schemaVersion:2,characterId:'arna',name:'기존 빌드',level:3,events:[{id:'old-stat',level:2,type:'stat',key:'strength'}]};
  const before = JSON.stringify(legacy), restored = P.normalize(legacy);
  assert.equal(restored.tierPlans[1].description, '');
  assert.equal(restored.tierPlans[5].equipment.ringRight, '');
  assert.equal(P.replay(restored).spentStats, 1);
  assert.equal(P.replay(restored).statPoints, 1);
  assert.equal(JSON.stringify(legacy), before);
  assert.deepEqual(P.normalize(restored), restored);
});

test('invalid tier content is dropped and text limits apply to every stored field', () => {
  const input = P.fresh();
  input.tierPlans = {
    1:{description:'운'.repeat(7000),equipmentNotes:'장'.repeat(3000),equipment:{mainHand:'검'.repeat(200),offHand:{name:'invalid'},unknown:'ignored'},enchantments:{mainHand:'인'.repeat(300),head:{invalid:true},unknown:'ignored'}},
    2:{description:{html:'invalid'},equipmentNotes:42,equipment:null},
    3:null,
    4:'invalid',
    5:{description:'유효한 운영',equipment:{head:'가죽 모자'}},
    6:{description:'범위 밖'}
  };
  const normalized = P.normalize(input);
  assert.equal(normalized.tierPlans[1].description.length, D.guide.limits.description);
  assert.equal(normalized.tierPlans[1].equipmentNotes.length, D.guide.limits.equipmentNotes);
  assert.equal(normalized.tierPlans[1].equipment.mainHand.length, D.guide.limits.equipment);
  assert.equal(normalized.tierPlans[1].equipment.offHand, '');
  assert.equal(normalized.tierPlans[1].enchantments.mainHand.length, D.guide.limits.enchantments);
  assert.equal(normalized.tierPlans[1].enchantments.head, '');
  assert.ok(!Object.hasOwn(normalized.tierPlans[1].enchantments,'unknown'));
  assert.ok(!Object.hasOwn(normalized.tierPlans[1].equipment,'unknown'));
  for (const tier of [2,3,4]) assert.equal(normalized.tierPlans[tier].description, '');
  assert.equal(normalized.tierPlans[5].description, '유효한 운영');
  assert.equal(normalized.tierPlans[5].equipment.head, '가죽 모자');
  assert.ok(!Object.hasOwn(normalized.tierPlans,'6'));
});

test('older combined equipment text is preserved while separate enchantment fields start empty', () => {
  const old = P.fresh();
  old.tierPlans[1].equipment.mainHand = '기존 검 / 명중률 우선';
  old.tierPlans[1].equipmentNotes = '기존 선택 이유';
  for (const plan of Object.values(old.tierPlans)) delete plan.enchantments;
  const restored = P.normalize(JSON.parse(JSON.stringify(old)));
  assert.equal(restored.tierPlans[1].equipment.mainHand, '기존 검 / 명중률 우선');
  assert.equal(restored.tierPlans[1].equipmentNotes, '기존 선택 이유');
  for (const plan of Object.values(restored.tierPlans)) assert.ok(Object.values(plan.enchantments).every(value=>value===''));
});

test('normalizing invalid investments never discards authored guidance', () => {
  const build = P.fresh();
  build.tierPlans[3].description = '회피보다 방어에 집중';
  build.tierPlans[3].equipmentNotes = '투구부터 교체';
  build.tierPlans[3].equipment.head = '이전 티어 투구도 사용 가능';
  build.events = [{id:'invalid',level:1,type:'stat',key:'strength'}];
  const normalized = P.normalize(build);
  assert.equal(normalized.events.length, 0);
  assert.deepEqual(normalized.tierPlans, build.tierPlans);
  normalized.tierPlans[3].equipment.head = '변경한 투구';
  assert.equal(build.tierPlans[3].equipment.head, '이전 티어 투구도 사용 가능');
});

test('tier equipment and notes never alter point budgets, attributes or skill effects', () => {
  const build = P.demo(), before = P.replay(build);
  build.tierPlans[1].equipment.mainHand = '근력 +100이라고 적은 메모';
  build.tierPlans[5].description = '30레벨 운영';
  const after = P.replay(P.normalize(build));
  assert.deepEqual(after.values, before.values);
  assert.deepEqual(after.learned, before.learned);
  assert.equal(after.statPoints, before.statPoints);
  assert.equal(after.skillPoints, before.skillPoints);
});
