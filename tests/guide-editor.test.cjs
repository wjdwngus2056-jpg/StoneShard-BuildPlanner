const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const D = require('../data.js');
const P = require('../planner.js');
const E = require('../effects.js');
const storageKey = 'wayfarer-prototype-v1';
const appSource = fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');

// Exercise the real app event handlers and storage without a browser server.
// This small DOM substitute deliberately does not test layout or native focus.
function editor(initial = P.fresh()) {
  const elements = new Map(), handlers = new Map();
  const storage = new Map([[`${storageKey}-draft`,JSON.stringify(initial)]]);
  function element(selector) {
    if (elements.has(selector)) return elements.get(selector);
    const events = new Map(), classes = new Set(), attributes = new Map();
    let markup='', markupWrites=0;
    const node = {
      id:selector.slice(1),dataset:{},value:'',textContent:'',hidden:false,disabled:false,
      get innerHTML(){return markup;},set innerHTML(value){markup=value;markupWrites++;},get markupWrites(){return markupWrites;},
      classList:{add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key),toggle:(key,on)=>on?classes.add(key):classes.delete(key)},
      setAttribute:(key,value)=>attributes.set(key,String(value)),getAttribute:key=>attributes.get(key)??null,hasAttribute:key=>attributes.has(key),focus(){},scrollIntoView(){},showModal(){},close(){},
      addEventListener:(name,fn)=>events.set(name,fn),
      closest:()=>node,
      fire:name=>events.get(name)?.({target:node})
    };
    elements.set(selector,node);return node;
  }
  const document = {
    querySelector:element,querySelectorAll:selector=>selector==='#skill-tree [data-skill]'?
      [...element('#skill-tree').innerHTML.matchAll(/data-skill="([^"]+)" data-state="([^"]+)"/g)].map(([,skill,state])=>{
        const node=element(`#skill-tree [data-skill="${skill}"]`);node.dataset={skill,state};return node;
      }):[],
    addEventListener:(name,fn)=>handlers.set(name,fn)
  };
  const window={WAYFARER_DATA:D,WayfarerPlanner:P,WayfarerEffects:E};
  vm.runInNewContext(appSource,{
    window,document,
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){}
  });
  const click = (id,dataset={}) => {
    const button=element(`#${id}`);button.dataset=dataset;
    handlers.get('click')({target:button});
  };
  const input = (field,value,slot) => {
    const node=element(`#field-${field}-${slot??''}`);
    node.dataset={guideField:field,...(slot?{guideSlot:slot}:{})};node.value=value;
    handlers.get('input')({target:node});return node;
  };
  const skillClick = key => {
    const node=element(`#skill-tree [data-skill="${key}"]`);node.dataset.skill=key;
    handlers.get('click')({target:node});return node;
  };
  return {
    element,click,input,storage,skillClick,bridge:window.WayfarerEditor,
    equipment:(field,value,slot)=>{const node=element(`#equipment-${field}-${slot??''}`);node.dataset={equipmentField:field,...(slot?{equipmentSlot:slot}:{})};node.value=value;handlers.get('input')({target:node});return node;},
    overview:(field,value)=>{const node=element(`#overview-${field}`);node.dataset={overviewField:field};node.value=value;handlers.get('input')({target:node});return node;},
    doubleSkill:key=>{skillClick(key);const node=skillClick(key);handlers.get('dblclick')({target:node,preventDefault(){}});},
    blur:node=>handlers.get('focusout')({target:node}),
    souvenir:(key,checked)=>handlers.get('change')({target:{dataset:{souvenir:key},checked}}),
    build:()=>JSON.parse(storage.get(`${storageKey}-draft`)),
    undo:()=>element('#undo').fire('click'),
    save:()=>element('#save').fire('click'),
    key:(tier,key)=>handlers.get('keydown')({target:{matches:selector=>selector.includes('data-guide-tier'),dataset:{guideTier:String(tier)}},key,preventDefault(){}})
  };
}

