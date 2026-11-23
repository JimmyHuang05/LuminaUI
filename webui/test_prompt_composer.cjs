const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/index.html','utf8');
const busy=source.split(/\r?\n/).find(line=>line.trim().startsWith('function busy(value)'));
for(const draft of ['', 'A ceramic cup']){
  const controls=Array.from({length:8},()=>({disabled:false}));
  const context={pending:false,creator:{querySelectorAll:()=>controls},draft,versions:[],save:controls[0],apply:controls[1],undo:controls[2],formatButton:controls[3],scheduleSave(){}};
  vm.createContext(context);vm.runInContext(busy,context);
  vm.runInContext('busy(true)',context);
  assert.equal(context.pending,true);assert.ok(controls.every(c=>c.disabled));
  vm.runInContext('busy(false)',context);
  assert.equal(context.pending,false);assert.equal(context.save.disabled,!draft);assert.equal(context.apply.disabled,!draft);assert.equal(context.undo.disabled,true);
  assert.equal(context.formatButton.disabled,!draft);
  assert.ok(controls.slice(4).every(c=>!c.disabled));
}
for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
console.log('Prompt composer busy/restore regression checks passed');
