import {test as base,expect,_electron as electron,type ElectronApplication,type Page,type Locator,type WebSocketRoute} from '@playwright/test';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export {expect};
export type {ElectronApplication,Page,Locator,WebSocketRoute};

async function freePort(){
 return new Promise<number>((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address() as net.AddressInfo;server.close(()=>resolve(port));});});
}

type Running={file:string;app:ElectronApplication;data:string};
let running:Running|undefined;
async function stop(){
 const current=running;running=undefined;if(!current)return;
 const exited=new Promise<void>(resolve=>current.app.process().once('exit',()=>resolve()));
 await current.app.evaluate(({dialog,app})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();}).catch(()=>{});
 await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,10000))]);
 await fs.rm(current.data,{recursive:true,force:true}).catch(()=>{});
}

// One Electron app per spec file; each test only resets the page, so startup is paid once per file.
export const test=base.extend<{page:Page;desktop:ElectronApplication},{closeApp:void}>({
 closeApp:[async({},use)=>{await use();await stop();},{scope:'worker',auto:true}],
 desktop:async({},use,testInfo)=>{
  if(running?.file!==testInfo.file){
   await stop();
   const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-desktop-'))),root=path.join(data,'project');
   await fs.mkdir(root);await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
   const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;
   const app=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:String(await freePort())}});
   app.process().stderr?.on('data',()=>{});
   // A fixed size keeps layout-dependent behavior (auto split, compact tabs) the same on CI runners.
   await app.firstWindow();await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1440,900);});
   running={file:testInfo.file,app,data};
  }
  await use(running.app);
 },
 page:async({desktop},use)=>{
  const page=await desktop.firstWindow();await page.waitForLoadState('load');await page.locator('#terminal-new').waitFor({state:'attached'});
  const origin=new URL(page.url()).origin,goto=page.goto.bind(page),addInitScript=page.addInitScript.bind(page);
  // Relative URLs resolve against the app's own server, like baseURL did on the web.
  page.goto=(url,options)=>goto(url.startsWith('/')?origin+url:url,options);
  // Init scripts cannot be removed, so each is gated on this test's token and goes inert once the next test starts.
  const token=Math.random().toString(36).slice(2),active=`sessionStorage.getItem('pane-test')==='${token}'`;
  page.addInitScript=(async(script:unknown,arg?:unknown)=>{
   const call=typeof script==='function'?`const __name=(target)=>target;(${script})(${JSON.stringify(arg)});`:String(script);
   return addInitScript({content:`try{if(${active}){${call}}}catch(error){if(${active})throw error;}`});
  }) as unknown as Page['addInitScript'];
  // The first script of a test wipes the previous test's saved layout once, before the app boots; later reloads keep it.
  await addInitScript({content:`try{if(sessionStorage.getItem('pane-test')!=='${token}'){localStorage.clear();sessionStorage.clear();sessionStorage.setItem('pane-test','${token}');}}catch{}`});
  await goto(origin+'/');await page.locator('#terminal-new').waitFor({state:'attached'});
  try{await use(page);}finally{
   page.goto=goto;page.addInitScript=addInitScript;
   await page.unrouteAll({behavior:'ignoreErrors'}).catch(()=>{});
  }
 },
});