test('continuous guide typing persists immediately without recreating the editor and undoes once', () => {
  const ui=editor(), markup=ui.element('#tier-guide-editor').innerHTML;
  ui.input('description','일');ui.input('description','일시 휴식으로');
  const field=ui.input('description','일시 휴식으로 기력을 회복합니다.');
  assert.equal(ui.build().tierPlans[1].description,'일시 휴식으로 기력을 회복합니다.');
  assert.equal(ui.element('#tier-guide-editor').innerHTML,markup);
  ui.blur(field);
  ui.undo();assert.equal(ui.build().tierPlans[1].description,'');
  assert.equal(ui.element('#undo').disabled,true);
});

test('one equipment plan survives tier switches and continuous edits undo independently of tactics', () => {
  const ui=editor(),writes=ui.element('#equipment-plan-editor').markupWrites;
  ui.equipment('equipment','검','mainHand');let field=ui.equipment('equipment','최종 검','mainHand');ui.blur(field);
  field=ui.equipment('recommendedEnchantments','명중률 / 기력 회복');ui.blur(field);
  field=ui.equipment('equipmentNotes','방어구부터 교체');ui.blur(field);
  ui.click('guide-tab-2',{guideTier:'2'});field=ui.input('description','좁은 통로 활용');ui.blur(field);
  assert.equal(ui.element('#equipment-plan-editor').markupWrites,writes);
  assert.equal(ui.build().equipmentPlan.equipment.mainHand,'최종 검');assert.equal(ui.build().equipmentPlan.recommendedEnchantments,'명중률 / 기력 회복');
  assert.deepEqual(ui.build().tierPlans[2],{description:'좁은 통로 활용'});
  assert.ok(!ui.element('#tier-guide-editor').innerHTML.includes('data-equipment-field'));
  ui.undo();assert.equal(ui.build().tierPlans[2].description,'');assert.equal(ui.build().equipmentPlan.equipmentNotes,'방어구부터 교체');
  ui.undo();assert.equal(ui.build().equipmentPlan.equipmentNotes,'');ui.undo();assert.equal(ui.build().equipmentPlan.recommendedEnchantments,'');
  ui.undo();assert.equal(ui.build().equipmentPlan.equipment.mainHand,'');assert.equal(ui.element('#final-equipment-count').textContent,'0 / 11개 부위 작성');
});
test('shared enchantment recommendations save independently from gear names and render as safe text', () => {
  const ui=editor();const field=ui.equipment('recommendedEnchantments','명중률 < 치명타 & 기력\n부위별 우선순위');ui.blur(field);
  assert.equal(ui.build().equipmentPlan.equipment.head,'');assert.equal(ui.element('#final-equipment-count').textContent,'0 / 11개 부위 작성');
  ui.save();const restored=editor(JSON.parse(ui.storage.get(storageKey))[0].build);
  assert.equal(restored.build().equipmentPlan.recommendedEnchantments,'명중률 < 치명타 & 기력\n부위별 우선순위');
  assert.ok(restored.element('#equipment-plan-editor').innerHTML.includes('명중률 &lt; 치명타 &amp; 기력'));
});

test('Hilda chooser enforces three selections, unlocks after removal, and saves both value ranges', () => {
  const ui=editor(P.fresh('hilda'));
  assert.ok(ui.element('#trait-controls').innerHTML.includes('기념품 선택'));
  ui.souvenir('gulon-liver',true);ui.souvenir('troll-gland',true);ui.souvenir('energy-horns',true);
  assert.deepEqual(ui.build().souvenirs,['gulon-liver','troll-gland','energy-horns']);
  assert.equal(ui.element('#souvenir-selection-count').textContent,'3 / 3 선택');
  assert.match(ui.element('#souvenir-options').innerHTML,/data-souvenir="bear-fat"[^>]*disabled/);
  assert.doesNotMatch(ui.element('#souvenir-options').innerHTML,/data-souvenir="troll-gland"[^>]*disabled/);
  ui.souvenir('bear-fat',true);assert.equal(ui.build().souvenirs.length,3);
  ui.souvenir('energy-horns',false);
  assert.doesNotMatch(ui.element('#souvenir-options').innerHTML,/data-souvenir="bear-fat"[^>]*disabled/);
  ui.souvenir('bear-fat',true);
  assert.deepEqual(ui.build().souvenirs,['gulon-liver','troll-gland','bear-fat']);
  ui.save();
  const restored=editor(JSON.parse(ui.storage.get(storageKey))[0].build);
  const summary=restored.element('#trait-controls').innerHTML;
  assert.ok(summary.includes('기본 +2% · 최대 +7%'));
  assert.ok(summary.includes('기본 -3% · 최대 -10%'));
  assert.deepEqual(restored.build().souvenirs,ui.build().souvenirs);
  ui.undo();assert.deepEqual(ui.build().souvenirs,['gulon-liver','troll-gland']);
});

