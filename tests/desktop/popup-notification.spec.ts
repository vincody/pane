import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('settings can show a sample popup for each agent status',async()=>{
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-popup-'))),root=path.join(data,'project');await fs.mkdir(root);await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17328'}});application.process().stderr?.on('data',()=>{});const page=await application.firstWindow();await expect(page.locator('.project-button')).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-settings-page=notifications]').click();
  const test=page.getByRole('button',{name:'Test popup',exact:true}),card=page.locator('.agent-notification'),feedback=page.locator('#popup-test-feedback');
  await page.getByLabel('Popup notifications',{exact:true}).uncheck();await test.click();await expect(feedback).toContainText('turned off');await expect(card).toHaveCount(0);
  await page.getByLabel('Popup notifications',{exact:true}).check();
  await test.click();await expect(card).toHaveCount(1);await expect(card).toHaveAttribute('data-kind','done');await expect(card.locator('.notification-head')).toHaveText('claudefinished · worked for 7s');await expect(card.locator('.notification-detail')).toHaveText('Test notification');await page.screenshot({path:'test-results/popup-notification-done.png'});
  await test.click();await expect(card).toHaveCount(1);await expect(card).toHaveAttribute('data-kind','blocked');await expect(card.locator('.notification-head')).toHaveText('claudeneeds your action');
  await test.click();await expect(card).toHaveAttribute('data-kind','error');await expect(card.locator('.notification-head')).toHaveText('claudehit an error');
  await card.locator('.notification-open').click();await expect(card).toHaveCount(0);await expect(page.locator('#settings-dialog')).toHaveJSProperty('open',true);
 }finally{if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
