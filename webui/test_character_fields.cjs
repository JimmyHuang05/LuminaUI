const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('webui/resources.js','utf8');
const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,append(){}});return nodes.get(id)};
const context={window:{promptFieldGroups:JSON.parse(fs.readFileSync('webui/prompt_fields.json','utf8'))},$,element:()=>({value:'',append(){},setAttribute(){}})};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  const characterFields='),source.indexOf('  function editCharacter(')),context);
const card=JSON.parse(fs.readFileSync('webui/data/character_cards.json','utf8'))[0];context.input=card.prompt;vm.runInContext('loadCharacterFields(input);output=characterPrompt()',context);assert.equal(context.output.trim(),card.prompt.trim());assert.equal($('character-legacy').value,'');
context.input='Unstructured original character text.';vm.runInContext('loadCharacterFields(input);output=characterPrompt()',context);assert(context.output.includes(context.input));
context.input='[Hair]\nBlack hair.\n\n[Skin]\n\n[Essential Constraints]';vm.runInContext('loadCharacterFields(input);output=characterPrompt()',context);assert.equal($('character-legacy').value,'');assert(context.output.includes('[Skin]\n\n\n[Presence]\n\n\n[Essential Constraints]'));
console.log('PASS character fields: round-trip, legacy preservation, empty trailing fields');