test('souvenir choices are unavailable to other characters and character change undo restores Hilda', () => {
  const ui=editor(P.fresh('hilda'));
  ui.souvenir('gulon-liver',true);
  ui.click('choose-arna',{character:'arna'});
  assert.deepEqual(ui.build().souvenirs,[]);
  ui.souvenir('troll-gland',true);assert.deepEqual(ui.build().souvenirs,[]);
  assert.ok(!ui.element('#trait-controls').innerHTML.includes('기념품 선택'));
  ui.undo();assert.equal(ui.build().characterId,'hilda');assert.deepEqual(ui.build().souvenirs,['gulon-liver']);
});

test('saved guides restore safely, including markup-like notes and quoted equipment names', () => {
  const ui=editor();
  const description='</textarea><img src=x onerror="alert(1)">\n한글 메모';
  let field=ui.input('description',description);ui.blur(field);
  field=ui.equipment('equipment','" autofocus onfocus="alert(1)','head');ui.blur(field);
  ui.save();
  const saved=JSON.parse(ui.storage.get(storageKey))[0];
  const restored=editor(saved.build), html=restored.element('#tier-guide-editor').innerHTML+restored.element('#equipment-plan-editor').innerHTML;
  assert.equal(restored.build().tierPlans[1].description,description);
  assert.ok(html.includes('&lt;/textarea&gt;&lt;img'));
  assert.ok(html.includes('&quot; autofocus onfocus=&quot;alert(1)'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('value="" autofocus'));
  ui.input('description','이후 편집');
  ui.click('load-saved',{loadBuild:saved.id});
  assert.equal(ui.build().tierPlans[1].description,description);
});

test('guide keyboard navigation wraps across tiers without changing the character level', () => {
  const initial=P.fresh();initial.level=14;
  const ui=editor(initial);
  ui.key(1,'ArrowLeft');
  let field=ui.input('description','5티어 운영');ui.blur(field);
  ui.key(5,'ArrowRight');
  field=ui.input('description','1티어 운영');ui.blur(field);
  const build=ui.build();
  assert.equal(build.level,14);
  assert.equal(build.tierPlans[5].description,'5티어 운영');
  assert.equal(build.tierPlans[1].description,'1티어 운영');
});

test('selected-level investment summary shows that level only and preserves future plans', () => {
  const demo=P.demo(),ui=editor(demo);
  let summary=ui.element('#current-level-plan').innerHTML;
  assert.ok(summary.includes('Lv.10 투자'));assert.ok(summary.includes('민첩성 +1'));
  assert.ok(!summary.includes(P.bySkill['sword-cleaving-strike'].name));
  ui.click('level-1',{level:'1'});
  summary=ui.element('#current-level-plan').innerHTML;
  assert.ok(summary.includes('Lv.01 투자'));
  assert.ok(summary.includes(P.bySkill['sword-cleaving-strike'].name));
  assert.ok(summary.includes(P.bySkill['shield-raise-shield'].name));
  assert.ok(!summary.includes('민첩성 +1'));
  assert.ok(!summary.includes(P.bySkill['sword-fencer-stance'].name));
  const rows=ui.element('#journey-list').innerHTML.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g);
  assert.equal(rows.length,30);
  assert.ok(rows[9].includes('민첩성 +1'));
  assert.ok(rows[7].includes(P.bySkill['sword-fencer-stance'].name));
  assert.deepEqual(ui.build().events,demo.events);
});

