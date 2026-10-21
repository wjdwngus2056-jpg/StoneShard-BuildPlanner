const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {configuration}=require('../cloud.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
const files=['index.html','styles.css','community.css','game-data.js','data.js','planner.js','effects.js','sharing.js','cloud.js','app.js','community.js','_headers'];
for(const file of [...files,'cloud-config.js'])if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing site file: ${file}`);
const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'cloud-config.js'),'utf8'),scope,{timeout:1000});
const config=process.env.SUPABASE_URL||process.env.SUPABASE_PUBLISHABLE_KEY?{supabaseUrl:process.env.SUPABASE_URL||'',supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||''}:scope.window.WAYFARER_CLOUD;
const ready=configuration(config);
if(process.argv.includes('--require-cloud')&&!ready)throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Cloudflare Pages before deploying.');
function noLink(target){if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw new Error('Build output must not contain symbolic links.');}
noLink(out);
if(fs.existsSync(out)){
  const allowed=new Set([...files,'cloud-config.js','assets']);
  if(fs.readdirSync(out).some(name=>!allowed.has(name)))throw new Error('dist contains unrelated files; use a dedicated output folder.');
}
fs.mkdirSync(out,{recursive:true});let copied=0;
function copy(source,target){noLink(source);noLink(target);fs.copyFileSync(source,target);copied++;}
for(const file of files)copy(path.join(root,file),path.join(out,file));
noLink(path.join(out,'cloud-config.js'));
fs.writeFileSync(path.join(out,'cloud-config.js'),`window.WAYFARER_CLOUD = ${JSON.stringify(config,null,2)};\n`);
function assets(source,target){
  noLink(source);noLink(target);fs.mkdirSync(target,{recursive:true});
  for(const item of fs.readdirSync(source,{withFileTypes:true})){
    if(item.isSymbolicLink())throw new Error('Asset links are not allowed in the static build.');
    const from=path.join(source,item.name),to=path.join(target,item.name);
    if(item.isDirectory())assets(from,to);else if(item.isFile()&&(/\.png$/i.test(item.name)||item.name==='sources.json'))copy(from,to);
  }
}
assets(path.join(root,'assets'),path.join(out,'assets'));
console.log(`Prepared dist with ${copied+1} site files. Public builds: ${ready?'configured':'not connected (local review only)'}.`);
