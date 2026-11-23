const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawn} = require('node:child_process');
const ORIGIN = 'http://127.0.0.1:18290';
function probe(origin = ORIGIN) {
  return new Promise((resolve, reject) => {
    const request = http.get(origin + '/api/config', response => {
      let body='';
      response.on('data', chunk => { body+=chunk; if(body.length>2e6) request.destroy(new Error('服务响应过大')); });
      response.on('end', () => {
        try {
          const data=JSON.parse(body);
          if(response.statusCode!==200 || typeof data.token!=='string' || !Array.isArray(data.presets) || !data.workflow_controls) throw new Error('unexpected service');
          resolve(true);
        } catch { reject(new Error('18290 端口的服务不是预期的 LuminaUI 服务')); }
      });
      response.on('error',reject);
    });
    request.setTimeout(1800, () => request.destroy(new Error('本地服务响应超时')));
    request.on('error', error => error.code==='ECONNREFUSED' ? resolve(false) : reject(error));
  });
}
function startService(root) {
  const logs=path.join(root,'desktop/logs');
  fs.mkdirSync(logs,{recursive:true});
  const log=fs.openSync(path.join(logs,'webui.log'),'a');
  let child;
  try {
    child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'Start-Lumina.ps1'),'-NoBrowser'],
      {cwd:root,windowsHide:true,detached:true,stdio:['ignore',log,log]});
  } finally { fs.closeSync(log); }
  // Keep the shared service alive so closing windows never cancels a job.
  const state={exited:false,error:null};
  child.on('error',error=>{state.error=error;state.exited=true;});
  child.on('exit',code=>{state.exited=true;state.code=code;});
  child.unref();return state;
}
function createBackend({root,check=probe,launch=startService,wait=ms=>new Promise(r=>setTimeout(r,ms)),timeout=24*60*60*1000,now=Date.now}) {
  let pending=null,owned=null;
  async function connect(report=()=>{}) {
    report('正在检查本地服务…');
    if(await check())return {reused:true};
    if(!owned || owned.exited)owned=launch(root);
    report('正在检查运行环境与 Qwen 权重。首次下载约 19.4 GB，请保持窗口打开。');
    const deadline=now()+timeout;
    while(now()<deadline) {
      if(await check())return {reused:false};
      if(owned.exited)throw new Error(owned.error?.message || '本地服务未能启动，请查看 desktop/logs/webui.log 和 webui/data/comfyui.log');
      await wait(800);
    }
    throw new Error('启动等待超时。后台仍在启动时可重试连接；日志位于 desktop/logs/webui.log。');
  }
  return {ensure(report){if(!pending)pending=connect(report).finally(()=>pending=null);return pending;}};
}
module.exports={ORIGIN,probe,createBackend};
