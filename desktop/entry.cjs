const {app}=require('electron');
if(process.platform==='win32')app.setAppUserModelId('LuminaUI.Desktop');
if(process.argv.includes('--preview'))require('./main.cjs');
else require('./live-main.cjs');