test('growth overview retains simultaneous stat, skill, book and reward entries', () => {
  const build=P.fresh('jorgrim');build.level=2;
  build.events=[
    {id:'trait',level:1,type:'trait',key:P.character('jorgrim').statBonus.key},
    {id:'reward',level:2,type:'reward',key:'boulder-circle',choice:'ruby'},
    {id:'book',level:2,type:'treatise',key:'sword:1'},
    {id:'stat-1',level:2,type:'stat',key:'strength'},
    {id:'stat-2',level:2,type:'stat',key:'strength'},
    {id:'skill',level:2,type:'skill',key:'sword-cleaving-strike'}
  ];
  const ui=editor(build),summary=ui.element('#current-level-plan').innerHTML;
  const rows=ui.element('#journey-list').innerHTML.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g);
  for(const text of ['근력 +2',P.bySkill['sword-cleaving-strike'].name,'검 문헌 I 읽음','환상열석 +1 SP','물리저항 +4%']){
    assert.ok(summary.includes(text),text);assert.ok(rows[1].includes(text),text);
  }
  assert.ok(rows[0].includes('특성 최대 보상 +5 SP'));
  assert.ok(!summary.includes('특성 최대 보상 +5 SP'));
});

test('investment changes and undo refresh both the selected summary and overview', () => {
  const build=P.fresh();build.level=2;
  const ui=editor(build);
  assert.ok(!ui.element('#current-level-plan').innerHTML.includes('근력 +1'));
  ui.click('add-strength',{statAdd:'strength'});
  assert.ok(ui.element('#current-level-plan').innerHTML.includes('근력 +1'));
  assert.ok(ui.element('#journey-list').innerHTML.includes('근력 +1'));
  ui.click('remove-strength',{statRemove:'strength'});
  assert.ok(!ui.element('#current-level-plan').innerHTML.includes('근력 +1'));
  assert.ok(!ui.element('#journey-list').innerHTML.includes('근력 +1'));
  ui.undo();assert.ok(ui.element('#current-level-plan').innerHTML.includes('근력 +1'));
  assert.ok(ui.element('#journey-list').innerHTML.includes('근력 +1'));
});

test('growth overview is collapsed below the timeline and no longer has cumulative counter cards', () => {
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const opening=html.match(/<details\b[^>]*id="growth-record"[^>]*>/)?.[0];
  assert.ok(opening);assert.ok(!/\sopen(?:\s|=|>)/.test(opening));
  assert.ok(html.indexOf('class="timeline game-panel"')<html.indexOf('id="growth-record"'));
  assert.ok(html.indexOf('id="growth-record"')<html.indexOf('class="planner-grid"'));
  for(const id of ['journey-level','learned-skills','spent-stats']){
    assert.ok(!html.includes(`id="${id}"`));assert.ok(!appSource.includes(`$('#${id}')`));
  }
  const ui=editor();ui.element('#growth-record').open=true;
  ui.click('level-2',{level:'2'});
  assert.equal(ui.element('#growth-record').open,true);
});

test('single skill clicks preserve node DOM for native double-click and update selection accessibility', () => {
  const ui=editor(),tree=ui.element('#skill-tree'),writes=tree.markupWrites;
  const node=ui.skillClick('sword-cleaving-strike');
  assert.equal(tree.markupWrites,writes);
  assert.equal(node.getAttribute('aria-pressed'),'true');assert.ok(node.classList.contains('selected'));
  assert.ok(ui.element('#skill-detail').innerHTML.includes(P.bySkill['sword-cleaving-strike'].name));
  assert.equal(ui.build().events.length,0);
  ui.skillClick('sword-gloat');
  assert.equal(tree.markupWrites,writes);
  assert.equal(node.getAttribute('aria-pressed'),'false');assert.ok(node.classList.contains('prerequisite'));
  assert.ok(node.getAttribute('aria-label').includes('선행 기술'));
  assert.equal(ui.build().events.length,0);
});

test('a double-click learns once, another refunds once, and undo restores the allocation', () => {
  const ui=editor();
  ui.doubleSkill('sword-cleaving-strike');
  assert.equal(ui.build().events.length,1);assert.equal(P.replay(ui.build()).skillPoints,1);
  assert.ok(P.replay(ui.build()).learned.has('sword-cleaving-strike'));
  ui.doubleSkill('sword-cleaving-strike');
  assert.equal(ui.build().events.length,0);assert.equal(P.replay(ui.build()).skillPoints,2);
  ui.undo();assert.ok(P.replay(ui.build()).learned.has('sword-cleaving-strike'));
  assert.equal(P.replay(ui.build()).skillPoints,1);
  ui.undo();assert.equal(ui.build().events.length,0);assert.equal(P.replay(ui.build()).skillPoints,2);
});

