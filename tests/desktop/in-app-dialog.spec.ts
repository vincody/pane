import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('the quit confirmation is drawn inside the app and its buttons keep, hide or quit Pane',async()=>{
 test.setTimeout(120000);
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-dialog-'))),root=path.join(data,'project');await fs.mkdir(root);await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17401'}});
  application.process().stderr?.on('data',()=>{});const app=application;
  const page=await app.firstWindow();await expect(page.locator('.project-button')).toBeVisible();
  await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();await expect(page.locator('.terminal-tab').first()).toBeVisible();
  const dialog=page.locator('.app-dialog');
  // Closing the window asks what to do with the running terminal.
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();});
  await expect(dialog).toBeVisible({timeout:15000});await expect(dialog.getByRole('heading')).toHaveText('Keep Pane running in the background?');
  await expect(dialog).toContainText('1 terminal session(s)');
  await expect(dialog.getByRole('button')).toHaveText(['Keep running in tray','Quit Pane','Cancel']);
  // Escape is Cancel: the window stays.
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
  // Keep running in tray hides the window instead of quitting. A close that arrives while the app is still finishing the previous answer is
  // ignored on purpose (a double click on X must not ask twice), so ask again until the confirmation shows.
  await expect(async()=>{await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();});await expect(dialog).toBeVisible({timeout:2000});}).toPass({timeout:20000});
  await dialog.getByRole('button',{name:'Keep running in tray'}).click();
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
  // Quitting from the hidden window brings it back to ask first, then really quits.
  const exited=new Promise<void>(resolve=>app.process().once('exit',()=>resolve()));
  void app.evaluate(({app})=>{app.quit();}).catch(()=>{});
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
  await expect(dialog.getByRole('button')).toHaveText(['Quit Pane','Cancel']);
  await dialog.getByRole('button',{name:'Quit Pane'}).click();
  await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Pane did not quit')),20000))]);
  application=undefined;
 }finally{
  if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
  await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
 }
});
