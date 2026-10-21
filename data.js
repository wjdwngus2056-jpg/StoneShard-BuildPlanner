(function (root) {
  const wiki = root.WAYFARER_WIKI || (typeof require !== 'undefined' ? require('./game-data.js') : null);
  const stats = [
    {id:'strength',name:'근력',english:'STR'}, {id:'agility',name:'민첩성',english:'AGI'},
    {id:'perception',name:'인지력',english:'PER'}, {id:'vitality',name:'생명력',english:'VIT'}, {id:'willpower',name:'의지력',english:'WIL'}
  ];
  const characters = [
    {id:'arna',name:'아르나',english:'Arna',role:'여기사',values:[11,11,10,11,10],trait:'위업의 맹세',description:'레벨이 오를수록 긍정적인 정신 상태의 효과가 강해집니다. 정신 상태에 따른 효과는 전투 상황에 따라 달라집니다.'},
    {id:'jorgrim',name:'요르그림',english:'Jorgrim',role:'약탈자',values:[11,10,11,11,10],trait:'피와 영광',description:'서로 다른 전리품을 처음 반납할 때, 3종마다 능력치 포인트 1 SP를 얻습니다. 최대 5회 적용됩니다.',statBonus:{key:'trophy-rewards',max:5,detail:'전리품 15종의 첫 반납 보상을 모두 획득한 것으로 계산합니다.',source:'https://stoneshard.com/wiki/Jorgrim'}},
    {id:'dirwin',name:'디르윈',english:'Dirwin',role:'숲지기',values:[10,11,11,11,10],trait:'숲지기의 재능',description:'생존 계열에 직접 3 AP를 투자할 때마다 추가 1 AP를 얻습니다. 시작 시 습득한 기술은 투자량에서 제외합니다. 특성의 능력치 포인트 보상은 최대 3 SP입니다.',bonus:'survival',bonusCap:3,statBonus:{key:'survival-stat-rewards',max:3,detail:'특성의 능력치 포인트 보상을 최대 3 SP까지 획득한 것으로 계산합니다.',source:'https://stoneshard-00.web.app/',confirmedBy:'user'}},
    {id:'jonna',name:'요나',english:'Jonna',role:'탈주 마법사',values:[10,10,11,11,11],trait:'마법적 학식',description:'문헌과 마법 학습을 통해 성장하는 마법사. 소지한 마법서에 따른 전투 보너스는 계산에 포함하지 않습니다.'},
    {id:'velmir',name:'벨미르',english:'Velmir',role:'복수자',values:[11,11,11,10,10],trait:'위대한 복수',description:'보스를 처치할 때마다 능력치 포인트 2 SP를 얻습니다. 현재 모험 모드의 트롤·만티코어 보상은 합계 4 SP입니다.',statBonus:{key:'boss-rewards',max:4,detail:'트롤·만티코어 처치 보상을 모두 획득한 것으로 계산합니다.',source:'https://stoneshard.com/wiki/Velmir',bossSource:'https://stoneshard.com/wiki/Enemies#Bosses'}},
    {id:'mahir',name:'마히르',english:'Mahir',role:'순례자',values:[10,11,11,10,11],trait:'끝없는 여정',description:'한 계열에 직접 6 AP를 투자하면 추가 1 AP를 얻습니다. 계열마다 한 번씩, 총 5회까지 적용합니다.',bonus:'trees',bonusCap:5},
    {id:'leosthenes',name:'레오스테네스',english:'Leosthenes',role:'지휘관',values:[11,10,10,11,11],trait:'무력과 마력',description:'무기 기술과 마법을 함께 익히는 전사. 각 계열의 투자량에 따른 파생 전투 능력치는 검증 중입니다.'},
    {id:'hilda',name:'힐다',english:'Hilda',role:'괴물 사냥꾼',values:[11,11,10,11,10],trait:'야생의 사냥',description:'임기응변을 습득한 상태로 시작합니다. 뼈 부적에 붙일 기념품 효과를 최대 3개까지 선택할 수 있습니다.'}
  ];
  const trees = [
    {id:'sword',name:'검',english:'SWORDS',category:'weapon'}, {id:'axe',name:'도끼',english:'AXES',category:'weapon'},
    {id:'mace',name:'철퇴',english:'MACES',category:'weapon'}, {id:'dagger',name:'단검',english:'DAGGERS',category:'weapon'},
    {id:'two-handed-sword',name:'양손 검',english:'TWO-HANDED SWORDS',category:'weapon'}, {id:'two-handed-axe',name:'양손 도끼',english:'TWO-HANDED AXES',category:'weapon'},
    {id:'two-handed-mace',name:'양손 철퇴',english:'TWO-HANDED MACES',category:'weapon'}, {id:'spear',name:'창',english:'SPEARS',category:'weapon'},
    {id:'ranged',name:'원거리 무기',english:'RANGED WEAPONS',category:'weapon'}, {id:'shield',name:'방패',english:'SHIELDS',category:'weapon'}, {id:'staff',name:'지팡이',english:'STAVES',category:'weapon'},
    {id:'dual-wielding',name:'쌍수 무장',english:'DUAL WIELDING',category:'utility'}, {id:'athletics',name:'체술',english:'ATHLETICS',category:'utility'},
    {id:'survival',name:'생존',english:'SURVIVAL',category:'utility'}, {id:'warfare',name:'병법',english:'WARFARE',category:'utility'},
    {id:'armored-combat',name:'갑옷 전투',english:'ARMORED COMBAT',category:'utility'}, {id:'magic-mastery',name:'마법 숙달',english:'MAGIC MASTERY',category:'utility'},
    {id:'pyromancy',name:'화염 마법',english:'PYROMANCY',category:'magic'}, {id:'geomancy',name:'대지 마법',english:'GEOMANCY',category:'magic'},
    {id:'electromancy',name:'전격 마법',english:'ELECTROMANCY',category:'magic'}, {id:'arcanistics',name:'미지 마법',english:'ARCANISTICS',category:'magic'}
  ];
  const rewards = [{
    id:'boulder-circle',name:'환상열석',statPoints:1,source:'https://stoneshard.com/wiki/Boulder_Circle',
    choices:[
      {id:'emerald',name:'에메랄드',label:'체력 +5',bonuses:{health:5}},
      {id:'sapphire',name:'사파이어',label:'기력 +5',bonuses:{energy:5}},
      {id:'ruby',name:'루비',label:'물리저항 +4%',bonuses:{physicalResistance:4}}
    ]
  }];
  const legacyMap = {};
  // Names, units and base/max values follow the table supplied by the user.
  const souvenirs = {
    characterId:'hilda',limit:3,source:'user-provided-table',
    options:[
      {id:'gulon-liver',trophy:'굴론 간',effect:'생명력 흡수율',base:2,max:7,unit:'%'},
      {id:'troll-gland',trophy:'트롤 분비샘',effect:'받는 데미지',base:-3,max:-10,unit:'%'},
      {id:'bear-fat',trophy:'곰 지방',effect:'무기 피해',base:3,max:10,unit:'%'},
      {id:'harpy-stomach',trophy:'하피의 내장',effect:'회피율',base:3,max:10,unit:'%'},
      {id:'crawler-eye',trophy:'크롤러 눈알',effect:'기력 흡수율',base:2,max:7,unit:'%'},
      {id:'bison-horns',trophy:'들소 뿔',effect:'체력',base:3,max:10,unit:''},
      {id:'energy-horns',trophy:'사슴 뿔 / 산양 뿔',effect:'기력',base:2,max:8,unit:''},
      {id:'wolf-tongue',trophy:'늑대 혀',effect:'능력 사용 기력 감소',base:-3,max:-8,unit:'%'},
      {id:'moose-kidney',trophy:'무스 콩팥',effect:'마법력',base:3,max:15,unit:'%'},
      {id:'boar-tusks',trophy:'멧돼지 어금니',effect:'재사용 대기 시간',base:-3,max:-10,unit:'%'},
      {id:'ghoul-heart',trophy:'구울 심장',effect:'체력 회복률',base:3,max:10,unit:'%'},
      {id:'rockeater-gland',trophy:'록이터 분비샘',effect:'피로 저항성',base:3,max:20,unit:'%'}
    ]
  };
  for (const tree of trees) {
    Object.assign(tree,wiki.trees[tree.id]);
    const ordered=wiki.skills.filter(skill=>skill.tree===tree.id).sort((a,b)=>a.position.top-b.position.top||a.position.left-b.position.left);
    for(let index=0;index<6;index++)legacyMap[`${tree.id}-${index+1}`]=ordered[index]?.id;
  }
  for(const hero of characters){
    Object.assign(hero,wiki.characters[hero.id]);
    hero.free=['survival-butchering',...(hero.id==='dirwin'?['survival-make-a-halt']:hero.id==='hilda'?['survival-resourcefulness']:[])];
  }
  const guide = {
    tiers:[1,2,3,4,5],
    overviewFields:[
      {id:'features',name:'빌드 특징',max:4000,placeholder:'빌드의 간략한 소개, 캐릭터 선택 이유, 플레이 스타일 등을 적어주세요.'},
      {id:'pros',name:'장점',max:2000,placeholder:'이 빌드의 강점과 유리한 상황을 적어주세요.'},
      {id:'cons',name:'단점',max:2000,placeholder:'취약한 상황, 주의할 적이나 성장 구간 등을 적어주세요.'}
    ],
    equipmentSlots:[
      {id:'mainHand',name:'주무기'}, {id:'offHand',name:'보조 무기·방패'},
      {id:'head',name:'머리'}, {id:'chest',name:'몸통'}, {id:'hands',name:'손'},
      {id:'belt',name:'허리'}, {id:'feet',name:'발'}, {id:'back',name:'등'},
      {id:'neck',name:'목걸이'}, {id:'ringLeft',name:'반지 1'}, {id:'ringRight',name:'반지 2'}
    ],
    limits:{description:6000,equipmentNotes:2000,equipment:120,enchantments:160,recommendedEnchantments:2000}
  };
  const data={stats,characters,trees,skills:wiki.skills,rewards,legacyMap,guide,souvenirs,source:'https://stoneshard-00.web.app/'};
  root.WAYFARER_DATA=data;
  if(typeof module!=='undefined')module.exports=data;
})(typeof window!=='undefined'?window:globalThis);