test('double-click respects prerequisite and AP restrictions and explains the block', () => {
  const ui=editor();
  ui.doubleSkill('sword-gloat');assert.equal(ui.build().events.length,0);
  assert.ok(ui.element('#toast').textContent.includes('선행 기술 필요'));
  ui.doubleSkill('sword-cleaving-strike');ui.doubleSkill('sword-blade-maintenance');
  assert.equal(P.replay(ui.build()).skillPoints,0);
  ui.click('shield-tree',{tree:'shield'});ui.doubleSkill('shield-raise-shield');
  assert.equal(ui.build().events.length,2);
  assert.ok(!P.replay(ui.build()).learned.has('shield-raise-shield'));
  assert.ok(ui.element('#toast').textContent.includes('포인트가 없습니다'));
});

test('double-click cannot refund a free starting skill or bypass an unlock requirement', () => {
  const ui=editor();
  ui.click('survival-tree',{tree:'survival'});ui.doubleSkill('survival-butchering');
  assert.ok(P.replay(ui.build()).learned.has('survival-butchering'));
  assert.equal(ui.build().events.length,0);assert.equal(P.replay(ui.build()).skillPoints,2);
  assert.ok(ui.element('#toast').textContent.includes('취소할 수 없습니다'));
  const locked=D.skills.find(skill=>skill.tree==='pyromancy'&&skill.tier===1&&!skill.requires.length);
  assert.ok(locked);assert.equal(P.requirements(ui.build(),locked.id).unlocked,false);
  ui.click('pyromancy-tree',{tree:'pyromancy'});ui.doubleSkill(locked.id);
  assert.equal(ui.build().events.length,0);assert.equal(P.replay(ui.build()).skillPoints,2);
  assert.ok(ui.element('#toast').textContent.includes('문헌'));
});

test('double-click cancellation applies the existing dependency cascade and undo restores it', () => {
  const demo=P.demo(),ui=editor(demo),before=P.replay(demo).skillPoints;
  ui.doubleSkill('sword-cleaving-strike');
  const view=P.replay(ui.build());
  assert.ok(!view.learned.has('sword-cleaving-strike'));assert.ok(!view.learned.has('sword-gloat'));
  assert.ok(view.learned.has('sword-fencer-stance'));assert.ok(view.skillPoints>=before+2);
  ui.undo();assert.deepEqual(ui.build().events,demo.events);
});

test('public viewing and level navigation never overwrite the private draft or local library', () => {
  const privatePlan=P.fresh('hilda');privatePlan.name='편집 중인 내 빌드';privatePlan.tierPlans[2].description='개인 메모';privatePlan.overview.features='내 설명';
  const ui=editor(privatePlan),before=ui.storage.get(`${storageKey}-draft`);
  const publicPlan=P.demo();publicPlan.name='다른 사람의 빌드';publicPlan.overview.features='공개 설명';
  ui.bridge.openPublic({build:publicPlan,level:10,trees:['sword'],author_name:'작성자'});
  ui.click('view-level-2',{level:'2'});ui.doubleSkill('sword-cleaving-strike');
  ui.input('description','변경 시도');ui.overview('features','변경 시도');ui.equipment('equipment','변경 시도','mainHand');ui.equipment('recommendedEnchantments','변경 시도');ui.save();
  assert.equal(ui.bridge.getBuild().equipmentPlan.equipment.mainHand,'');assert.equal(ui.bridge.getBuild().equipmentPlan.recommendedEnchantments,'');
  assert.equal(ui.bridge.getBuild().overview.features,'공개 설명');
  assert.equal(ui.storage.get(`${storageKey}-draft`),before);
  assert.equal(ui.storage.get(storageKey),undefined);
  assert.equal(ui.element('#build-name').readOnly,true);
  assert.equal(ui.bridge.getBuild().tierPlans[2].description,'');
  ui.bridge.returnPrivate();
  assert.equal(ui.bridge.getBuild().name,privatePlan.name);assert.deepEqual(JSON.parse(JSON.stringify(ui.bridge.getBuild().overview)),privatePlan.overview);
  assert.equal(ui.bridge.getBuild().tierPlans[2].description,'개인 메모');
  assert.equal(ui.bridge.getBuild().characterId,'hilda');
  assert.equal(ui.element('#build-name').readOnly,false);
});

