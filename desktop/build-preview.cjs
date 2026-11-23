// Preserve the web UI verbatim; only resolve routes and install an offline adapter.
const fs = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, '../webui');
const output = path.join(__dirname, 'web-preview');
const routes = {'/':'home.html','/workbench':'index.html','/resources':'resources.html','/generated':'generated.html','/image-reader':'image-reader.html','/pe-chat':'pe-chat.html','/settings':'settings.html'};
fs.mkdirSync(output, {recursive:true});
for (const name of fs.readdirSync(source)) {
  if (/\.(js|css)$/.test(name)) fs.copyFileSync(path.join(source,name), path.join(output,name));
}
fs.writeFileSync(path.join(output,'prompt-fields.js'), 'window.promptFieldGroups='+fs.readFileSync(path.join(source,'prompt_fields.json'),'utf8')+';');
const fixtures = {
  '/camera-presets.json': JSON.parse(fs.readFileSync(path.join(source,'camera-presets.json'),'utf8')),
  '/api/config': {token:'desktop-ui-preview',presets:[],workflow_controls:JSON.parse(fs.readFileSync(path.join(source,'workflow_controls.json'),'utf8'))},
  '/api/dashboard': {online:false,image_count:0,prompt_count:0,active_jobs:0,images:[],recent:[]},
  '/api/hardware': {unavailable:true},
  '/api/pe-chat': {id:'preview',title:'新对话',revision:0,messages:[],sessions:[{id:'preview',title:'新对话',pinned:false,pending:false,message_count:0}]},
  '/api/status': {online:false,jobs:[],queue:0,missing_inputs:[]},
  '/api/prompts': [], '/api/characters': [], '/api/loras': {files:[],groups:[]},
  '/api/models': {groups:[]}, '/api/lora-v2': {files:[],categories:[],revision:0},
  '/api/settings': {idle_release_seconds:90,schema:JSON.parse(fs.readFileSync(path.join(source,'workflow_controls.json'),'utf8')),local_pe:{ready:false,files:[]},locations:{}},
  '/api/generated-images': {images:[],total:0,next:null},
  '/api/pe-models': {models:[],default_id:'',...JSON.parse(fs.readFileSync(path.join(source,'pe_presets.json'),'utf8'))},
  '/api/assistant/settings': {base_url:'',model:'',has_api_key:false,defaults:{},instructions:{}}
};
fs.writeFileSync(path.join(output,'preview-fixtures.js'),'window.desktopPreviewFixtures='+JSON.stringify(fixtures)+';');
fs.copyFileSync(path.join(__dirname,'preview-adapter.js'),path.join(output,'preview-adapter.js'));
for (const name of new Set(Object.values(routes))) {
  let html=fs.readFileSync(path.join(source,name),'utf8');
  html=html.replace(/(src|href)="\/([^"\n]*)"/g,(_,attr,tail)=>{const [pathname,...query]=tail.split('?');return `${attr}="${routes['/'+pathname] || pathname}${query.length?'?'+query.join('?'):''}"`;});
  html=html.replace(/<head>/i,'<head><script src="preview-fixtures.js"></script><script src="preview-adapter.js"></script>');
  fs.writeFileSync(path.join(output,name),html);
}
console.log('Web UI preview synced: 7 pages; original styles and layout retained.');
