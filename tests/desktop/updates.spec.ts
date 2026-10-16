import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('one-step packaged update retries failures, waits for writes, saves drafts and silently restarts without another confirmation',async()=>{
 test.skip(!process.env.PANE_DESKTOP_EXECUTABLE,'Update actions are intentionally disabled in development builds.');
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-update-ui-'))),root=path.join(data,'project');await fs.mkdir(root);await fs.writeFile(path.join(root,'draft.txt'),'original');await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 await fs.writeFile(path.join(data,'updates.json'),JSON.stringify({automatic:false}));
 let desktop:ElectronApplication|undefined;
 try{
  desktop=await electron.launch({executablePath:process.env.PANE_DESKTOP_EXECUTABLE!,args:[],env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17327'}});desktop.process().stderr?.on('data',()=>{});
  const page=await desktop.firstWindow();await expect(page.getByRole('treeitem',{name:'draft.txt',exact:true})).toBeVisible();await page.getByRole('treeitem',{name:'draft.txt',exact:true}).click();await page.locator('#editor .monaco-editor textarea').focus();await page.keyboard.press('Control+End');await page.keyboard.type(' unsaved draft');
  await desktop.evaluate(({app,dialog,BrowserWindow,ipcMain})=>{
   const {createRequire}=process.getBuiltinModule('module'),require=createRequire(app.getAppPath()+'/package.json'),{autoUpdater}=require('electron-updater');
   const state={checks:0,downloads:0,installs:0,busy:true,dialogs:0,args:[] as unknown[]};Reflect.set(globalThis,'updateFlowTest',state);
   autoUpdater.checkForUpdates=async()=>{if(++state.checks===1)throw Error('No published versions on GitHub');autoUpdater.emit('update-available',{version:'0.1.2',releaseNotes:'<b>Better updates</b>'});return null;};
   autoUpdater.downloadUpdate=async()=>{if(++state.downloads===1)throw Error('offline');autoUpdater.emit('download-progress',{percent:50});autoUpdater.emit('update-downloaded',{version:'0.1.2'});return [];};
   autoUpdater.quitAndInstall=(...args:unknown[])=>{state.installs++;state.args=args;};
   dialog.showMessageBox=async()=>{state.dialogs++;return {response:1,checkboxChecked:false};};
   const contents=BrowserWindow.getAllWindows()[0].webContents,send=contents.send.bind(contents);
   contents.send=(channel:string,...args:unknown[])=>{
    if(channel==='pane:checkpoint'&&state.busy){ipcMain.emit('pane:checkpoint-result',{sender:contents,senderFrame:contents.mainFrame},{id:args[0],dirty:1,terminals:0,busy:true,saved:true});return;}
    send(channel,...args);
   };
  });
  await page.locator('#settings').click();await page.getByRole('button',{name:'About & Updates',exact:true}).click();const article=page.getByRole('article',{name:'About Pane'}),automatic=page.getByRole('checkbox',{name:'Automatically check for updates'});
  await automatic.uncheck();await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(data,'updates.json'),'utf8')).automatic).toBe(false);
  await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(article).toContainText('Pane has no public releases yet.');
  await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(page.getByRole('button',{name:'Update now',exact:true})).toBeEnabled();await page.getByText('What’s new',{exact:true}).click();await expect(page.locator('.about-release-notes')).toContainText('Better updates');await expect(page.locator('.about-release-notes b')).toHaveCount(0);
  // Main-process wake/focus events catch up an overdue check and coalesce the burst.
  await automatic.click();await expect(automatic).toBeChecked();await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(data,'updates.json'),'utf8')).automatic).toBe(true);await desktop.evaluate(({powerMonitor,BrowserWindow})=>{const original=Date.now;try{Date.now=()=>original()+7*60*60*1000;powerMonitor.emit('resume');BrowserWindow.getAllWindows()[0].emit('focus');}finally{Date.now=original;}});await expect.poll(()=>desktop!.evaluate(()=>Reflect.get(globalThis,'updateFlowTest').checks)).toBe(3);await expect(automatic).toBeEnabled();await automatic.click();await expect(automatic).not.toBeChecked();await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(data,'updates.json'),'utf8')).automatic).toBe(false);
  // No download before explicit approval. A reload preserves update state and preferences.
  expect(await desktop.evaluate(()=>Reflect.get(globalThis,'updateFlowTest').downloads)).toBe(0);await page.getByLabel('Close settings').click();await page.reload();await page.getByRole('button',{name:'Update available',exact:true}).click();await expect(automatic).not.toBeChecked();
  await page.getByRole('button',{name:'Update now',exact:true}).click();await expect(article).toContainText('Could not complete the update.');expect(await desktop.evaluate(()=>Reflect.get(globalThis,'updateFlowTest').installs)).toBe(0);
  // A single retry approval now completes all remaining steps automatically.
  await page.getByRole('button',{name:'Update now',exact:true}).click();await expect(article).toContainText('Waiting for current file or Git operations');await expect(page.getByRole('button',{name:'Update now',exact:true})).toHaveCount(0);expect(await desktop.evaluate(()=>Reflect.get(globalThis,'updateFlowTest').installs)).toBe(0);
  await page.screenshot({path:'test-results/desktop-one-step-update.png'});await desktop.evaluate(()=>Reflect.get(globalThis,'updateFlowTest').busy=false);
  await expect.poll(()=>desktop!.evaluate(()=>Reflect.get(globalThis,'updateFlowTest').installs)).toBe(1);expect(await desktop.evaluate(()=>Reflect.get(globalThis,'updateFlowTest').args)).toEqual([true,true]);expect(await desktop.evaluate(()=>Reflect.get(globalThis,'updateFlowTest').dialogs)).toBe(0);expect(await desktop.evaluate(()=>Reflect.get(globalThis,'updateFlowTest').downloads)).toBe(2);
  expect(await page.evaluate(()=>localStorage.getItem('pane.workbench.v1'))).toContain('unsaved draft');expect(await fs.readFile(path.join(root,'draft.txt'),'utf8')).toBe('original');
  await desktop.evaluate(({app})=>app.quit());await desktop.close();desktop=undefined;
 }finally{if(desktop){const pid=desktop.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