test('explicitly copying a public build creates an editable draft and undo recovers private work', () => {
  const initial=P.fresh('dirwin');initial.equipmentPlan.equipment.mainHand='내 장비';
  const ui=editor(initial),published=P.demo();
  ui.bridge.openPublic({build:published,level:10,trees:['sword']});ui.bridge.copyPublic();
  assert.equal(ui.bridge.getPublic(),null);assert.equal(ui.build().name,published.name);
  ui.equipment('recommendedEnchantments','명중률');
  assert.equal(ui.build().equipmentPlan.recommendedEnchantments,'명중률');
  assert.equal(published.equipmentPlan.recommendedEnchantments,'');
  ui.undo();ui.undo();assert.equal(ui.build().characterId,'dirwin');assert.equal(ui.build().equipmentPlan.equipment.mainHand,'내 장비');
});


test('overview editing preserves typing, saves escaped multiline text and undoes per field', () => {
  const ui=editor(),writes=ui.element('#overview-fields').markupWrites;
  ui.overview('features','검과');
  let field=ui.overview('features','검과 방패\n</textarea><script>메모</script>');ui.blur(field);
  field=ui.overview('pros','안정적인 방어');ui.blur(field);
  field=ui.overview('cons','기력 관리 필요');ui.blur(field);
  assert.equal(ui.element('#overview-fields').markupWrites,writes);
  const expected=ui.build().overview;
  ui.click('guide-tab-4',{guideTier:'4'});ui.click('level-2',{level:'2'});
  assert.deepEqual(ui.build().overview,expected);
  ui.save();
  const restored=editor(JSON.parse(ui.storage.get(storageKey))[0].build);
  assert.deepEqual(restored.build().overview,expected);
  assert.ok(restored.element('#overview-fields').innerHTML.includes('&lt;/textarea&gt;&lt;script&gt;메모&lt;/script&gt;'));
  ui.undo();assert.equal(ui.build().overview.cons,'');
  ui.undo();assert.equal(ui.build().overview.pros,'');
  ui.undo();assert.equal(ui.build().overview.features,'');
});


test('legacy equipment remains accessible in a collapsed escaped archive after migration and save', () => {
  const old=P.fresh();delete old.equipmentPlan;
  old.tierPlans[1].equipment={mainHand:'<초반 검>'};old.tierPlans[1].enchantments={mainHand:'치명타 & 명중'};old.tierPlans[1].equipmentNotes='초반 메모';
  old.tierPlans[5].equipment={mainHand:'최종 창'};
  const ui=editor(old),html=ui.element('#equipment-plan-editor').innerHTML;
  assert.ok(html.includes('value="최종 창"'));assert.ok(html.includes('&lt;초반 검&gt;'));assert.ok(html.includes('치명타 &amp; 명중'));
  assert.ok(!/<details class="legacy-equipment"[^>]*\sopen/.test(html));
  const field=ui.equipment('equipment','','mainHand');ui.blur(field);ui.save();
  const restored=editor(JSON.parse(ui.storage.get(storageKey))[0].build);
  assert.equal(restored.bridge.getBuild().equipmentPlan.equipment.mainHand,'');
  assert.equal(restored.bridge.getBuild().legacyEquipmentPlans[1].equipment.mainHand,'<초반 검>');
});


