// Dependencies are supplied by the shell so lifecycle behavior can be tested without exiting Electron.
function createCloseController({win,app,showDialog,read,write,ensureTray,getActivity}){
  let pending=null,quitting=false;
  function restore(){if(win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();}
  async function perform(explicitExit){
    let action=explicitExit?'exit':read().closeAction,remember=false;
    if(action==='ask'){
      restore();
      const result=await showDialog(win,{type:'question',message:'关闭主窗口',detail:'最小化到托盘后，软件会继续运行。\n退出会关闭桌面界面，未保存的编辑会丢失；已提交的生成任务仍在后台继续。',buttons:['取消','退出软件','最小化到托盘'],cancelId:0,defaultId:2,primaryId:2,checkboxLabel:'记住我的选择，不再询问'});
      if(result.response===0)return;
      action=result.response===2?'tray':'exit';remember=result.checkboxChecked;
    }
    if(win.isDestroyed())return;
    if(action==='tray'){
      ensureTray(); // Never hide the only window if creating the tray fails.
      if(remember)write({closeAction:action});
      win.hide();return;
    }
    const activity=await getActivity();
    if(activity===null||activity>0){
      restore();
      const result=await showDialog(win,{type:'warning',message:activity===null?'无法确认生成任务状态':`还有 ${activity} 个生成任务`,detail:'退出桌面界面后，已提交的生成任务仍会在后台继续。未保存的编辑会丢失。\n确定退出软件吗？',buttons:['取消','退出软件'],cancelId:0,defaultId:0,primaryId:1,danger:true});
      if(result.response!==1)return;
    }
    if(win.isDestroyed())return;
    if(remember)write({closeAction:action});
    quitting=true;
    // The user chose exit. Destroy owned views too, including pages with beforeunload handlers.
    win.destroy();app.quit();
  }
  function request(explicitExit=false){
    if(quitting||win.isDestroyed())return Promise.resolve();
    if(!pending)pending=perform(explicitExit).catch(async error=>{restore();await showDialog(win,{type:'error',message:'未能完成关闭操作',detail:error.message});}).finally(()=>{pending=null;});
    return pending;
  }
  win.on('close',event=>{if(!quitting){event.preventDefault();request();}});
  const beforeQuit=event=>{if(!quitting&&!win.isDestroyed()){event.preventDefault();request(true);}};
  app.on('before-quit',beforeQuit);
  win.once('closed',()=>app.removeListener('before-quit',beforeQuit));
  return {request,restore};
}
module.exports={createCloseController};
