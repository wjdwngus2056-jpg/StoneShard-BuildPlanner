(() => {
  'use strict';
  const D = window.WAYFARER_DATA, P = window.WayfarerPlanner, E = window.WayfarerEffects;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const STORAGE = 'wayfarer-prototype-v1', DRAFT = `${STORAGE}-draft`;
  const roman = ['', 'I', 'II', 'III', 'IV'];
  let build = P.fresh(), treeId = 'sword', category = 'weapon', selectedId = 'sword-cleaving-strike';
  let history = [], library = [], toastTimer, detailTab = 'effects';
  let guideTier = 1, guideEdit = null;
  let publicView = null, privateSnapshot = null;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    // Keep original saved documents until the user explicitly opens or saves one.
    library = Array.isArray(stored) ? stored.filter(item => item && typeof item.id === 'string' && item.build) : [];
    const draft = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (draft) build = P.normalize(draft);
  } catch { /* The planner also works without browser storage. */ }

  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const image = (path, name, className = '') => `<img src="${path}" alt="${esc(name)}" class="${className}" draggable="false">`;
  const bookName = key => { const [tree, tier] = key.split(':'); return `${P.byTree[tree].name} 문헌 ${roman[Number(tier)]}`; };
  const lock = '<svg class="node-lock" viewBox="0 0 16 20" aria-hidden="true"><path fill="#ece8e5" d="M4 2h8v2h2v5h1v10H1V9h1V4h2Zm2 2v2H4v3h8V6h-2V4ZM7 12v4h2v-4Z" fill-rule="evenodd"/></svg>';
  function notify(message) {
    $('#toast').textContent = message; $('#toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3800);
  }
  function persist() { if(publicView)return true; try { localStorage.setItem(DRAFT, JSON.stringify(build)); return true; } catch { return false; } }
  function update(fn, message) {
    if(publicView){notify('공개 빌드를 복사한 뒤 편집할 수 있습니다.');return;}
    history.push(clone(build)); if (history.length > 60) history.shift();
    fn(); const count = build.events.length; build = P.normalize(build);
    const removed = count - build.events.length, saved = persist();
    render();
    $('#build-status').textContent = saved ? '편집 중 · 이 브라우저에 임시 저장됨' : '편집 중 · 브라우저 임시 저장 불가';
    if (message || removed) notify(`${message || '변경했습니다.'}${removed ? ` 이후 조건이 맞지 않는 선택 ${removed}개를 정리했습니다. 되돌리기로 복구할 수 있어요.` : ''}`);
  }
  function selectLevel(level) {
    build.level = P.clampLevel(level); persist(); render();
    $('#level-steps .active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function selectTree(key) {
    treeId = key; category = P.byTree[key].category;
    if (P.bySkill[selectedId].tree !== key) selectedId = D.skills.find(skill => skill.tree === key).id;
    render();
  }
  function skillNodeLabel(skill, state, required) {
    return `${skill.name} · ${state==='learned'?'습득 완료':state==='available'?'습득 가능':'조건 미충족'}${required?' · 선택한 기술의 선행 기술':''} · 클릭: 상세 확인 · 더블클릭: 습득 또는 취소`;
  }
  function selectSkill(key) {
    const skill=P.bySkill[key]; if(!skill)return;
    const sameTree=skill.tree===treeId;
    selectedId=key;treeId=skill.tree;category=P.byTree[treeId].category;
    if(!sameTree){render();return;}
    // Preserve node elements across both clicks so the browser can emit dblclick.
    document.querySelectorAll('#skill-tree [data-skill]').forEach(node=>{
      const item=P.bySkill[node.dataset.skill], required=skill.requires.includes(item.id);
      node.classList.toggle('selected',item.id===selectedId);
      node.classList.toggle('prerequisite',required);
      node.setAttribute('aria-pressed',item.id===selectedId);
      node.setAttribute('aria-label',skillNodeLabel(item,node.dataset.state,required));
    });
    renderDetail(P.replay(build));
  }
  function addStat(key) {
    const view = P.replay(build);
    if (view.statPoints < 1 || view.values[key] >= 30) return;
    update(() => build.events.push({id:id(), level:build.level, type:'stat',key}));
  }
  function removeStat(key) {
    const event = build.events.filter(item => item.type === 'stat' && item.key === key && item.level <= build.level).sort((a,b) => b.level-a.level).at(0);
    if (event) update(() => { build.events = build.events.filter(item => item.id !== event.id); }, '능력치 한 포인트를 돌려받았습니다.');
  }
  function toggleSkill(explainBlocked = false) {
    if(publicView){notify('공개 빌드를 복사한 뒤 편집할 수 있습니다.');return;}
    const status = P.availability(build, selectedId), state = P.requirements(build, selectedId), skill = P.bySkill[selectedId];
    if (state.free) { if(explainBlocked)notify('처음부터 습득한 기술은 취소할 수 없습니다.'); return; }
    if (status.learned) update(() => { build.events = build.events.filter(event => event.type !== 'skill' || event.key !== selectedId); }, `${skill.name} 습득을 취소했습니다.`);
    else if (status.available) update(() => build.events.push({id:id(),level:build.level,type:'skill',key:selectedId}), `${skill.name} 습득 · Lv.${build.level}`);
    else if(explainBlocked)notify(status.reason);
  }
  function toggleBook(key) {
    const read = P.replay(build).books.has(key);
    update(() => {
      if (read) build.events = build.events.filter(event => event.type !== 'treatise' || event.key !== key || event.level > build.level);
      else build.events.push({id:id(),level:build.level,type:'treatise',key});
    }, read ? `${bookName(key)} 읽음 표시를 취소했습니다.` : `${bookName(key)} · Lv.${build.level}에 읽었습니다.`);
  }

  function toggleTrait(enabled) {
    const hero = P.character(build.characterId); if (!hero.statBonus) return;
    update(() => {
      build.events = build.events.filter(event => event.type !== 'trait' || event.key !== hero.statBonus.key);
      if (enabled) build.events.push({id:id(),level:build.level,type:'trait',key:hero.statBonus.key});
    }, enabled ? `Lv.${build.level}부터 특성 최대 보상 +${hero.statBonus.max} SP를 적용했습니다.` : '특성 SP 보상을 해제했습니다.');
    $('#trait-max-toggle')?.focus();
  }

  function renderTrait(hero, view) {
    const controls = $('#trait-controls'); controls.hidden = !hero.statBonus && !hero.bonus && hero.id !== D.souvenirs.characterId;
    controls.innerHTML = '';
    if (hero.statBonus) {
      const grant = build.events.find(event => event.type === 'trait' && event.key === hero.statBonus.key);
      const applied = view.statBonus > 0;
      const note = grant ? `Lv.${grant.level} ${applied ? '적용' : '적용 예정'}` : '';
      controls.innerHTML = `<label class="trait-toggle ${applied ? 'applied' : ''}"><input id="trait-max-toggle" type="checkbox" ${applied ? 'checked' : ''} ${note ? 'aria-describedby="trait-bonus-note"' : ''}><span>특성 최대 보상<strong>+${hero.statBonus.max} SP</strong></span></label>${note ? `<p id="trait-bonus-note" class="trait-bonus-note">${note}</p>` : ''}`;
    }
    if (hero.bonus) {
      const progress = hero.bonus === 'survival' ? `생존에 직접 투자한 ${view.counts.survival || 0} AP 기준` : `6 AP 이상 투자한 계열 ${Object.values(view.counts).filter(count => count >= 6).length}개 · 최대 ${hero.bonusCap}회`;
      controls.innerHTML += `<div class="trait-auto"><span>특성 AP 보너스</span><strong>+${view.bonus} AP</strong></div><p class="trait-bonus-note">${progress}</p>`;
    }
    if (hero.id === D.souvenirs.characterId) {
      controls.innerHTML += `<div class="souvenir-summary"><div class="souvenir-summary-heading"><strong>뼈 부적 기념품</strong><span>${view.souvenirs.length} / ${D.souvenirs.limit}</span></div>${view.souvenirs.length ? `<ul>${view.souvenirs.map(option => `<li><strong>${option.trophy}</strong><span>${option.effect}</span><small>기본 ${souvenirValue(option,option.base)} · 최대 ${souvenirValue(option,option.max)}</small></li>`).join('')}</ul>` : '<p>뼈 부적에 붙일 효과를 선택해주세요.</p>'}<button id="open-souvenirs" class="button">${view.souvenirs.length?'기념품 선택 변경':'기념품 선택'}</button></div>`;
    }
  }

  function souvenirValue(option, value) { return `${value>0?'+':''}${value}${option.unit}`; }
  function renderSouvenirs(view) {
    const selected = new Set(view.souvenirs.map(option => option.id)), full = selected.size >= D.souvenirs.limit;
    const isHilda = build.characterId === D.souvenirs.characterId;
    $('#souvenir-selection-count').textContent = `${selected.size} / ${D.souvenirs.limit} 선택`;
    $('#souvenir-options').innerHTML = D.souvenirs.options.map(option => {
      const checked = selected.has(option.id), disabled = !isHilda || (full && !checked);
      return `<tr class="${checked?'selected':''}"><td><label><input type="checkbox" data-souvenir="${option.id}" ${checked?'checked':''} ${disabled?'disabled':''} aria-label="${option.trophy} · ${option.effect}" aria-describedby="souvenir-limit-note"><span>${option.trophy}</span></label></td><td>${option.effect}</td><td>${souvenirValue(option,option.base)}</td><td>${souvenirValue(option,option.max)}</td></tr>`;
    }).join('');
    if (!isHilda && $('#souvenir-dialog').open) $('#souvenir-dialog').close();
  }
  function toggleSouvenir(key, enabled) {
    if (build.characterId !== D.souvenirs.characterId || !Object.hasOwn(P.bySouvenir,key)) return;
    const selected = P.souvenirChoices(build).map(option => option.id);
    if (enabled && !selected.includes(key) && selected.length >= D.souvenirs.limit) {
      renderSouvenirs(P.replay(build)); notify(`기념품은 최대 ${D.souvenirs.limit}개까지 선택할 수 있습니다.`); return;
    }
    if (selected.includes(key) === enabled) return;
    update(()=>{build.souvenirs=enabled?[...selected,key]:selected.filter(id=>id!==key);});
    $(`[data-souvenir="${key}"]`)?.focus();
  }

  function toggleReward(key, enabled) {
    const reward = P.byReward[key]; if (!reward) return;
    update(() => {
      build.events = build.events.filter(event => event.type !== 'reward' || event.key !== key);
      if (enabled) build.events.push({id:id(),level:build.level,type:'reward',key,choice:build.rewardChoices[key]});
    }, enabled ? `Lv.${build.level}부터 ${reward.name} 보상 +${reward.statPoints} SP를 적용했습니다.` : `${reward.name} 보상을 해제했습니다.`);
    $(`[data-reward-toggle="${key}"]`)?.focus();
  }

  function changeRewardChoice(key, choice) {
    const reward = P.byReward[key], option = reward?.choices.find(item => item.id === choice);
    if (!option) return;
    update(() => {
      build.rewardChoices[key] = choice;
      for (const event of build.events) if (event.type === 'reward' && event.key === key) event.choice = choice;
    }, `${reward.name} · ${option.name} · ${option.label}`);
    $(`[data-reward-choice="${key}"]`)?.focus();
  }

  function renderRewards(view) {
    $('#event-reward-controls').innerHTML = D.rewards.map(reward => {
      const grant = build.events.find(event => event.type === 'reward' && event.key === reward.id);
      const active = view.rewards.has(reward.id), choice = build.rewardChoices[reward.id];
      const note = grant ? `Lv.${grant.level} ${active ? '적용' : '적용 예정'}` : '';
      const option = reward.choices.find(item => item.id === choice);
      return `<label class="trait-toggle ${active ? 'applied' : ''}"><input type="checkbox" data-reward-toggle="${reward.id}" ${active ? 'checked' : ''} ${note ? `aria-describedby="reward-note-${reward.id}"` : ''}><span>${reward.name} 보상 적용<strong>+${reward.statPoints} SP</strong></span></label><label class="reward-choice"><span>바친 보석</span><select data-reward-choice="${reward.id}" ${active ? '' : 'disabled'}>${reward.choices.map(item => `<option value="${item.id}" ${item.id === choice ? 'selected' : ''}>${item.name} · ${item.label}</option>`).join('')}</select></label>${active ? `<div class="permanent-bonus"><span>추가 영구 효과</span><strong>${option.label}</strong></div>` : ''}${note ? `<p id="reward-note-${reward.id}" class="reward-note">${note}</p>` : ''}`;
    }).join('');
  }

  function renderGuideStatus() {
    for (const tier of D.guide.tiers) {
      const written = Boolean(build.tierPlans[tier].description.trim());
      $(`#guide-tab-${tier} .tier-tab-state`).textContent = written ? '작성 중' : '미작성';
      $(`#guide-tab-${tier}`).classList.toggle('has-content',written);
    }
    $('#guide-description-count').textContent = `${build.tierPlans[guideTier].description.length.toLocaleString()} / ${D.guide.limits.description.toLocaleString()}`;
  }
  function renderGuide() {
    guideEdit = null;
    const plan = build.tierPlans[guideTier];
    $('#tier-guide-tabs').innerHTML = D.guide.tiers.map(tier => `<button id="guide-tab-${tier}" role="tab" data-guide-tier="${tier}" aria-selected="${tier===guideTier}" aria-controls="tier-guide-editor" tabindex="${tier===guideTier?0:-1}"><strong><span>${tier}</span>티어</strong><small class="tier-tab-state"></small></button>`).join('');
    $('#tier-guide-editor').setAttribute('aria-labelledby',`guide-tab-${guideTier}`);
    $('#tier-guide-editor').innerHTML = `<section class="guide-description"><div class="guide-section-title"><h3>${guideTier}티어 운영</h3><span id="guide-description-count"></span></div><label class="sr-only" for="guide-description">${guideTier}티어 운영 설명</label><textarea id="guide-description" data-guide-field="description" maxlength="${D.guide.limits.description}" placeholder="이 티어에서의 운영 방법을 자유롭게 적어주세요&#10;&#10;예)&#10;&#10;- 티어 진입 추천 레벨&#10;- 전투 운영법&#10;- 스킬 콤보&#10;- 빌드 팁&#10;- 의뢰 루트">${esc(plan.description)}</textarea></section>`;
    renderGuideStatus();
    if(publicView)document.querySelectorAll('#tier-guide-editor [data-guide-field]').forEach(control=>{control.disabled=true;});
  }
  function selectGuide(tier) {
    if (!D.guide.tiers.includes(tier)) return;
    guideTier = tier; renderGuide(); $(`#guide-tab-${tier}`).focus();
  }
  function commitText(target,owner,key,value) {
    if(publicView || owner[key]===value)return false;
    // Keep native typing/focus and group a continuous field edit into one undo step.
    if(guideEdit!==target){history.push(clone(build));if(history.length>60)history.shift();guideEdit=target;}
    owner[key]=value;
    const saved=persist();$('#undo').disabled=false;
    $('#build-status').textContent=saved?'편집 중 · 이 브라우저에 임시 저장됨':'편집 중 · 브라우저 임시 저장 불가';
    return true;
  }
  function editGuide(target) {
    if(target.dataset.guideField!=='description')return;
    if(commitText(target,build.tierPlans[guideTier],'description',target.value.slice(0,D.guide.limits.description)))renderGuideStatus();
  }
  function renderOverview() {
    $('#overview-fields').innerHTML=D.guide.overviewFields.map(field=>`<label class="overview-${field.id}" for="overview-${field.id}"><span>${field.name}</span><textarea id="overview-${field.id}" data-overview-field="${field.id}" maxlength="${field.max}" placeholder="${field.placeholder}">${esc(build.overview[field.id])}</textarea></label>`).join('');
  }
  function editOverview(target) {
    const field=D.guide.overviewFields.find(field=>field.id===target.dataset.overviewField);if(!field)return;
    commitText(target,build.overview,field.id,target.value.slice(0,field.max));
  }
  function renderEquipmentStatus() {
    const count=D.guide.equipmentSlots.filter(slot=>build.equipmentPlan.equipment[slot.id].trim()).length;
    $('#final-equipment-count').textContent=`${count} / ${D.guide.equipmentSlots.length}개 부위 작성`;
  }
  function renderEquipment() {
    const plan=build.equipmentPlan;
    const fields=D.guide.equipmentSlots.map(slot=>`<label class="final-slot-${slot.id}" for="final-slot-${slot.id}"><span>${slot.name}</span><input id="final-slot-${slot.id}" data-equipment-field="equipment" data-equipment-slot="${slot.id}" maxlength="${D.guide.limits.equipment}" value="${esc(plan.equipment[slot.id])}" placeholder="장비명" autocomplete="off"></label>`).join('');
    const archive=Object.entries(build.legacyEquipmentPlans).map(([tier,old])=>`<section><h3>${tier}티어</h3><dl>${D.guide.equipmentSlots.filter(slot=>old.equipment[slot.id].trim()||old.enchantments[slot.id].trim()).map(slot=>`<div><dt>${slot.name}</dt><dd>${esc(old.equipment[slot.id])}${old.enchantments[slot.id].trim()?`<small>인챈트: ${esc(old.enchantments[slot.id])}</small>`:''}</dd></div>`).join('')}</dl>${old.equipmentNotes.trim()?`<p>${esc(old.equipmentNotes)}</p>`:''}</section>`).join('');
    $('#equipment-plan-editor').innerHTML=`<div class="final-equipment-layout"><section class="final-equipment-names" aria-label="최종 장비 이름"><div class="final-equipment-fields">${fields}</div></section><section class="final-equipment-notes"><label for="recommended-enchantments">추천 인챈트 옵션</label><textarea id="recommended-enchantments" data-equipment-field="recommendedEnchantments" maxlength="${D.guide.limits.recommendedEnchantments}" placeholder="추천하는 인챈트 옵션과 우선순위를 적어주세요. 필요한 경우 장비 부위별로 구분해 적어도 좋습니다.">${esc(plan.recommendedEnchantments)}</textarea><label for="final-equipment-notes">장비 설명 ( 선택이유 / 교체순서 / 대체장비 등)</label><textarea id="final-equipment-notes" data-equipment-field="equipmentNotes" maxlength="${D.guide.limits.equipmentNotes}" placeholder="장비 선택 이유, 교체 순서, 대체 장비 등을 자유롭게 적어주세요.">${esc(plan.equipmentNotes)}</textarea><p class="guide-field-hint">장비 계획은 능력치·스킬 효과 계산에 반영되지 않습니다.</p></section></div>${archive?`<details class="legacy-equipment"><summary>이전 티어별 장비 기록</summary><p>이전에 작성한 장비·인챈트·장비 설명을 보관한 기록입니다.</p><div class="legacy-equipment-records">${archive}</div></details>`:''}`;
    renderEquipmentStatus();
  }
  function editEquipment(target) {
    const field=target.dataset.equipmentField,slot=target.dataset.equipmentSlot;
    if(field==='equipment'){
      if(!D.guide.equipmentSlots.some(item=>item.id===slot))return;
      if(commitText(target,build.equipmentPlan.equipment,slot,target.value.slice(0,D.guide.limits.equipment)))renderEquipmentStatus();
    }else if(['recommendedEnchantments','equipmentNotes'].includes(field))commitText(target,build.equipmentPlan,field,target.value.slice(0,D.guide.limits[field]));
  }

  function renderInvestments(view) {
    const invested = D.trees.filter(tree => view.counts[tree.id] > 0)
      .sort((a,b) => view.counts[b.id] - view.counts[a.id]);
    const summary = $('#ability-investments');
    summary.hidden = !invested.length;
    summary.setAttribute('aria-label', `Lv.${build.level} 계열별 기술 투자`);
    summary.innerHTML = invested.map(tree => {
      const skill = D.skills.find(skill => skill.tree === tree.id), count = view.counts[tree.id];
      return `<button class="investment-chip" data-tree="${tree.id}" data-category-color="${tree.category}" aria-pressed="${tree.id === treeId}" aria-label="${tree.name} ${count}개 투자 · 계열 보기" title="직접 투자한 기술 · Lv.${build.level} 기준">${image(skill.image,'')}<span>${tree.name}</span><strong>${count}</strong></button>`;
    }).join('');
  }

  function render() {
    const hero = P.character(build.characterId), view = P.replay(build), tree = P.byTree[treeId];
    $('#build-name').value = build.name; $('#undo').disabled = !history.length;
    $('#saved-count').textContent = library.length;
    $('#character-picker').innerHTML = D.characters.map(item => `<button class="character-choice ${item.id === hero.id ? 'active' : ''}" data-character="${item.id}" aria-label="${item.name} 선택" aria-pressed="${item.id === hero.id}" title="${item.name} · ${item.role}">${image(item.image, item.name)}</button>`).join('');
    $('#portrait').innerHTML = image(hero.image, `${hero.name} 게임 초상화`);
    $('#character-name').textContent = hero.name; $('#character-role').textContent = hero.role; $('#character-english').textContent = hero.english;
    $('#character-level').textContent = `레벨 ${build.level}`;
    $('#trait-name').textContent = hero.trait; $('#trait-description').textContent = hero.description;
    renderTrait(hero, view); renderRewards(view); renderSouvenirs(view);
    $('#stat-points').textContent = view.statPoints; $('#skill-points').textContent = view.skillPoints;
    $('#stats').innerHTML = D.stats.map((stat,index) => `<div class="stat-row"><span class="stat-abbr">${stat.english}</span><span class="stat-label">${stat.name}</span><span class="stat-base">${hero.values[index]} + ${view.values[stat.id] - hero.values[index]}</span><div class="stat-controls"><button data-stat-remove="${stat.id}" aria-label="${stat.name} 한 포인트 취소" ${view.values[stat.id] <= hero.values[index] ? 'disabled' : ''}>−</button><span class="stat-value ${view.values[stat.id] > hero.values[index] ? 'increased' : ''}">${view.values[stat.id]}</span><button data-stat-add="${stat.id}" aria-label="${stat.name} 한 포인트 투자" ${view.statPoints < 1 || view.values[stat.id] >= 30 ? 'disabled' : ''}>+</button></div></div>`).join('');
    $('#starting-skills').textContent = hero.free.length ? `시작 시 습득: ${hero.free.map(key => P.bySkill[key].name).join(', ')} · AP 소모 없음` : '';
    $('#affinity-list').innerHTML = hero.affinity.length ? hero.affinity.map(key => `<span>${P.byTree[key].name}</span>`).join('') : '<span>등록된 계열 없음</span>';
    document.querySelectorAll('[data-category]').forEach(button => { const active = button.dataset.category === category; button.classList.toggle('active',active); button.setAttribute('aria-pressed',active); });
    $('#tree-picker').innerHTML = D.trees.filter(item => item.category === category).map(item => `<button class="tree-tab ${item.id === treeId ? 'active' : ''}" data-tree="${item.id}" aria-pressed="${item.id === treeId}">${item.name}</button>`).join('');
    $('#tree-subtitle').textContent = tree.english;
    const nodes = D.skills.filter(skill => skill.tree === treeId);
    $('#tree-investment').textContent = `${nodes.filter(skill => view.learned.has(skill.id)).length} / ${nodes.length} 습득`;
    renderInvestments(view); renderTree(view, tree, nodes); renderDetail(view); renderJourney();
    $('#level-prev').disabled = build.level === 1; $('#level-next').disabled = build.level === 30;
    $('#level-steps').innerHTML = Array.from({length:30},(_,index) => index+1).map(level => `<button class="level-step ${level === build.level ? 'active' : ''} ${build.events.some(event => event.level === level) ? 'has-events' : ''}" data-level="${level}" aria-label="레벨 ${level}" aria-pressed="${level === build.level}">${level}</button>`).join('');
    const bonuses = [view.statBonus ? `특성 +${view.statBonus} SP` : '',view.eventBonus ? `이벤트 +${view.eventBonus} SP` : '',view.bonus ? `특성 +${view.bonus} AP` : ''].filter(Boolean);
    $('#timeline-caption').textContent = bonuses.join(' · ');
    renderGuide();renderOverview();renderEquipment();
    if (!$('#search-area').hidden) renderSearch();
    const reading=Boolean(publicView);
    for(const key of ['reset','save'])$(`#${key}`).disabled=reading;
    $('#undo').disabled=reading||!history.length;$('#build-name').readOnly=reading;
    if(reading){
      document.querySelectorAll('[data-character],[data-stat-add],[data-stat-remove],[data-book],[data-guide-field],[data-overview-field],[data-equipment-field],[data-souvenir],[data-reward-toggle],[data-reward-choice],#trait-max-toggle,#learn-action').forEach(control=>{control.disabled=true;});
      $('#build-status').textContent='공개 빌드 · 읽기 전용';
    }else if($('#build-status').textContent==='공개 빌드 · 읽기 전용')$('#build-status').textContent='편집 중 · 이 브라우저에 임시 저장됨';
    window.WayfarerCommunity?.editorChanged?.();
  }

  function openPublic(row){
    if(!privateSnapshot)privateSnapshot={build:clone(build),history:clone(history),treeId,category,selectedId,detailTab,guideTier};
    publicView=clone(row);build=P.normalize(row.build);build.level=P.clampLevel(row.level);history=[];
    treeId=row.trees?.find(id=>P.byTree[id])||'sword';category=P.byTree[treeId].category;selectedId=D.skills.find(skill=>skill.tree===treeId).id;
    render();
  }
  function returnPrivate(){
    if(!privateSnapshot)return;
    const saved=privateSnapshot;publicView=null;privateSnapshot=null;
    build=saved.build;history=saved.history;treeId=saved.treeId;category=saved.category;selectedId=saved.selectedId;detailTab=saved.detailTab;guideTier=saved.guideTier;
    render();
  }
  function copyPublic(){
    if(!publicView)return;
    const copied=clone(build),saved=privateSnapshot;
    publicView=null;privateSnapshot=null;build=copied;history=saved?clone(saved.history):[];
    if(saved)history.push(clone(saved.build));if(history.length>60)history.shift();
    persist();render();notify('편집용으로 복사했습니다. 원본 공개 빌드는 바뀌지 않습니다.');
  }
  function renderTree(view, tree, nodes) {
    // These masks follow the original connector pixels, including side ports,
    // curves and gems. A joint stem lights only after its entire AND group.
    const drawParts = parts => parts.map(part => `<path fill="${part.color}" d="${part.d}"/>`).join('');
    const connections = nodes.map(skill => (skill.connections || []).map((group,index) => {
      const complete = skill.prerequisites[index].every(id => view.learned.has(id));
      return group.branches.map(branch => `<g class="connection-segment ${view.learned.has(branch.parent) ? 'active' : ''}" data-connection-from="${branch.parent}" data-connection-to="${skill.id}" data-active="${view.learned.has(branch.parent)}">${drawParts(branch.parts)}</g>`).join('') + (group.join.length ? `<g class="connection-segment ${complete ? 'active' : ''}" data-connection-join="${skill.id}" data-active="${complete}">${drawParts(group.join)}</g>` : '');
    }).join('')).join('');
    $('#skill-tree').innerHTML = `${image(tree.image, `${tree.name} 원본 스킬트리`, 'original-tree')}<span class="tree-korean-title" aria-hidden="true">${tree.name}</span><svg class="tree-connections" viewBox="0 0 ${tree.width} ${tree.height}" aria-hidden="true">${connections}</svg>` + nodes.map(skill => {
      const status = P.availability(build,skill.id), learned = view.learned.has(skill.id), pos = skill.position;
      const state = learned ? 'learned' : status.available ? 'available' : 'locked';
      const required = P.bySkill[selectedId].requires.includes(skill.id);
      return `<button class="skill-node ${state} ${selectedId === skill.id ? 'selected' : ''} ${required ? 'prerequisite' : ''}" style="left:${pos.left/tree.width*100}%;top:${pos.top/tree.height*100}%;width:${pos.width/tree.width*100}%;height:${pos.height/tree.height*100}%" data-skill="${skill.id}" data-state="${state}" aria-label="${skillNodeLabel(skill,state,required)}" aria-pressed="${selectedId === skill.id}" title="${skill.name} (${skill.english}) · 클릭: 효과와 조건 확인 / 더블클릭: 습득·취소">${image(skill.image,skill.name)}${state === 'locked' ? lock : learned ? '<span class="node-check" aria-hidden="true">✓</span>' : ''}</button>`;
    }).join('');
  }
  function renderDetail(view) {
    const skill = P.bySkill[selectedId], state = P.requirements(build,selectedId), status = P.availability(build,selectedId);
    const key = P.bookKey(skill), title = bookName(key);
    const readEvent = build.events.find(event => event.type === 'treatise' && event.key === key && event.level <= build.level);
    const initial = state.innate || state.affinity;
    const attrNames = skill.unlock.attributes.map(attr => D.stats.find(stat => stat.id === attr).name);
    const attrTarget = skill.unlock.points;
    const percent = attrTarget ? Math.min(100,state.current/attrTarget*100) : 0;
    const acquisition = P.byTree[skill.tree].acquisition;
    const purchase = acquisition.purchases[String(skill.tier)];
    const showDropHint = skill.tier === 3 || skill.tier === 4;
    const bookSources = skill.tier > 0 ? `<dl class="book-sources"><div><dt>${showDropHint ? '획득처' : '구매처'}</dt><dd>${showDropHint ? '드랍으로 획득' : esc(purchase)}</dd></div>${skill.tier === 1 && acquisition.trainer ? `<div><dt>교관</dt><dd>${esc(acquisition.trainer)}</dd></div>` : ''}</dl>` : '';
    const routes = [];
    if (skill.tier > 0) routes.push(`<div class="unlock-route ${state.book ? 'met' : ''}" data-route="treatise"><div class="route-title"><span>문헌으로 해금</span><span class="route-status">${state.book ? `Lv.${readEvent.level} 읽음 ✓` : '미확보'}</span></div><p class="route-text">${title}</p>${bookSources}<button class="book-toggle ${state.book ? 'read' : ''}" data-book="${key}" aria-pressed="${state.book}">${state.book ? '✓ 문헌 읽음 · 취소' : `Lv.${build.level}에 읽기`}</button></div>`);
    if (attrTarget !== null) routes.push(`<div class="unlock-route ${state.attributes ? 'met' : ''}" data-route="attributes"><div class="route-title"><span>능력치로 해금</span><span class="route-status">${state.attributes ? '충족 ✓' : '미충족'}</span></div><p class="route-text">${attrNames.join(' + ')} 합산 ${attrTarget}</p><div class="stat-progress"><strong>${state.current}<small> / ${attrTarget}</small></strong><span>${state.attributes ? '충족' : `${state.remaining}포인트 필요`}</span></div><div class="progress-bar" role="progressbar" aria-label="능력치 해금 조건" aria-valuemin="0" aria-valuemax="${attrTarget}" aria-valuenow="${Math.min(state.current,attrTarget)}"><span style="width:${percent}%"></span></div><div class="requirement-chips" title="기본값 10을 초과한 능력치의 합계 · 시작 능력치 포함">${skill.unlock.attributes.map(attr => `<span>${D.stats.find(stat => stat.id === attr).name} +${Math.max(0,view.values[attr]-10)}</span>`).join('')}</div></div>`);
    if (skill.unlock.level !== null) routes.push(`<div class="unlock-route ${state.byLevel ? 'met' : ''}" data-route="level"><div class="route-title"><span>레벨로 해금</span><span class="route-status">${state.byLevel ? '충족 ✓' : '미충족'}</span></div><p class="route-text">레벨 ${skill.unlock.level} 도달</p><div class="stat-progress"><strong>${build.level}<small> / ${skill.unlock.level}</small></strong><span>${state.byLevel ? '충족' : `${skill.unlock.level-build.level}레벨 필요`}</span></div><div class="progress-bar" role="progressbar" aria-label="레벨 해금 조건" aria-valuemin="1" aria-valuemax="${skill.unlock.level}" aria-valuenow="${Math.min(build.level,skill.unlock.level)}"><span style="width:${Math.min(100,build.level/skill.unlock.level*100)}%"></span></div></div>`);
    const paths = state.prerequisites.paths;
    const prereqs = paths.length ? `<div class="prerequisite-paths" data-prerequisites-met="${state.prerequisites.met}">${paths.map(path => `<div class="prerequisite-path ${path.met ? 'met' : ''}" data-path-met="${path.met}"><div class="prerequisite-path-title"><span>${path.required.length > 1 ? '<b class="junction-gem" aria-hidden="true">◆</b> 모두 필요' : '선행 기술'}</span><span>${path.met ? '충족 ✓' : '미충족'}</span></div><div class="prerequisite-list">${path.required.map(required => `<button class="prerequisite-chip ${view.learned.has(required) ? 'met' : ''}" data-inspect="${required}">${image(P.bySkill[required].image,P.bySkill[required].name)}${P.bySkill[required].name}${view.learned.has(required) ? ' ✓' : ''}</button>`).join('<span class="prerequisite-and">그리고</span>')}</div></div>`).join('<div class="prerequisite-or">또는</div>')}</div>` : '';
    const combat = skill.combat || {}, targetNames = {area:'범위',tile:'지정 타일',object:'대상 지정'};
    const metrics = [
      combat.energy !== undefined ? ['기본 기력',combat.energy] : null,
      combat.cooldown !== undefined ? ['기본 재사용',`${combat.cooldown}턴`] : null,
      combat.range !== undefined ? ['사거리',`${combat.range}타일`] : null,
      combat.target ? ['대상',targetNames[combat.target] || combat.target] : null,
      combat.tiles !== undefined ? ['영향 타일',combat.tiles] : null
    ].filter(Boolean);
    const formulas = skill.effects.some(line => E.missingVariables(line).length);
    const typeNames = {attack:'공격 기술',active:'사용 기술',passive:'지속 효과',stance:'자세',spell:'주문',maneuver:'기동 기술',charge:'돌진 기술'};
    const type = typeNames[skill.types?.[0]] || (skill.passive ? '지속 효과' : '사용 기술');
    $('#skill-detail').innerHTML = `
      <div class="detail-header"><div class="detail-icon">${image(skill.image,skill.name)}</div><div><h3>${skill.name}</h3><p>${skill.english}</p><span class="skill-type ${skill.passive ? '' : 'active'}">${type} · ${skill.tier ? `${roman[skill.tier]}단계` : '기초 기술'}</span></div></div>
      ${state.free ? `<p class="innate-notice">${skill.id === 'survival-butchering' ? '모든 캐릭터의 공통 시작 기술' : '캐릭터가 처음부터 습득한 기술'} · AP 소모 없음</p>` : ''}
      <div class="detail-tabs" role="tablist" aria-label="기술 상세 정보">${[['effects','스킬 효과'],['unlock','해금·습득']].map(([key,label]) => `<button id="detail-tab-${key}" role="tab" data-detail-tab="${key}" aria-selected="${detailTab === key}" aria-controls="detail-panel-${key}" tabindex="${detailTab === key ? '0' : '-1'}">${label}</button>`).join('')}</div>
      <div id="detail-panel-effects" role="tabpanel" aria-labelledby="detail-tab-effects" tabindex="0" ${detailTab !== 'effects' ? 'hidden' : ''}>
        ${metrics.length ? `<dl class="combat-metrics">${metrics.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}
        <div class="effects-heading"><strong>기술 효과</strong><span title="현재 기본 능력치로 계산 · 장비·버프 제외${formulas ? ' · 장비·상황 수치는 계산식으로 표시' : ''}">Lv.${build.level} 능력치 기준</span></div>
        <div class="effect-scroll">${skill.effects.map(line=>`<p class="effect-line">${E.renderText(line,view.values)}</p>`).join('')}</div>
        <button class="detail-condition-link" data-detail-tab="unlock">해금 조건 보기 →</button>
      </div>
      <div id="detail-panel-unlock" role="tabpanel" aria-labelledby="detail-tab-unlock" tabindex="0" ${detailTab !== 'unlock' ? 'hidden' : ''}>
        ${initial && !state.free ? '<p class="innate-notice">시작 시 해금</p>' : ''}
        ${routes.length ? `<div class="detail-section-label">해금 조건</div>${routes.join('<div class="route-or">또는</div>')}` : ''}
        ${paths.length ? `<div class="detail-section-label">선행 기술</div>${prereqs}` : ''}
      </div>
      <button id="learn-action" class="button primary learn-action" ${publicView || state.free || !status.available && !status.learned ? 'disabled' : ''}>${state.free ? '시작 시 습득한 기술' : status.learned ? '습득 취소 · 1 AP 반환' : '기술 습득 · 1 AP'}</button>`;
    if(publicView)document.querySelectorAll('#skill-detail [data-book]').forEach(control=>{control.disabled=true;});
  }
  function renderJourney() {
    const plans = Array.from({length:30},(_,index) => {
      const level=index+1, events=build.events.filter(event=>event.level===level);
      const stats=D.stats.map(stat=>{const count=events.filter(event=>event.type==='stat'&&event.key===stat.id).length;return count?`${stat.name} +${count}`:null;}).filter(Boolean);
      const skills=events.filter(event=>event.type==='skill').map(event=>P.bySkill[event.key].name);
      const notes=events.filter(event=>event.type==='treatise').map(event=>`${bookName(event.key)} 읽음`);
      for(const event of events) {
        if(event.type==='trait') notes.push(`특성 최대 보상 +${P.character(build.characterId).statBonus.max} SP`);
        if(event.type==='reward') {const reward=P.byReward[event.key],choice=reward.choices.find(item=>item.id===event.choice);notes.push(`${reward.name} +${reward.statPoints} SP · ${choice.name} (${choice.label})`);}
      }
      return {level,stats,skills,notes};
    });
    const current=plans[build.level-1];
    $('#current-level-plan').innerHTML=`<span class="current-level-label">Lv.${String(build.level).padStart(2,'0')} 투자</span><div class="current-level-content"><span><b>스탯</b> ${esc(current.stats.join(' · ')||'투자 없음')}</span><span><b>스킬</b> ${esc(current.skills.join(' · ')||'투자 없음')}</span>${current.notes.length?`<small>${esc(current.notes.join(' · '))}</small>`:''}</div>`;
    const lines=items=>items.length?items.map(item=>`<span>${esc(item)}</span>`).join(''):'<span class="journey-no-entry">—</span>';
    $('#journey-list').innerHTML=plans.map(plan=>`<tr class="${plan.level===build.level?'current':''}" ${plan.level===build.level?'aria-current="step"':''}><th scope="row"><button data-level="${plan.level}" aria-label="레벨 ${plan.level}로 이동" aria-pressed="${plan.level===build.level}">Lv.${String(plan.level).padStart(2,'0')}</button></th><td class="journey-stats">${lines(plan.stats)}</td><td class="journey-skills">${lines(plan.skills)}</td><td class="journey-notes">${lines(plan.notes)}</td></tr>`).join('');
  }
  function renderSearch() {
    const searchable = text => text.toLocaleLowerCase().replace(/\s/g,'');
    const query = searchable($('#skill-search').value.trim());
    const results = query ? D.skills.filter(skill => [skill.name,skill.english,P.byTree[skill.tree].name,...(P.byTree[skill.tree].aliases || [])].some(text => searchable(text).includes(query))) : [];
    $('#search-results').innerHTML = results.map(skill => `<button class="search-result" data-inspect="${skill.id}">${image(skill.image,skill.name)}<span>${skill.name}</span><small>${P.byTree[skill.tree].name}</small></button>`).join('') || (query ? '<p class="route-hint">검색 결과가 없습니다.</p>' : '');
  }
  function renderLibrary() {
    $('#library-list').innerHTML = library.length ? [...library].reverse().map(item => `<div class="saved-build"><button class="saved-build-main" data-load-build="${esc(item.id)}"><strong>${esc(item.build.name || '이름 없는 여정')}</strong><small>${P.character(item.build.characterId).name} · Lv.${P.clampLevel(item.build.level)} · ${new Date(item.savedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</small></button><button class="delete-build" data-delete-build="${esc(item.id)}" aria-label="${esc(item.build.name)} 삭제">삭제</button></div>`).join('') : '<p class="empty-library">저장한 빌드가 없습니다.<br>빌드 저장으로 첫 계획을 남겨보세요.</p>';
  }

  document.addEventListener('click',event => {
    const button = event.target.closest('button'); if (!button) return;
    const d = button.dataset;
    if (d.character && d.character !== build.characterId) update(() => {window.WayfarerCommunity?.forgetEdit?.();build=P.fresh(d.character);},'캐릭터를 변경했습니다. 되돌리기로 이전 빌드를 복원할 수 있어요.');
    else if (d.statAdd) addStat(d.statAdd);
    else if (d.statRemove) removeStat(d.statRemove);
    else if (d.category) selectTree(D.trees.find(tree => tree.category === d.category).id);
    else if (d.tree) selectTree(d.tree);
    else if (d.skill) selectSkill(d.skill);
    else if (d.inspect) selectSkill(d.inspect);
    else if (d.detailTab) { detailTab=d.detailTab;renderDetail(P.replay(build));$(`#detail-tab-${detailTab}`).focus(); }
    else if (d.book) toggleBook(d.book);
    else if (d.level) selectLevel(Number(d.level));
    else if (d.guideTier) selectGuide(Number(d.guideTier));
    else if (button.id === 'learn-action') toggleSkill();
    else if (button.id === 'open-souvenirs' && build.characterId === D.souvenirs.characterId) $('#souvenir-dialog').showModal();
    else if (button.hasAttribute('data-close-dialog')) button.closest('dialog').close();
    else if (d.loadBuild) {
      const item=library.find(item => item.id===d.loadBuild);
      if(item){returnPrivate();update(()=>{window.WayfarerCommunity?.forgetEdit?.();build=P.normalize(item.build);},'저장한 빌드를 불러왔습니다.');$('#library-dialog').close();window.WayfarerCommunity?.showEditor?.();}
    } else if (d.deleteBuild) {
      const next=library.filter(item=>item.id!==d.deleteBuild);
      try{localStorage.setItem(STORAGE,JSON.stringify(next));library=next;renderLibrary();$('#saved-count').textContent=library.length;notify('저장한 빌드를 삭제했습니다.');}catch{notify('저장소에 접근할 수 없어 삭제하지 못했습니다.');}
    }
  });
  document.addEventListener('dblclick',event=>{
    const node=event.target.closest('#skill-tree [data-skill]');
    if(!node || !Object.hasOwn(P.bySkill,node.dataset.skill))return;
    event.preventDefault();
    selectSkill(node.dataset.skill);toggleSkill(true);
    $(`#skill-tree [data-skill="${node.dataset.skill}"]`)?.focus();
  });
  document.addEventListener('change',event=>{
    if(event.target.id==='trait-max-toggle')toggleTrait(event.target.checked);
    else if(event.target.dataset.souvenir)toggleSouvenir(event.target.dataset.souvenir,event.target.checked);
    else if(event.target.dataset.rewardToggle)toggleReward(event.target.dataset.rewardToggle,event.target.checked);
    else if(event.target.dataset.rewardChoice)changeRewardChoice(event.target.dataset.rewardChoice,event.target.value);
  });
  document.addEventListener('input',event=>{if(event.target.dataset.guideField)editGuide(event.target);else if(event.target.dataset.overviewField)editOverview(event.target);else if(event.target.dataset.equipmentField)editEquipment(event.target);});
  document.addEventListener('focusout',event=>{if(event.target===guideEdit)guideEdit=null;});
  document.addEventListener('keydown',event=>{
    if(event.target.matches('[role="tab"][data-guide-tier]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      const index=D.guide.tiers.indexOf(guideTier), last=D.guide.tiers.length-1;
      selectGuide(event.key==='Home'?D.guide.tiers[0]:event.key==='End'?D.guide.tiers[last]:D.guide.tiers[(index+(event.key==='ArrowRight'?1:last))%D.guide.tiers.length]);
      return;
    }
    if(!event.target.matches('[role="tab"][data-detail-tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();detailTab=event.key==='Home'?'effects':event.key==='End'?'unlock':detailTab==='effects'?'unlock':'effects';
    renderDetail(P.replay(build));$(`#detail-tab-${detailTab}`).focus();
  });
  $('#build-name').addEventListener('change',event=>{const name=event.target.value.trim()||'이름 없는 여정';update(()=>{build.name=name;});});
  $('#level-prev').addEventListener('click',()=>selectLevel(build.level-1));
  $('#level-next').addEventListener('click',()=>selectLevel(build.level+1));
  $('#undo').addEventListener('click',()=>{if(publicView||!history.length)return;build=history.pop();persist();render();notify('이전 변경을 복원했습니다.');});
  $('#reset').addEventListener('click',()=>$('#reset-dialog').showModal());
  $('#confirm-reset').addEventListener('click',()=>{update(()=>{window.WayfarerCommunity?.forgetEdit?.();build=P.fresh(build.characterId);},'1레벨에서 새 계획을 시작합니다.');$('#reset-dialog').close();});
  $('#save').addEventListener('click',()=>{
    if(publicView){notify('공개 빌드를 복사한 뒤 저장해주세요.');return;}
    if(library.length>=20){notify('최대 20개까지 저장할 수 있습니다. 내 빌드에서 공간을 정리해주세요.');return;}
    build.name=$('#build-name').value.trim()||'이름 없는 여정';
    const next=[...library,{id:id(),savedAt:new Date().toISOString(),build:clone(build)}];
    try{localStorage.setItem(STORAGE,JSON.stringify(next));library=next;persist();$('#saved-count').textContent=library.length;$('#build-status').textContent='저장 완료 · 내 빌드에서 다시 열기';notify('빌드를 이 브라우저에 저장했습니다.');}catch{notify('브라우저 저장소에 접근할 수 없어 저장하지 못했습니다.');}
  });
  $('#open-library').addEventListener('click',()=>{renderLibrary();$('#library-dialog').showModal();});
  $('#search-toggle').addEventListener('click',()=>{const area=$('#search-area');area.hidden=!area.hidden;$('#search-toggle').setAttribute('aria-expanded',!area.hidden);if(!area.hidden)$('#skill-search').focus();});
  $('#skill-search').addEventListener('input',renderSearch);
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}));
  window.WayfarerEditor={getBuild:()=>clone(build),getPublic:()=>publicView?clone(publicView):null,openPublic,returnPrivate,copyPublic,notify};
  render();
})();