test('investment summary counts paid skills, hides free starts, and follows learn, refund and undo', () => {
  for (const hero of ['arna','dirwin','hilda']) {
    const ui=editor(P.fresh(hero));
    assert.equal(ui.element('#ability-investments').hidden,true);
    assert.equal(ui.element('#ability-investments').innerHTML,'');
  }
  const ui=editor(),summary=ui.element('#ability-investments');
  ui.doubleSkill('sword-cleaving-strike');
  assert.equal(summary.hidden,false);
  assert.match(summary.innerHTML,/aria-label="검 1개 투자 · 계열 보기"/);
  assert.doesNotMatch(summary.innerHTML,/data-tree="survival"/);
  ui.click('survival-tree',{tree:'survival'});
  ui.click('sword-investment',{tree:'sword'});
  assert.equal(ui.element('#tree-subtitle').textContent,P.byTree.sword.english);
  ui.doubleSkill('sword-cleaving-strike');
  assert.equal(summary.hidden,true);
  ui.undo();assert.match(summary.innerHTML,/aria-label="검 1개 투자 · 계열 보기"/);
});

test('investment summary ranks paid trees and reflects the viewed level without deleting future allocations', () => {
  const initial=P.demo(),ui=editor(initial),summary=ui.element('#ability-investments');
  const counts=()=>[...summary.innerHTML.matchAll(/aria-label="([^"]+) (\d+)개 투자 · 계열 보기"/g)].map(([,name,count])=>[name,Number(count)]);
  assert.deepEqual(counts(),[['검',5],['방패',2]]);
  assert.ok(summary.innerHTML.includes('<img src="assets/skills/'));
  ui.click('view-level-1',{level:'1'});
  assert.deepEqual(counts(),[['검',1],['방패',1]]);
  assert.equal(summary.getAttribute('aria-label'),'Lv.1 계열별 기술 투자');
  assert.deepEqual(ui.build().events,initial.events);
  ui.click('view-level-10',{level:'10'});
  assert.deepEqual(counts(),[['검',5],['방패',2]]);
  ui.click('choose-dirwin',{character:'dirwin'});assert.equal(summary.hidden,true);
  ui.undo();assert.deepEqual(counts(),[['검',5],['방패',2]]);
});

test('public investment summary supports tree and level navigation while preserving the private draft', () => {
  const ui=editor(P.fresh('hilda')),before=ui.storage.get(`${storageKey}-draft`),summary=ui.element('#ability-investments');
  ui.bridge.openPublic({build:P.demo(),level:10,trees:['sword']});
  assert.match(summary.innerHTML,/aria-label="검 5개 투자/);
  ui.click('shield-investment',{tree:'shield'});
  assert.equal(ui.element('#tree-subtitle').textContent,P.byTree.shield.english);
  ui.click('view-level-1',{level:'1'});
  assert.match(summary.innerHTML,/aria-label="방패 1개 투자/);
  assert.equal(ui.storage.get(`${storageKey}-draft`),before);
  ui.bridge.returnPrivate();assert.equal(summary.hidden,true);
});

test('level unlock is an equal alternative route with live status and still requires prerequisite skills', () => {
  const initial=P.fresh();initial.level=9;
  const ui=editor(initial),detail=ui.element('#skill-detail');
  ui.skillClick('sword-gloat');
  const routeClass=route=>detail.innerHTML.match(new RegExp(`<div class="unlock-route ([^"]*)" data-route="${route}">`))?.[1];
  assert.notEqual(routeClass('treatise'),undefined);
  assert.notEqual(routeClass('attributes'),undefined);
  assert.equal(routeClass('level'),'');
  assert.ok(detail.innerHTML.includes('레벨 10 도달'));
  assert.match(detail.innerHTML,/data-prerequisites-met="false"/);
  assert.ok(!detail.innerHTML.includes('action-reason'));
  ui.click('view-level-10',{level:'10'});
  assert.equal(routeClass('level'),'met');
  assert.equal(routeClass('attributes'),'');
  ui.doubleSkill('sword-gloat');
  assert.equal(ui.build().events.length,0);
  assert.ok(ui.element('#toast').textContent.includes('선행 기술 필요'));
  ui.click('read-sword-2',{book:'sword:2'});
  assert.equal(routeClass('treatise'),'met');
  assert.ok(detail.innerHTML.includes('Lv.10 읽음 ✓'));
  ui.skillClick('sword-cleaving-strike');
  assert.equal(routeClass('attributes'),undefined);
  assert.equal(routeClass('level'),undefined);
  ui.skillClick('survival-butchering');
  assert.doesNotMatch(detail.innerHTML,/data-route=/);
});
