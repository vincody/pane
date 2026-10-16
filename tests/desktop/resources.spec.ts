import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('Resources lists Pane and each terminal, measures only while open, and closes a terminal after a confirmation',async()=>{
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-resources-'))),root=path.join(data,'project');await fs.mkdir(root);await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;
  application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17327'}});application.process().stderr?.on('data',()=>{});
  const page=await application.firstWindow();
  let requests=0;page.on('request',request=>{if(request.url().endsWith('/api/resources'))requests++;});
  for(let index=0;index<2;index++){await page.getByRole('button',{name:'New session',exact:true}).click();await page.locator('[data-launch=shell]').click();await page.locator('.terminal-tab-status[data-state=running]').nth(index).waitFor({state:'attached',timeout:20000});}
  await page.waitForTimeout(1500);expect(requests).toBe(0);
  const panel=page.locator('#resources-popover');await page.getByRole('button',{name:'Resources',exact:true}).click();
  await expect(panel.getByLabel('Pane total')).toContainText(/\d+ (MB|GB)/,{timeout:20000});
  for(const label of ['Main','Renderer'])await expect(panel.getByLabel('Pane processes')).toContainText(label);
  const rows=panel.locator('.resources-terminal');await expect(rows).toHaveCount(2);await expect(rows.first()).toContainText(/\d+ MB/);
  const first=rows.first().getByRole('button');await first.click();await expect(first).toHaveText('Confirm');
  await first.click();await expect(rows).toHaveCount(1,{timeout:15000});
  await page.keyboard.press('Escape');await expect(panel).toBeHidden();
  await page.waitForTimeout(500);const closedAt=requests;await page.waitForTimeout(4500);expect(requests).toBe(closedAt);
 }finally{if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
