window.luminaStartup.onStatus(({message,error})=>{document.getElementById('status').textContent=message;document.getElementById('actions').hidden=!error;document.getElementById('loader').hidden=!!error;});
document.getElementById('retry').onclick=()=>{document.getElementById('actions').hidden=true;window.luminaStartup.retry();};
document.getElementById('logs').onclick=()=>window.luminaStartup.logs();
