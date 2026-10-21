(() => {
  'use strict';
  const D=window.WAYFARER_DATA,P=window.WayfarerPlanner,S=window.WayfarerSharing,E=window.WayfarerEditor;
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let api,session=null,page=0,total=0,listVersion=0,routeVersion=0,pendingTarget=null,deleteTarget=null,posting=false,wasReading=false;
  const authorKey='wayfarer-publish-details-v1';let draft={};
  try{draft=JSON.parse(localStorage.getItem(authorKey)||'{}')||{};}catch{}
  try{api=window.WayfarerCloud.create(window.WAYFARER_CLOUD||{});}catch(error){$('#community-status').textContent=error.message;}
  const connected=()=>Boolean(api?.configured);
  const text=value=>typeof value==='string'?value:'';
  const owned=row=>Boolean(session?.user&&row?.owner_id===session.user.id);
  const date=value=>{const time=new Date(value);return Number.isFinite(time.valueOf())?time.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'';};
  const message=error=>error instanceof Error?error.message:'요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.';
  function navigate(hash){if(window.location.hash===`#${hash}`)void route();else window.location.hash=hash;}
  function showBoard(board){$('.workspace').hidden=board;$('#community-page').hidden=!board;$('#show-builder').classList.toggle('nav-current',!board);$('#show-community').classList.toggle('nav-current',board);}
  function editorChanged(){
    const row=E.getPublic();$('#public-build-banner').hidden=!row;$('#open-publish').disabled=Boolean(row);
    if(row){$('#public-build-byline').textContent=`${row.author_name}의 공개 빌드 · ${date(row.updated_at)}`;$('#public-build-summary').textContent=row.summary;$('#public-build-summary').hidden=!row.summary;$('#public-edit').hidden=!owned(row);}
    else if(wasReading&&window.location.hash.startsWith('#build='))window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#builder`);
    wasReading=Boolean(row);
  }
  function accountChanged(){
    $('#account-action').textContent=session?.user?'로그아웃':'Google로 로그인';
    $('#community-mine').disabled=!session?.user;if(!session?.user)$('#community-mine').checked=false;
    $('#publish-login').hidden=Boolean(session?.user);$('#publish-submit').disabled=!session?.user||posting||!connected();
    editorChanged();
  }
  function card(row){
    const hero=P.character(row.character_id);
    const investments=row.investments.map(({tree:id,count})=>{
      const tree=P.byTree[id],skill=D.skills.find(skill=>skill.tree===id);
      return `<span class="investment-chip" data-category-color="${tree.category}" role="listitem" aria-label="${tree.name} ${count}개 습득"><img src="${skill.image}" alt="" draggable="false"><span>${tree.name}</span><strong>${count}</strong></span>`;
    }).join('');
    return `<article class="public-card"><button class="public-card-open" data-public-open="${row.id}"><div class="public-card-heading"><img src="${hero.image}" alt="${hero.name}" draggable="false"><div><h2>${esc(row.title)}</h2><p>${hero.name} · Lv.${row.level}</p></div></div><p class="public-card-summary">${esc(row.summary||'한 줄 소개가 없는 빌드입니다.')}</p>${investments?`<div class="public-card-investments" role="list" aria-label="계열별 습득 기술">${investments}</div>`:''}</button><div class="public-card-footer"><span>${esc(row.author_name)}<small>${date(row.created_at)}</small></span><div><button data-public-share="${row.id}">공유</button>${owned(row)?`<button data-public-edit="${row.id}">수정</button><button data-public-delete="${row.id}" data-public-title="${esc(row.title)}">삭제</button>`:''}</div></div></article>`;
  }
  async function loadList(){
    const version=++listVersion;$('#community-list').innerHTML='';$('#community-status').textContent='빌드를 불러오는 중입니다.';
    $('#community-prev').disabled=true;$('#community-next').disabled=true;$('#community-page-number').textContent='';
    if(!connected()){$('#community-status').textContent='공개 빌드 기능을 준비 중입니다. 현재 빌더와 브라우저 저장은 이용할 수 있습니다.';return;}
    try{
      const result=await api.list({page,character:$('#community-character').value,search:$('#community-search').value,mine:$('#community-mine').checked});
      if(version!==listVersion)return;total=result.count;
      $('#community-list').innerHTML=result.items.map(card).join('');$('#community-status').textContent=total?`${total}개의 공개 빌드`:'조건에 맞는 공개 빌드가 없습니다.';
      $('#community-page-number').textContent=total?`${page+1} / ${Math.ceil(total/S.limits.pageSize)}`:'';
      $('#community-prev').disabled=page===0;$('#community-next').disabled=(page+1)*S.limits.pageSize>=total;
    }catch(error){if(version===listVersion)$('#community-status').textContent=message(error);}
  }
  async function openPublish(){
    if(E.getPublic()){E.notify('편집용으로 복사한 뒤 공개해주세요.');return;}
    $('#publish-build-name').textContent=E.getBuild().name;$('#publish-status').textContent='';
    $('#publish-author').value=text(pendingTarget?.author_name||draft.author||session?.user?.user_metadata?.full_name).slice(0,30);
    $('#publish-summary').value=text(pendingTarget?.summary??draft.summary).slice(0,240);
    $('#publish-target').innerHTML='<option value="">새 빌드로 공개</option>';$('#publish-submit').textContent='공개하기';
    if(!$('#publish-dialog').open)$('#publish-dialog').showModal();accountChanged();
    if(!connected()){$('#publish-status').textContent='공개 빌드 기능이 아직 연결되지 않았습니다.';return;}
    if(!session?.user)return;
    try{
      const result=await api.list({mine:true}),rows=pendingTarget&&owned(pendingTarget)?[pendingTarget,...result.items.filter(row=>row.id!==pendingTarget.id)]:result.items;
      $('#publish-target').innerHTML='<option value="">새 빌드로 공개</option>'+rows.map(row=>`<option value="${row.id}" ${row.id===pendingTarget?.id?'selected':''}>기존 빌드 수정 · ${esc(row.title)}</option>`).join('');
      $('#publish-submit').textContent=$('#publish-target').value?'수정 내용 공개':'공개하기';
    }catch(error){$('#publish-status').textContent=message(error);}
  }
  async function signIn(returnTo){
    if(!connected()){E.notify('공개 빌드 기능이 아직 연결되지 않았습니다.');return;}
    const target=new URL(window.location.href);target.search='';target.hash=returnTo;
    try{await api.signIn(target.href);}catch(error){E.notify(message(error));}
  }
  function share(id){$('#share-url').value=S.buildLink(window.location.href,id);$('#share-dialog').showModal();}
  async function edit(id){
    try{const row=await api.get(id);if(!owned(row))throw new Error('작성자 계정으로 로그인해주세요.');pendingTarget=row;E.openPublic(row);E.copyPublic();navigate('builder');E.notify('내용을 수정한 뒤 공개하기에서 기존 빌드를 업데이트해주세요.');}
    catch(error){E.notify(message(error));}
  }
  async function route(){
    const version=++routeVersion,hash=window.location.hash.slice(1);
    if(hash==='community'){showBoard(true);await loadList();return;}
    if(hash.startsWith('build=')){
      showBoard(true);$('#community-status').textContent='공개 빌드를 불러오는 중입니다.';
      if(!connected()){$('#community-status').textContent='공개 빌드 기능이 아직 연결되지 않았습니다.';return;}
      try{const row=await api.get(hash.slice(6));if(version!==routeVersion)return;E.openPublic(row);showBoard(false);editorChanged();}
      catch(error){if(version===routeVersion)$('#community-status').textContent=message(error);}
      return;
    }
    E.returnPrivate();showBoard(false);if(hash==='publish')await openPublish();
  }
  $('#show-community').addEventListener('click',()=>navigate('community'));
  for(const key of ['show-builder','community-create','public-return'])$(`#${key}`).addEventListener('click',()=>navigate('builder'));
  $('#public-copy').addEventListener('click',()=>{pendingTarget=null;E.copyPublic();navigate('builder');});
  $('#public-edit').addEventListener('click',()=>{const row=E.getPublic();if(row)void edit(row.id);});
  $('#public-share').addEventListener('click',()=>{const row=E.getPublic();if(row)share(row.id);});
  $('#open-publish').addEventListener('click',()=>void openPublish());
  $('#account-action').addEventListener('click',async()=>{try{if(session?.user){await api.signOut();session=null;accountChanged();if(!$('#community-page').hidden)await loadList();}else await signIn('community');}catch(error){E.notify(message(error));}});
  $('#publish-sign-in').addEventListener('click',()=>void signIn('publish'));
  $('#community-filters').addEventListener('submit',event=>{event.preventDefault();page=0;void loadList();});
  for(const key of ['community-character','community-mine'])$(`#${key}`).addEventListener('change',()=>{page=0;void loadList();});
  $('#community-prev').addEventListener('click',()=>{if(page>0){page--;void loadList();}});
  $('#community-next').addEventListener('click',()=>{if((page+1)*S.limits.pageSize<total){page++;void loadList();}});
  $('#publish-target').addEventListener('change',()=>{$('#publish-submit').textContent=$('#publish-target').value?'수정 내용 공개':'공개하기';});
  $('#publish-form').addEventListener('input',()=>{draft={author:$('#publish-author').value,summary:$('#publish-summary').value};try{localStorage.setItem(authorKey,JSON.stringify(draft));}catch{}});
  $('#publish-form').addEventListener('submit',async event=>{
    event.preventDefault();if(posting)return;if(!session?.user){$('#publish-status').textContent='로그인 후 공개해주세요.';return;}
    posting=true;accountChanged();$('#publish-status').textContent='공개 빌드를 저장하는 중입니다.';
    try{
      const row=await api.save(E.getBuild(),$('#publish-author').value,$('#publish-summary').value,$('#publish-target').value);
      pendingTarget=null;$('#publish-dialog').close();E.openPublic(row);showBoard(false);window.location.hash=`build=${row.id}`;share(row.id);
    }catch(error){$('#publish-status').textContent=message(error);}finally{posting=false;accountChanged();}
  });
  $('#copy-share-url').addEventListener('click',async()=>{
    try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText($('#share-url').value);E.notify('공유 주소를 복사했습니다.');}
    catch{$('#share-url').focus();$('#share-url').select();E.notify('주소를 선택했습니다. 복사해서 공유해주세요.');}
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;const data=button.dataset;
    if(data.publicOpen)navigate(`build=${data.publicOpen}`);
    else if(data.publicShare)share(data.publicShare);
    else if(data.publicEdit)void edit(data.publicEdit);
    else if(data.publicDelete){deleteTarget={id:data.publicDelete,title:data.publicTitle};$('#delete-public-name').textContent=deleteTarget.title;$('#delete-public-status').textContent='';$('#delete-public-dialog').showModal();}
  });
  $('#delete-public-confirm').addEventListener('click',async()=>{
    if(!deleteTarget)return;const button=$('#delete-public-confirm');button.disabled=true;
    try{await api.remove(deleteTarget.id);if(E.getPublic()?.id===deleteTarget.id)E.returnPrivate();deleteTarget=null;$('#delete-public-dialog').close();page=0;navigate('community');}
    catch(error){$('#delete-public-status').textContent=message(error);}finally{button.disabled=false;}
  });
  $('#community-character').innerHTML='<option value="">모든 캐릭터</option>'+D.characters.map(hero=>`<option value="${hero.id}">${hero.name}</option>`).join('');
  window.WayfarerCommunity={editorChanged,forgetEdit:()=>{pendingTarget=null;},showEditor:()=>navigate('builder')};window.addEventListener('hashchange',()=>void route());
  async function init(){
    accountChanged();
    if(connected()){
      try{session=await api.session();await api.watch(next=>{session=next;accountChanged();if(window.location.hash==='#community')void loadList();});}
      catch(error){E.notify(message(error));}
    }
    accountChanged();await route();
  }
  void init();
})();
