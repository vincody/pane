import {app,BrowserWindow,Menu,Tray,dialog,ipcMain,shell,nativeImage,screen,Notification} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import electronUpdater from 'electron-updater';
import {createUpdates} from './updates.ts';
import {createApp} from '../server/src/app.ts';

const dataOverride=process.env.PANE_DESKTOP_DATA_DIR;
if(dataOverride)app.setPath('userData',path.resolve(dataOverride));
app.setName('Pane');
app.setAppUserModelId('dev.vincody.pane');
process.on('uncaughtException',error=>void fatal(error));
process.on('unhandledRejection',error=>void fatal(error));
const locked=app.requestSingleInstanceLock();
if(!locked){app.quit();}else{void boot().catch(fatal);}
let window:BrowserWindow|undefined,tray:Tray|undefined,backend:Awaited<ReturnType<typeof createApp>>|undefined;
let quitting=false,confirming=false,origin='';
let updates:Awaited<ReturnType<typeof createUpdates>>|undefined;
const log=async(message:string)=>{try{await fs.mkdir(app.getPath('userData'),{recursive:true});await fs.appendFile(path.join(app.getPath('userData'),'desktop.log'),`${new Date().toISOString()} ${message}\n`);}catch{}};
function show(){if(!window||window.isDestroyed())return;if(window.isMinimized())window.restore();window.show();window.focus();}
function external(url:string){try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return;void shell.openExternal(parsed.href).catch(()=>log('Could not open external link.'));}catch{}}
interface Checkpoint {dirty:number;terminals:number;busy:boolean;saved:boolean}
async function checkpoint():Promise<Checkpoint>{
 if(!window||window.isDestroyed()||window.webContents.isCrashed())return {dirty:0,terminals:1,busy:false,saved:false};
 const target=window.webContents,id=crypto.randomUUID();
 return new Promise(resolve=>{
  const timer=setTimeout(()=>finish({dirty:0,terminals:1,busy:false,saved:false}),5000);
  function finish(value:Checkpoint){clearTimeout(timer);ipcMain.removeListener('pane:checkpoint-result',receive);resolve(value);}
  function receive(event:Electron.IpcMainEvent,value:unknown){
   if(event.sender!==target||event.senderFrame!==target.mainFrame||!value||typeof value!=='object')return;
   const data=value as Record<string,unknown>;if(data.id!==id)return;
   finish({dirty:typeof data.dirty==='number'?Math.max(0,data.dirty):0,terminals:typeof data.terminals==='number'?Math.max(0,data.terminals):0,busy:data.busy===true,saved:data.saved===true});
  }
  ipcMain.on('pane:checkpoint-result',receive);target.send('pane:checkpoint',id);
 });
}
async function requestClose(allowHide:boolean,installUpdate=false){
 if(confirming||quitting)return;confirming=true;
 try{
  if(installUpdate&&!updates?.ready())return;
  const state=await checkpoint();
  if(state.busy){await dialog.showMessageBox(window!,{type:'info',message:'An operation is still running.',detail:'Wait for file, workspace, Git or GitHub operations to finish before quitting Pane.',buttons:['Keep working']});return;}
  if(installUpdate&&!state.saved){await dialog.showMessageBox(window!,{type:'warning',message:'Could not save session recovery.',detail:'Save your files and try updating again.',buttons:['Keep working']});return;}
  if(state.dirty||state.terminals||!state.saved||installUpdate){
   const buttons=allowHide?['Keep running in tray','Quit Pane','Cancel']:[installUpdate?'Restart and install':'Quit Pane','Cancel'];
   const result=await dialog.showMessageBox(window!,{type:'question',message:installUpdate?'Restart Pane to install the update?':allowHide?'Keep Pane running in the background?':'Quit Pane?',detail:`${state.terminals} terminal session(s) and ${state.dirty} unsaved file(s).\n${state.saved?'Tabs, layout and supported file drafts have been saved.':'Session recovery could not be confirmed. Unsaved work may be lost.'}\nQuitting ends Pane terminals and their agents. Original processes cannot survive an app or machine restart.`,buttons,defaultId:buttons.length-1,cancelId:buttons.length-1,noLink:true});
   if(allowHide&&result.response===0){window?.hide();return;}
   if(result.response!==(allowHide?1:0))return;
  }
  quitting=true;updates?.dispose();await shutdown();
  if(installUpdate){updates!.install();if(updates!.get().status==='error'){await dialog.showMessageBox(window!,{type:'error',message:'The update installer could not start.',detail:'Pane will reopen. Please try the update again.',buttons:['Reopen Pane']});app.relaunch();app.quit();}}
  else app.quit();
 }finally{confirming=false;}
}
async function shutdown(){
 if(!backend)return;const current=backend;backend=undefined;
 await log('Stopping local backend and owned terminals.');
 await current.closeSessions();current.server.closeAllConnections();
 await new Promise<void>(resolve=>current.server.close(()=>resolve()));
 tray?.destroy();
}
async function fatal(error:unknown){
 await log(`Desktop failure: ${error instanceof Error?error.stack:String(error)}`);
 await app.whenReady();dialog.showErrorBox('Pane could not start',`${error instanceof Error?error.message:'Unexpected startup failure.'}\n\nDiagnostics: ${path.join(app.getPath('userData'),'desktop.log')}`);
 quitting=true;await shutdown().catch(()=>{});app.quit();
}
async function boot(){
 await app.whenReady();
 const stateDir=app.getPath('userData'),appDir=app.getAppPath();await fs.mkdir(stateDir,{recursive:true});
 // Adopt registered folders in development without modifying the web state.
 try{await fs.access(path.join(stateDir,'projects.json'));}catch{
  let projects='{"projects":[]}';if(!app.isPackaged)try{projects=await fs.readFile(path.join(appDir,'.ai-web','projects.json'),'utf8');}catch{}
  await fs.writeFile(path.join(stateDir,'projects.json'),projects,{flag:'wx'});
 }
 let pickerOpen=false;
 async function pick(folder:boolean){
  if(pickerOpen)throw new Error('A file picker is already open.');pickerOpen=true;
  try{show();const result=await dialog.showOpenDialog(window!,{title:folder?'Choose a workspace folder':'Choose SSH private key',defaultPath:folder?app.getPath('downloads'):path.join(os.homedir(),'.ssh')+path.sep,properties:folder?['openDirectory','createDirectory']:['openFile']});return result.canceled?null:result.filePaths[0]||null;}finally{pickerOpen=false;}
 }
 backend=await createApp({stateDir,initialRoot:app.getPath('downloads'),assetsDir:path.join(appDir,'dist'),nativePickers:{folder:()=>pick(true),key:()=>pick(false),downloads:async()=>app.getPath('downloads')}});
 const port=Number(process.env.PANE_DESKTOP_PORT||17317);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid desktop port.');
 await new Promise<void>((resolve,reject)=>{backend!.server.once('error',reject);backend!.server.listen(port,'127.0.0.1',()=>resolve());});
 origin=`http://127.0.0.1:${port}`;await log(`Backend ready on port ${port}.`);
 let bounds:{width:number;height:number;x?:number;y?:number}={width:1440,height:950};
 try{const saved=JSON.parse(await fs.readFile(path.join(stateDir,'window.json'),'utf8'));if(Number.isFinite(saved.width)&&Number.isFinite(saved.height)){bounds={width:Math.max(900,Math.min(3840,saved.width)),height:Math.max(600,Math.min(2160,saved.height))};if(Number.isFinite(saved.x)&&Number.isFinite(saved.y)&&screen.getAllDisplays().some(display=>saved.x>=display.workArea.x&&saved.x<display.workArea.x+display.workArea.width&&saved.y>=display.workArea.y&&saved.y<display.workArea.y+display.workArea.height))Object.assign(bounds,{x:saved.x,y:saved.y});}}catch{}
 window=new BrowserWindow({...bounds,frame:false,minWidth:900,minHeight:600,show:false,title:'Pane',backgroundColor:'#171613',icon:path.join(appDir,'desktop-build','icon.png'),webPreferences:{preload:path.join(appDir,'desktop-build','preload.cjs'),additionalArguments:[`--pane-backend-id=${crypto.randomUUID()}`],nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false,spellcheck:false}});
 const contents=window.webContents;
 const {autoUpdater}=electronUpdater;
 updates=await createUpdates({engine:autoUpdater,version:app.getVersion(),platform:`${process.platform} ${process.arch}`,supported:app.isPackaged&&process.platform==='win32'&&process.arch==='x64',preferencesFile:path.join(stateDir,'updates.json'),log,publish:state=>{if(!contents.isDestroyed())contents.send('pane:update-state',state);}});
 ipcMain.handle('pane:updates',async(event,action:unknown,value:unknown)=>{
  if(event.sender!==contents||event.senderFrame!==contents.mainFrame||!event.senderFrame.url.startsWith(origin+'/'))throw new Error('Untrusted update request.');
  if(action==='check')await updates!.check();
  else if(action==='download')await updates!.download();
  else if(action==='install')await requestClose(false,true);
  else if(action==='automatic'&&typeof value==='boolean')await updates!.setAutomatic(value);
  else if(action!=='state')throw new Error('Invalid update action.');
  return updates!.get();
 });
 const permitted=(permission:string)=>['clipboard-sanitized-write','notifications','fullscreen'].includes(permission)||permission==='clipboard-read'&&Boolean(window?.isFocused());
 contents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===window?.webContents&&details.isMainFrame&&details.requestingUrl.startsWith(origin+'/')&&permitted(permission)));
 contents.session.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>contents===window?.webContents&&details.isMainFrame&&requestingOrigin===origin&&permitted(permission));
 const notices=new Map<string,Notification>();
 ipcMain.on('pane:notify',(event,value:unknown)=>{
  if(event.sender!==contents||event.senderFrame!==contents.mainFrame||!value||typeof value!=='object'||window?.isFocused()||!Notification.isSupported())return;
  const data=value as Record<string,unknown>;if(typeof data.id!=='string'||data.id.length>256||typeof data.title!=='string'||typeof data.body!=='string')return;
  notices.get(data.id)?.close();if(notices.size>=8){const first=notices.keys().next().value!;notices.get(first)?.close();notices.delete(first);}
  const id=data.id,notice=new Notification({title:data.title.slice(0,120),body:data.body.slice(0,240),silent:true,icon:path.join(appDir,'desktop-build','icon.png')});notices.set(id,notice);
  notice.on('click',()=>{show();if(!contents.isDestroyed())contents.send('pane:notification-click',id);});notice.on('close',()=>{if(notices.get(id)===notice)notices.delete(id);});notice.on('failed',()=>{notices.delete(id);void log('Native notification unavailable.');});notice.show();
 });
 contents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
 contents.on('will-navigate',(event,url)=>{if(url!==origin+'/'){event.preventDefault();external(url);}});
 contents.on('will-attach-webview',event=>event.preventDefault());
 contents.on('render-process-gone',async(_event,details)=>{await log(`Renderer stopped: ${details.reason}`);if(quitting)return;const result=await dialog.showMessageBox(window!,{type:'error',message:'The Pane window stopped responding.',detail:'The local backend and terminals are still running. Reload to reconnect.',buttons:['Reload','Quit Pane'],defaultId:0});if(result.response===0)contents.reload();else void requestClose(false);});
 window.on('close',event=>{if(quitting)return;event.preventDefault();void requestClose(true);});
 window.on('closed',()=>{window=undefined;});
 let boundsTimer:ReturnType<typeof setTimeout>|undefined;
 const saveBounds=()=>{clearTimeout(boundsTimer);boundsTimer=setTimeout(()=>{if(window&&!window.isDestroyed()&&!window.isMinimized())void fs.writeFile(path.join(stateDir,'window.json'),JSON.stringify(window.getNormalBounds())).catch(()=>{});},250);};
 window.on('resize',saveBounds);window.on('move',saveBounds);
 contents.on('will-prevent-unload',event=>{if(quitting)event.preventDefault();});
 const menu:Electron.MenuItemConstructorOptions[]=[{label:'Pane',submenu:[{label:'Show Pane',click:show},{label:'Hide to tray',click:()=>window?.hide()},{type:'separator'},{label:'Open diagnostics folder',click:()=>{void shell.openPath(stateDir);}},{label:'Quit Pane',accelerator:'CmdOrCtrl+Q',click:()=>void requestClose(false)}]},{role:'editMenu'},{label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools' as const}]:[])]}];
 const applicationMenu=Menu.buildFromTemplate(menu);Menu.setApplicationMenu(applicationMenu);window.removeMenu();
 const windowState=()=>({maximized:Boolean(window?.isMaximized()),fullscreen:Boolean(window?.isFullScreen()),focused:Boolean(window?.isFocused())});
 const sendWindowState=()=>{if(!contents.isDestroyed())contents.send('pane:window-state',windowState());};
 window.on('maximize',sendWindowState);window.on('unmaximize',sendWindowState);window.on('enter-full-screen',sendWindowState);window.on('leave-full-screen',sendWindowState);window.on('focus',sendWindowState);window.on('blur',sendWindowState);
 ipcMain.handle('pane:window',(event,action:unknown)=>{
  if(event.sender!==contents||event.senderFrame!==contents.mainFrame||!event.senderFrame.url.startsWith(origin+'/')||!window||window.isDestroyed())return;
  if(action==='minimize')window.minimize();
  else if(action==='maximize'){if(window.isFullScreen())window.setFullScreen(false);else if(window.isMaximized())window.unmaximize();else window.maximize();}
  else if(action==='close')window.close();
  else if(action==='menu')applicationMenu.popup({window});
  else if(action!=='state')return;
  return windowState();
 });
 contents.on('before-input-event',(event,input)=>{
  if(input.type!=='keyDown')return;const control=input.control||input.meta,key=input.key.toLowerCase();
  if(control&&key==='q'){event.preventDefault();void requestClose(false);}
  else if(key==='f11'){event.preventDefault();window?.setFullScreen(!window.isFullScreen());}
  else if(control&&key==='r'){event.preventDefault();contents.reload();}
  else if(control&&['+','=','-','0'].includes(key)){event.preventDefault();contents.setZoomFactor(key==='0'?1:Math.max(.5,Math.min(2,contents.getZoomFactor()+(key==='-'?-.1:.1))));}
 });
 tray=new Tray(nativeImage.createFromPath(path.join(appDir,'desktop-build','icon.png')).resize({width:20,height:20}));tray.setToolTip('Pane');tray.setContextMenu(Menu.buildFromTemplate([{label:'Show Pane',click:show},{label:'Quit Pane',click:()=>void requestClose(false)}]));tray.on('double-click',show);tray.on('click',show);
 app.on('second-instance',show);app.on('activate',show);
 app.on('before-quit',event=>{if(!quitting){event.preventDefault();void requestClose(false);}});
 await window.loadURL(origin+'/');show();
}
