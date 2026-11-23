const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createBackend,probe}=require('./backend.cjs');
test('reuse running backend without starting another process',async()=>{
 const backend=createBackend({check:async()=>true,launch:()=>assert.fail('must not launch')});
 assert.deepEqual(await backend.ensure(),{reused:true});
});
test('concurrent startup requests launch only once',async()=>{
 let checks=0,launches=0;const backend=createBackend({check:async()=>++checks>=3,launch:()=>{launches++;return {exited:false};},wait:async()=>{}});
 await Promise.all([backend.ensure(),backend.ensure()]);assert.equal(launches,1);
});
test('startup process failure is surfaced',async()=>{
 const backend=createBackend({check:async()=>false,launch:()=>({exited:true,error:new Error('spawn failed')})});
 await assert.rejects(backend.ensure(),/spawn failed/);
});
test('timeout retry keeps existing startup process',async()=>{
 let clock=0,launches=0;const backend=createBackend({check:async()=>false,launch:()=>{launches++;return {exited:false};},now:()=>clock,timeout:5,wait:async()=>clock+=6});
 await assert.rejects(backend.ensure(),/超时/);await assert.rejects(backend.ensure(),/超时/);assert.equal(launches,1);
});
test('probe rejects unrelated local service',async()=>{
 const server=http.createServer((_req,res)=>res.end('{"hello":true}'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await assert.rejects(probe('http://127.0.0.1:'+server.address().port),/不是预期/);}finally{await new Promise(r=>server.close(r));}
});
