const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('paneDesktop',Object.freeze({
 platform:process.platform,
 backendId:process.argv.find(value=>value.startsWith('--pane-backend-id='))?.split('=')[1]||'',
 updates(action,value){if(['state','check','download','install'].includes(action)||action==='automatic'&&typeof value==='boolean')return ipcRenderer.invoke('pane:updates',action,value);return Promise.reject(new Error('Invalid update action.'));},
 onUpdateState(callback){const listener=(_event,value)=>callback(value);ipcRenderer.on('pane:update-state',listener);return ()=>ipcRenderer.removeListener('pane:update-state',listener);},
 windowControl(action){if(['minimize','maximize','close','menu','state'].includes(action))return ipcRenderer.invoke('pane:window',action);return Promise.resolve();},
 onWindowState(callback){const listener=(_event,value)=>callback(value);ipcRenderer.on('pane:window-state',listener);ipcRenderer.invoke('pane:window','state').then(value=>{if(value)callback(value);});return ()=>ipcRenderer.removeListener('pane:window-state',listener);},
 notify(value){ipcRenderer.send('pane:notify',value);},
 onNotificationClick(callback){ipcRenderer.on('pane:notification-click',(_event,id)=>{if(typeof id==='string')callback(id);});},
 onCheckpoint(callback){
  ipcRenderer.on('pane:checkpoint',(_event,id)=>{
   if(typeof id!=='string')return;
   Promise.resolve().then(()=>callback()).then(value=>ipcRenderer.send('pane:checkpoint-result',{id,...value}),()=>ipcRenderer.send('pane:checkpoint-result',{id,saved:false}));
  });
 }
}));
