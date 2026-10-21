(function (root) {
  const data = root.WAYFARER_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  const bySkill = Object.fromEntries(data.skills.map(skill => [skill.id, skill]));
  const byTree = Object.fromEntries(data.trees.map(tree => [tree.id, tree]));
  const byReward = Object.fromEntries(data.rewards.map(reward => [reward.id, reward]));
  const bySouvenir = Object.fromEntries(data.souvenirs.options.map(option => [option.id,option]));
  const character = id => data.characters.find(item => item.id === id) || data.characters[0];
  const clampLevel = level => Math.max(1, Math.min(30, Number.isFinite(Number(level)) ? Math.trunc(Number(level)) : 1));
  const emptyEquipment = () => Object.fromEntries(data.guide.equipmentSlots.map(slot => [slot.id,'']));
  const emptyTierPlan = () => ({description:''});
  const emptyEquipmentPlan = () => ({equipment:emptyEquipment(),recommendedEnchantments:'',equipmentNotes:''});
  const fresh = (id = 'arna') => ({ schemaVersion: 2, characterId: character(id).id, name: `${character(id).name}의 새로운 여정`, level: 1, events: [], rewardChoices: Object.fromEntries(data.rewards.map(reward => [reward.id,reward.choices[0].id])), tierPlans:Object.fromEntries(data.guide.tiers.map(tier => [tier,emptyTierPlan()])), overview:Object.fromEntries(data.guide.overviewFields.map(field=>[field.id,''])), equipmentPlan:emptyEquipmentPlan(), legacyEquipmentPlans:{}, souvenirs:[] });
  const bookKey = skill => `${skill.tree}:${Math.max(1, skill.tier)}`;
  const validBooks = new Set(data.skills.filter(skill => skill.tier > 0).map(bookKey));

  function souvenirChoices(build) {
    if (build.characterId !== data.souvenirs.characterId || !Array.isArray(build.souvenirs)) return [];
    return [...new Set(build.souvenirs.filter(id => typeof id === 'string' && Object.hasOwn(bySouvenir,id)))].slice(0,data.souvenirs.limit).map(id => bySouvenir[id]);
  }

  function prerequisiteStatus(skill, learned) {
    const groups = skill.prerequisites ?? (skill.requires.length ? [skill.requires] : []);
    const paths = groups.map(required => {
      const missing = required.filter(id => !learned.has(id));
      return { required, missing, met: missing.length === 0 };
    });
    const met = !paths.length || paths.some(path => path.met);
    return { met, paths, missing: met ? [] : [...new Set(paths.flatMap(path => path.missing))] };
  }

  function unlockStatus(skill, hero, level, values, books) {
    const current = skill.unlock.attributes.reduce((sum, key) => sum + Math.max(0, values[key] - 10), 0);
    const innate = skill.tier === 0;
    const affinity = skill.tier === 1 && hero.affinity.includes(skill.tree);
    const book = books.has(bookKey(skill));
    const attributes = skill.unlock.points !== null && current >= skill.unlock.points;
    const byLevel = skill.unlock.level !== null && level >= skill.unlock.level;
    return { innate, affinity, book, attributes, byLevel, current, remaining: Math.max(0, (skill.unlock.points || 0) - current), unlocked: innate || affinity || book || attributes || byLevel };
  }

  function replay(build, level = build.level) {
    const atLevel = clampLevel(level), hero = character(build.characterId);
    const values = Object.fromEntries(data.stats.map((stat, index) => [stat.id, hero.values[index]]));
    const learned = new Set(hero.free), books = new Set(), counts = {}, rewards = new Set();
    const permanentBonuses = {health:0,energy:0,physicalResistance:0};
    let spentStats = 0, spentSkills = 0, bonus = 0, statBonus = 0, eventBonus = 0;
    const accepted = [], rejected = [];
    const ordered = build.events.map((event, order) => ({ ...event, order })).sort((a, b) => a.level - b.level || a.order - b.order);
    for (const event of ordered) {
      if (event.level > atLevel) continue;
      if (!Number.isInteger(event.level) || event.level < 1 || event.level > 30) { rejected.push(event); continue; }
      if (event.type === 'stat') {
        if (!Object.hasOwn(values, event.key) || values[event.key] >= 30 || event.level - 1 + statBonus + eventBonus - spentStats <= 0) { rejected.push(event); continue; }
        values[event.key]++; spentStats++;
      } else if (event.type === 'trait') {
        if (!hero.statBonus || event.key !== hero.statBonus.key || statBonus) { rejected.push(event); continue; }
        statBonus = hero.statBonus.max;
      } else if (event.type === 'reward') {
        const reward = Object.hasOwn(byReward,event.key) ? byReward[event.key] : null;
        const choice = reward?.choices.find(choice => choice.id === event.choice);
        if (!reward || !choice || rewards.has(reward.id)) { rejected.push(event); continue; }
        rewards.add(reward.id); eventBonus += reward.statPoints;
        for (const [key,value] of Object.entries(choice.bonuses)) permanentBonuses[key] += value;
      } else if (event.type === 'treatise') {
        if (!validBooks.has(event.key) || books.has(event.key)) { rejected.push(event); continue; }
        books.add(event.key);
      } else if (event.type === 'skill') {
        const skill = bySkill[event.key];
        if (!skill || learned.has(skill.id) || !unlockStatus(skill, hero, event.level, values, books).unlocked || !prerequisiteStatus(skill, learned).met || 1 + event.level + bonus - spentSkills <= 0) { rejected.push(event); continue; }
        learned.add(skill.id); spentSkills++;
        counts[skill.tree] = (counts[skill.tree] || 0) + 1;
        if (hero.bonus === 'survival') bonus = Math.min(hero.bonusCap, Math.floor((counts.survival || 0) / 3));
        if (hero.bonus === 'trees') bonus = Math.min(hero.bonusCap, Object.values(counts).filter(count => count >= 6).length);
      } else { rejected.push(event); continue; }
      accepted.push(event);
    }
    return { values, learned, books, counts, rewards, permanentBonuses, souvenirs:souvenirChoices(build), bonus, statBonus, eventBonus, spentStats, spentSkills, statPoints: atLevel - 1 + statBonus + eventBonus - spentStats, skillPoints: 1 + atLevel + bonus - spentSkills, accepted, rejected };
  }

  function normalize(input) {
    const build = fresh(input?.characterId);
    build.name = typeof input?.name === 'string' ? input.name.slice(0, 60) : build.name;
    build.level = clampLevel(input?.level);
    const text = (value,limit) => typeof value === 'string' ? value.slice(0,limit) : '';
    for(const field of data.guide.overviewFields)build.overview[field.id]=text(input?.overview?.[field.id],field.max);
    for (const tier of data.guide.tiers) {
      build.tierPlans[tier].description = text(input?.tierPlans?.[tier]?.description,data.guide.limits.description);
      // Preserve old per-tier equipment as a bounded, read-only archive.
      const source = input?.legacyEquipmentPlans?.[tier] || input?.tierPlans?.[tier];
      const archived = {equipment:emptyEquipment(),enchantments:emptyEquipment(),equipmentNotes:text(source?.equipmentNotes,data.guide.limits.equipmentNotes)};
      for (const slot of data.guide.equipmentSlots) {
        archived.equipment[slot.id] = text(source?.equipment?.[slot.id],data.guide.limits.equipment);
        archived.enchantments[slot.id] = text(source?.enchantments?.[slot.id],data.guide.limits.enchantments);
      }
      if (archived.equipmentNotes.trim() || Object.values(archived.equipment).some(value=>value.trim()) || Object.values(archived.enchantments).some(value=>value.trim())) build.legacyEquipmentPlans[tier] = archived;
    }
    if (input && Object.hasOwn(input,'equipmentPlan')) {
      const source = input.equipmentPlan;
      for (const slot of data.guide.equipmentSlots) build.equipmentPlan.equipment[slot.id] = text(source?.equipment?.[slot.id],data.guide.limits.equipment);
      for (const field of ['recommendedEnchantments','equipmentNotes']) build.equipmentPlan[field] = text(source?.[field],data.guide.limits[field]);
    } else {
      // Migrate once. Explicitly empty new fields must stay empty on later loads.
      const newest = data.guide.tiers.slice().reverse().map(tier=>build.legacyEquipmentPlans[tier]).filter(Boolean);
      const latestText = read => newest.map(read).find(value=>value.trim()) || '';
      for (const slot of data.guide.equipmentSlots) build.equipmentPlan.equipment[slot.id] = latestText(plan=>plan.equipment[slot.id]);
      build.equipmentPlan.recommendedEnchantments = data.guide.equipmentSlots.map(slot=>{
        const value=latestText(plan=>plan.enchantments[slot.id]);return value?`${slot.name}: ${value}`:'';
      }).filter(Boolean).join('\n').slice(0,data.guide.limits.recommendedEnchantments);
      build.equipmentPlan.equipmentNotes = latestText(plan=>plan.equipmentNotes);
    }
    build.souvenirs = souvenirChoices({...input,characterId:build.characterId}).map(option => option.id);
    for (const reward of data.rewards) {
      const choice = input?.rewardChoices?.[reward.id];
      if (reward.choices.some(item => item.id === choice)) build.rewardChoices[reward.id] = choice;
    }
    build.events = Array.isArray(input?.events) ? input.events.filter(event => event && ['stat', 'skill', 'treatise', 'trait', 'reward'].includes(event.type) && typeof event.key === 'string' && Number.isInteger(event.level) && event.level >= 1 && event.level <= 30).map(event => ({ id: String(event.id || `${event.level}-${event.key}`), level: event.level, type: event.type, key: event.type === 'skill' ? data.legacyMap[event.key] || event.key : event.key, ...(event.type === 'reward' ? {choice:event.choice ?? build.rewardChoices[event.key]} : {}) })) : [];
    if (input && input.schemaVersion !== 2 && input.treatise !== false) {
      build.events.unshift(...[...validBooks].map(key => ({ id: `migration-${key}`, level: 1, type: 'treatise', key })));
    }
    build.events = replay(build, 30).accepted.map(({ order, ...event }) => event);
    for (const event of build.events) if (event.type === 'reward') build.rewardChoices[event.key] = event.choice;
    return build;
  }

  function requirements(build, skillId) {
    const skill = bySkill[skillId], view = replay(build);
    if (!skill) return null;
    const prerequisites = prerequisiteStatus(skill, view.learned);
    return { ...unlockStatus(skill, character(build.characterId), build.level, view.values, view.books), prerequisites, missing: prerequisites.missing, learned: view.learned.has(skillId), free: character(build.characterId).free.includes(skillId), skillPoints: view.skillPoints };
  }

  function availability(build, skillId) {
    const state = requirements(build, skillId);
    if (!state) return { available: false, reason: '존재하지 않는 기술입니다.' };
    if (state.learned) return { available: false, learned: true, reason: state.free ? '캐릭터가 처음부터 습득한 기술입니다.' : '이미 습득한 기술입니다.' };
    if (!state.prerequisites.met) return { available: false, reason: `선행 기술 필요: ${state.prerequisites.paths.map(path => path.required.map(id => bySkill[id].name).join(' 및 ')).join(' 또는 ')}` };
    if (!state.unlocked) return { available: false, reason: '문헌을 읽거나 능력치 조건을 충족해야 합니다. 상세 패널에서 두 경로를 확인하세요.' };
    if (state.skillPoints <= 0) return { available: false, reason: '사용할 능력 포인트가 없습니다. 다음 레벨을 선택해보세요.' };
    return { available: true, reason: '1 AP를 사용해 습득할 수 있습니다.' };
  }

  function demo() {
    const build = fresh(); build.name = '아르나의 검과 방패'; build.level = 10;
    for (let level = 2; level <= 10; level++) build.events.push({ id: `demo-stat-${level}`, level, type: 'stat', key: level <= 7 ? 'strength' : 'agility' });
    const route = [[1, 'sword-cleaving-strike'], [1, 'shield-raise-shield'], [2, 'sword-blade-maintenance'], [3, 'sword-keeping-distance'], [4, 'shield-embodiment-of-resilience'], [8, 'sword-fencer-stance'], [9, 'sword-gloat']];
    route.forEach(([level, key], index) => build.events.push({ id: `demo-skill-${index}`, level, type: 'skill', key }));
    return normalize(build);
  }
  const api = { character, clampLevel, fresh, replay, normalize, availability, requirements, prerequisiteStatus, unlockStatus, bookKey, validBooks, demo, bySkill, byTree, byReward, bySouvenir, souvenirChoices };
  root.WayfarerPlanner = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
