const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../planner.js');
const D=require('../data.js');
function legacy(){
  const build=P.demo();delete build.equipmentPlan;delete build.legacyEquipmentPlans;
  for(const tier of D.guide.tiers)Object.assign(build.tierPlans[tier],{equipment:{},enchantments:{},equipmentNotes:''});
  return build;
}
test('fresh builds have tactics-only tiers and one independent final equipment plan',()=>{
  const build=P.fresh('dirwin');
  assert.deepEqual(Object.keys(build.tierPlans),['1','2','3','4','5']);
  for(const plan of Object.values(build.tierPlans))assert.deepEqual(plan,{description:''});
  assert.deepEqual(Object.keys(build.equipmentPlan.equipment),D.guide.equipmentSlots.map(slot=>slot.id));
  assert.equal(build.equipmentPlan.recommendedEnchantments,'');assert.equal(build.equipmentPlan.equipmentNotes,'');
  build.equipmentPlan.equipment.mainHand='최종 검';build.tierPlans[1].description='기력을 관리하면서 교전';
  assert.equal(build.tierPlans[2].description,'');assert.equal(P.fresh().equipmentPlan.equipment.mainHand,'');
});
test('final equipment and all tier tactics survive save and restore independently of the selected level',()=>{
  const build=P.demo();
  for(const tier of D.guide.tiers)build.tierPlans[tier].description=`${tier}티어 운영\n<메모> & "옵션"`;
  for(const slot of D.guide.equipmentSlots)build.equipmentPlan.equipment[slot.id]=`최종 ${slot.name}`;
  build.equipmentPlan.recommendedEnchantments='무기: 명중률\n방어구: 기력 회복';build.equipmentPlan.equipmentNotes='투구부터 교체';
  const restored=P.normalize(JSON.parse(JSON.stringify(build)));assert.deepEqual(restored,build);
  restored.level=1;assert.deepEqual(P.normalize(restored).equipmentPlan,build.equipmentPlan);
});
test('legacy builds without guidance gain empty plans while keeping investments and source saves intact',()=>{
  const old={schemaVersion:2,characterId:'arna',name:'기존 빌드',level:3,events:[{id:'old-stat',level:2,type:'stat',key:'strength'}]};
  const before=JSON.stringify(old),restored=P.normalize(old);
  assert.equal(restored.equipmentPlan.equipment.ringRight,'');assert.equal(restored.tierPlans[5].description,'');
  assert.equal(P.replay(restored).spentStats,1);assert.equal(P.replay(restored).statPoints,1);
  assert.equal(JSON.stringify(old),before);assert.deepEqual(P.normalize(restored),restored);
});
test('old tier equipment migrates from the highest populated tier per field and preserves every earlier record',()=>{
  const old=legacy();old.tierPlans[1].equipment.mainHand='초반 검';old.tierPlans[1].equipmentNotes='초반 교체 설명';
  old.tierPlans[3].equipment.offHand='방패';old.tierPlans[3].enchantments.offHand='막기 확률';
  old.tierPlans[4].enchantments.mainHand='명중률';old.tierPlans[5].equipment.mainHand='최종 검';old.tierPlans[5].equipmentNotes='최종 장비 설명';
  old.tierPlans[2].description='2티어 운영';const before=JSON.stringify(old),restored=P.normalize(old);
  assert.equal(restored.equipmentPlan.equipment.mainHand,'최종 검');assert.equal(restored.equipmentPlan.equipment.offHand,'방패');
  assert.equal(restored.equipmentPlan.recommendedEnchantments,'주무기: 명중률\n보조 무기·방패: 막기 확률');
  assert.equal(restored.equipmentPlan.equipmentNotes,'최종 장비 설명');assert.equal(restored.legacyEquipmentPlans[1].equipment.mainHand,'초반 검');
  assert.equal(restored.legacyEquipmentPlans[1].equipmentNotes,'초반 교체 설명');assert.deepEqual(restored.tierPlans[2],{description:'2티어 운영'});
  assert.deepEqual(restored.events,old.events);assert.equal(JSON.stringify(old),before);assert.deepEqual(P.normalize(restored),restored);
});
test('clearing migrated fields stays cleared after reloading while the archive remains available',()=>{
  const old=legacy();old.tierPlans[5].equipment.mainHand='최종 창';old.tierPlans[5].enchantments.mainHand='명중률';old.tierPlans[5].equipmentNotes='이전 메모';
  const migrated=P.normalize(old);migrated.equipmentPlan.equipment.mainHand='';migrated.equipmentPlan.recommendedEnchantments='';migrated.equipmentPlan.equipmentNotes='';
  const restored=P.normalize(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(restored.equipmentPlan,P.fresh().equipmentPlan);assert.equal(restored.legacyEquipmentPlans[5].equipment.mainHand,'최종 창');
  assert.deepEqual(P.normalize(restored),restored);
});
test('invalid content is bounded for tactics, current equipment and archived legacy fields',()=>{
  const input=P.fresh();
  input.tierPlans={1:{description:'운'.repeat(7000),equipmentNotes:'장'.repeat(3000),equipment:{mainHand:'검'.repeat(200),offHand:{bad:1},unknown:'ignored'},enchantments:{mainHand:'인'.repeat(300)}},2:{description:42},3:null,4:'invalid',6:{description:'outside'}};
  input.equipmentPlan={equipment:{head:'모'.repeat(200),feet:42,unknown:'ignored'},recommendedEnchantments:'인'.repeat(3000),equipmentNotes:{bad:1}};
  const normalized=P.normalize(input);
  assert.equal(normalized.tierPlans[1].description.length,D.guide.limits.description);assert.ok(!Object.hasOwn(normalized.tierPlans,'6'));
  assert.equal(normalized.equipmentPlan.equipment.head.length,D.guide.limits.equipment);assert.equal(normalized.equipmentPlan.equipment.feet,'');
  assert.equal(normalized.equipmentPlan.recommendedEnchantments.length,D.guide.limits.recommendedEnchantments);assert.equal(normalized.equipmentPlan.equipmentNotes,'');
  const archived=normalized.legacyEquipmentPlans[1];assert.equal(archived.equipmentNotes.length,D.guide.limits.equipmentNotes);
  assert.equal(archived.equipment.mainHand.length,D.guide.limits.equipment);assert.equal(archived.enchantments.mainHand.length,D.guide.limits.enchantments);
  assert.equal(archived.equipment.offHand,'');assert.ok(!Object.hasOwn(archived.equipment,'unknown'));assert.ok(!Object.hasOwn(normalized.equipmentPlan.equipment,'unknown'));
  for(const tier of [2,3,4,5])assert.deepEqual(normalized.tierPlans[tier],{description:''});
});
test('older combined equipment strings survive migration and enchantment-free archives are supported',()=>{
  const old=legacy();old.tierPlans[1].equipment.mainHand='기존 검 / 명중률 우선';old.tierPlans[1].equipmentNotes='기존 선택 이유';
  for(const plan of Object.values(old.tierPlans))delete plan.enchantments;
  const restored=P.normalize(old);
  assert.equal(restored.equipmentPlan.equipment.mainHand,'기존 검 / 명중률 우선');assert.equal(restored.equipmentPlan.equipmentNotes,'기존 선택 이유');
  assert.equal(restored.equipmentPlan.recommendedEnchantments,'');assert.ok(Object.values(restored.legacyEquipmentPlans[1].enchantments).every(value=>value===''));
});
test('normalizing invalid investments preserves all authored text and independent equipment objects',()=>{
  const build=P.fresh();build.tierPlans[3].description='회피보다 방어';build.equipmentPlan.equipmentNotes='투구부터 교체';build.equipmentPlan.equipment.head='이전 투구도 가능';
  build.events=[{id:'invalid',level:1,type:'stat',key:'strength'}];const normalized=P.normalize(build);
  assert.equal(normalized.events.length,0);assert.deepEqual(normalized.tierPlans,build.tierPlans);assert.deepEqual(normalized.equipmentPlan,build.equipmentPlan);
  normalized.equipmentPlan.equipment.head='새 투구';assert.equal(build.equipmentPlan.equipment.head,'이전 투구도 가능');
});
test('equipment and tactics never alter point budgets, attributes or skill effects',()=>{
  const build=P.demo(),before=P.replay(build);build.equipmentPlan.equipment.mainHand='근력 +100 메모';build.tierPlans[5].description='30레벨 운영';
  const after=P.replay(P.normalize(build));assert.deepEqual(after.values,before.values);assert.deepEqual(after.learned,before.learned);
  assert.equal(after.statPoints,before.statPoints);assert.equal(after.skillPoints,before.skillPoints);
});

test('overview migration is independent of tier plans and bounds untrusted text without mutating saves', () => {
  const legacy=P.demo();delete legacy.overview;
  const before=JSON.stringify(legacy),restored=P.normalize(legacy);
  assert.deepEqual(restored.overview,{features:'',pros:'',cons:''});
  assert.equal(JSON.stringify(legacy),before);assert.deepEqual(restored.events,legacy.events);
  assert.deepEqual(restored.tierPlans,legacy.tierPlans);
  const input={...legacy,overview:{features:'가'.repeat(5000),pros:42,cons:'단점\n메모',unknown:'무시'}};
  const clean=P.normalize(input);
  assert.equal(clean.overview.features.length,4000);assert.equal(clean.overview.pros,'');
  assert.equal(clean.overview.cons,'단점\n메모');assert.ok(!Object.hasOwn(clean.overview,'unknown'));
  clean.overview.cons='수정';assert.equal(input.overview.cons,'단점\n메모');
});
