(function(root){
  'use strict';
  const S=root.WayfarerSharing||(typeof require!=='undefined'?require('./sharing.js'):null);
  const D=root.WAYFARER_DATA||(typeof require!=='undefined'?require('./data.js'):null);
  const columns='id,owner_id,title,author_name,summary,character_id,level,trees,created_at,updated_at';
  function configuration(config={}){
    if(!config.supabaseUrl&&!config.supabasePublishableKey)return null;
    let url;try{url=new URL(config.supabaseUrl);}catch{throw new Error('공개 빌드 연결 설정을 확인해주세요.');}
    const key=config.supabasePublishableKey;
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!key)throw new Error('공개 빌드 연결 설정을 확인해주세요.');
    let publicKey=typeof key==='string'&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if(typeof key==='string'&&key.startsWith('eyJ')){
      try{const decode=typeof atob==='function'?atob:value=>Buffer.from(value,'base64').toString();publicKey=JSON.parse(decode(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{publicKey=false;}
    }
    if(!publicKey)throw new Error('브라우저 연결에는 공개용 키가 필요합니다. 관리자 키는 사용할 수 없습니다.');
    return {url:url.origin,key};
  }
  function create(config,options={}){
    const settings=configuration(config);let connection=null;
    async function connect(){
      if(!settings)throw new Error('공개 빌드 기능이 아직 연결되지 않았습니다.');
      if(!connection)connection=(async()=>{
        const sdk=options.loadSdk?await options.loadSdk():await import('https://esm.sh/@supabase/supabase-js@2.118.0?bundle');
        return sdk.createClient(settings.url,settings.key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'wayfarer-auth-v1'}});
      })().catch(()=>{connection=null;throw new Error('공개 빌드 서버에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도해주세요.');});
      return connection;
    }
    function fail(error){
      if(!error)return;
      if(error.code==='PGRST116')throw new Error('빌드를 찾을 수 없거나 수정 권한이 없습니다.');
      if(error.code==='42501')throw new Error('작성자 계정으로 로그인해야 합니다.');
      if(error.code==='23514'||error.code==='22001')throw new Error('빌드 이름이나 설명의 길이와 내용을 확인해주세요.');
      throw new Error('공개 빌드 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    async function user(){const client=await connect(),{data,error}=await client.auth.getUser();if(error||!data.user)throw new Error('로그인 후 이용해주세요.');return data.user;}
    return {
      configured:Boolean(settings),
      async session(){const client=await connect(),{data,error}=await client.auth.getSession();fail(error);return data.session;},
      async watch(callback){const client=await connect();return client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>callback(session),0);});},
      async signIn(redirectTo){const client=await connect(),{error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo}});fail(error);},
      async signOut(){const client=await connect(),{error}=await client.auth.signOut({scope:'local'});fail(error);},
      async list({page=0,character='',search='',mine=false}={}){
        const client=await connect(),offset=Math.max(0,Math.trunc(page)||0)*S.limits.pageSize;
        let query=client.from('published_builds').select(`${columns},investment_events:build->events`,{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false});
        if(character){if(!D.characters.some(hero=>hero.id===character))throw new Error('캐릭터를 확인해주세요.');query=query.eq('character_id',character);}
        if(search.trim())query=query.ilike('title',`%${search.trim().slice(0,60).replace(/[\\%_]/g,'\\$&')}%`);
        if(mine)query=query.eq('owner_id',(await user()).id);
        const {data,error,count}=await query.range(offset,offset+S.limits.pageSize-1);fail(error);
        return {items:(data||[]).map(S.readCard),count:count||0};
      },
      async get(id){if(!S.validId(id))throw new Error('빌드 주소가 올바르지 않습니다.');const client=await connect(),{data,error}=await client.from('published_builds').select(`${columns},build`).eq('id',id).single();fail(error);return S.readPublication(data);},
      async save(build,author,summary,id=''){
        const owner=await user(),client=await connect(),payload=S.publication(build,author,summary);
        if(id&&!S.validId(id))throw new Error('수정할 빌드를 확인해주세요.');
        const query=id?client.from('published_builds').update(payload).eq('id',id).eq('owner_id',owner.id):client.from('published_builds').insert(payload);
        const {data,error}=await query.select(`${columns},build`).single();fail(error);return S.readPublication(data);
      },
      async remove(id){if(!S.validId(id))throw new Error('삭제할 빌드를 확인해주세요.');const owner=await user(),client=await connect(),{error}=await client.from('published_builds').delete().eq('id',id).eq('owner_id',owner.id).select('id').single();fail(error);}
    };
  }
  const api={configuration,create};root.WayfarerCloud=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
