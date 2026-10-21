const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../effects.js');
const D=require('../data.js');
const stats={strength:11,agility:12,perception:13,vitality:10,willpower:11};

test('attribute expressions respect precedence, decimal precision and unary signs',()=>{
  assert.equal(E.evaluateExpression('2*agi+15',{agi:12}),39);
  assert.equal(E.evaluateExpression('-(2+3)*4+0.1*wil',{wil:11}),-18.9);
  assert.equal(E.evaluateExpression('+0.75*per',{per:13}),9.75);
  assert.equal(E.plainText('출혈 [+${2*str+35}%]',stats),'출혈 [+57%]');
});
test('unmodeled equipment and situation variables retain labeled formulas',()=>{
  assert.equal(E.evaluateExpression('6+0.1*max_blk_pow'),null);
  assert.match(E.plainText('${6+0.1*max_blk_pow}',stats),/최대 방어력/);
  assert.deepEqual(E.missingVariables('${str}+${blk_chance}+${blk_chance}+${mag}'),['blk_chance','mag']);
});
test('external descriptions cannot execute code or inject HTML',()=>{
  for(const expression of ['alert(1)','globalThis.process.exit()','str.constructor','1;throw 2','1/0','2**3','(1+2',''])assert.equal(E.evaluateExpression(expression,{str:11}),null);
  const rendered=E.renderText('<img src=x onerror=alert(1)> [<script>]',stats);
  assert.ok(!rendered.includes('<img'));assert.ok(!rendered.includes('<script>'));
  assert.ok(rendered.includes('&lt;img'));assert.ok(rendered.includes('effect-number'));
});
test('reference markup renders numbers, conditions, terms and element colors',()=>{
  const html=E.renderText('[[혼란]] [+5%] {{7%}} ##8 전격 피해#3 {${3*per+80}%}',stats);
  for(const name of ['effect-status','effect-number','effect-term','element-3'])assert.ok(html.includes(name));
  assert.ok(html.includes('119%'));assert.ok(!/[{}#]/.test(html));
});
test('all 228 Korean descriptions render without source markers or unresolved formulas',()=>{
  for(const skill of D.skills){
    assert.ok(skill.effects.length,skill.id);assert.equal(skill.effectSource,'https://stoneshard-00.web.app/');
    for(const line of skill.effects){const html=E.renderText(line,stats);assert.ok(html.length,skill.id);assert.ok(!/\$\{|##|#[1-4]|[{}]/.test(html),`${skill.id}: ${html}`);}
  }
});
test('all category labels use the Korean reference while previous labels remain searchable',()=>{
  const names={'dual-wielding':'쌍수 무장',athletics:'체술',warfare:'병법','armored-combat':'갑옷 전투','magic-mastery':'마법 숙달',pyromancy:'화염 마법',geomancy:'대지 마법',electromancy:'전격 마법',arcanistics:'미지 마법','two-handed-axe':'양손 도끼'};
  for(const [id,name] of Object.entries(names))assert.equal(D.trees.find(t=>t.id===id).name,name);
  assert.ok(D.trees.find(t=>t.id==='athletics').aliases.includes('운동 능력'));
});
