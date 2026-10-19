const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('paneDesktop',Object.freeze({
 platform:process.platform,
 updateFlowVersion:process.argv.includes('--pane-update-flow=1')?1:0,
 notificationVersion:process.argv.includes('--pane-notifications=1')?1:0,
 browserVersion:process.argv.includes('--pane-browser=1')?1:0,
 onBrowserOpen(callback){ipcRenderer.on('pane:browser-open',(_event,url)=>{if(typeof url==='string')callback(url);});},
 backendId:process.argv.find(value=>value.startsWith('--pane-backend-id='))?.split('=')[1]||'',
 updates(action,value){if(['state','check','download','install'].includes(action)||action==='update'&&process.argv.includes('--pane-update-flow=1')||action==='automatic'&&typeof value==='boolean')return ipcRenderer.invoke('pane:updates',action,value);return Promise.reject(new Error('Invalid update action.'));},
 onUpdateState(callback){const listener=(_event,value)=>callback(value);ipcRenderer.on('pane:update-state',listener);return ()=>ipcRenderer.removeListener('pane:update-state',listener);},
 windowControl(action){if(['minimize','maximize','close','menu','state'].includes(action))return ipcRenderer.invoke('pane:window',action);return Promise.resolve();},
 onWindowState(callback){const listener=(_event,value)=>callback(value);ipcRenderer.on('pane:window-state',listener);ipcRenderer.invoke('pane:window','state').then(value=>{if(value)callback(value);});return ()=>ipcRenderer.removeListener('pane:window-state',listener);},
 notify(value){if(!process.argv.includes('--pane-notifications=1'))return Promise.resolve({status:'unavailable',message:'Restart Pane to enable the native notification bridge.'});return ipcRenderer.invoke('pane:notify',value);},
 writeClipboardText(text){return ipcRenderer.invoke('pane:clipboard-write',text);},
 readClipboard(){return ipcRenderer.invoke('pane:clipboard-read');},
 onNotificationClick(callback){ipcRenderer.on('pane:notification-click',(_event,id)=>{if(typeof id==='string')callback(id);});},
 // Message boxes from the main process (quit confirmation, update errors) are drawn by the page, in the app's design.
 onDialog(callback){
  ipcRenderer.on('pane:dialog',(_event,request)=>{
   if(!request||typeof request!=='object'||typeof request.id!=='string')return;
   Promise.resolve().then(()=>callback(request)).then(response=>ipcRenderer.send('pane:dialog-result',{id:request.id,response}),()=>ipcRenderer.send('pane:dialog-result',{id:request.id,response:request.cancelId}));
  });
 },
 onCheckpoint(callback){
  ipcRenderer.on('pane:checkpoint',(_event,id)=>{
   if(typeof id!=='string')return;
   Promise.resolve().then(()=>callback()).then(value=>ipcRenderer.send('pane:checkpoint-result',{id,...value}),()=>ipcRenderer.send('pane:checkpoint-result',{id,saved:false}));
  });
 }
}));
