import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('packaged updater checks, downloads, persists preference and confirms restart without using a release server',async()=>{
 test.skip(!process.env.PANE_DESKTOP_EXECUTABLE,'Update actions are intentionally disabled in development builds.');
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'pane-update-ui-'));
 let desktop:ElectronApplication|undefined;
 try{
  desktop=await electron.launch({executablePath:process.env.PANE_DESKTOP_EXECUTABLE!,args:[],env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17327'}});
  desktop.process().stderr?.on('data',()=>{});
  const page=await desktop.firstWindow();await page.waitForFunction(()=>Boolean(window.paneDesktop));
  await desktop.evaluate(({app})=>{
   const {createRequire}=process.getBuiltinModule('module');const require=createRequire(app.getAppPath()+'/package.json');const {autoUpdater}=require('electron-updater');
   Reflect.set(globalThis,'testUpdater',autoUpdater);
   let checks=0;
   autoUpdater.checkForUpdates=async()=>{if(++checks===1)throw new Error('No published versions on GitHub');autoUpdater.emit('update-available',{version:'0.1.1',releaseNotes:'<b>Better updates</b>\nLayout fixes'});return null;};
   autoUpdater.downloadUpdate=async()=>{autoUpdater.emit('download-progress',{percent:50});autoUpdater.emit('update-downloaded',{version:'0.1.1',releaseNotes:'Better updates'});return [];};
   autoUpdater.quitAndInstall=()=>{Reflect.set(globalThis,'updateInstallCalled',true);};
  });
  await expect(page.locator('.settings-navigation')).toHaveCount(1);
  await page.locator('#settings').click();await page.getByRole('button',{name:'About & Updates',exact:true}).click();
  await page.getByRole('checkbox',{name:'Automatically check for updates'}).uncheck();
  await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(data,'updates.json'),'utf8')).automatic).toBe(false);
  await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(page.getByRole('article',{name:'About Pane'})).toContainText('Pane has no public releases yet.');
  await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(page.getByRole('button',{name:'Download update',exact:true})).toBeVisible();
  await page.getByText('What’s new', {exact:true}).click();await expect(page.locator('.about-release-notes')).toContainText('Better updates');await expect(page.locator('.about-release-notes b')).toHaveCount(0);
  await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.getByRole('button',{name:'Update available',exact:true}).click();await expect(page.getByRole('heading',{name:'About & Updates',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Download update',exact:true}).click();await expect(page.getByRole('button',{name:'Restart to update',exact:true})).toHaveCount(2);
  await page.screenshot({path:'test-results/desktop-about-updates.png'});
  await desktop.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});
  await page.locator('.about-updates').getByRole('button',{name:'Restart to update',exact:true}).click();
  expect(await desktop.evaluate(()=>Reflect.get(globalThis,'updateInstallCalled'))).not.toBe(true);
  // Reload keeps the downloaded state and the native preference.
  await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Restart to update',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Automatically check for updates'})).not.toBeChecked();
  // Mock installer only: verifies the real checkpoint/confirmation/shutdown path without running an installer.
  await desktop.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});
  await page.locator('.about-updates').getByRole('button',{name:'Restart to update',exact:true}).click();
  await expect.poll(()=>desktop!.evaluate(()=>Reflect.get(globalThis,'updateInstallCalled'))).toBe(true);
  await desktop.evaluate(({app})=>app.quit());await desktop.close();desktop=undefined;
 }finally{
  if(desktop){const pid=desktop.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
  await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
});
