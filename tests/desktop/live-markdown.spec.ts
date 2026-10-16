import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('desktop restores a Live Editor draft and selected mode after quitting without writing it to disk',async()=>{
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-live-recovery-'))),root=path.join(data,'project'),file=path.join(root,'notes.md'),original='---\ntitle: Local\n---\n# Recovery\n\nOriginal text.\n';await fs.mkdir(root);await fs.writeFile(file,original);await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 const launch=()=>{const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;return electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17327'}});};
 const quit=async(app:ElectronApplication)=>{const exited=new Promise<void>(resolve=>app.process().once('exit',()=>resolve()));await app.evaluate(({app,dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();});await exited;};
 try{
  application=await launch();application.process().stderr?.on('data',()=>{});let page=await application.firstWindow();await page.getByRole('treeitem',{name:'notes.md',exact:true}).click();await page.locator('.view-switch').getByRole('button',{name:'Live Editor',exact:true}).click();const rich=page.getByRole('textbox',{name:'Live Markdown editor',exact:true});await expect(rich).toBeVisible();await rich.locator('h1').click();await page.keyboard.press('End');await page.keyboard.type(' draft');await expect(page.locator('.file-tab .tab-dirty')).toHaveCount(1);await page.waitForFunction(()=>localStorage.getItem('pane.workbench.v1')?.includes('Recovery draft'));
  await quit(application);application=undefined;expect(await fs.readFile(file,'utf8')).toBe(original);
  application=await launch();application.process().stderr?.on('data',()=>{});page=await application.firstWindow();await expect(page.getByRole('textbox',{name:'Live Markdown editor',exact:true}).locator('h1')).toHaveText('Recovery draft');await expect(page.locator('.view-switch').getByRole('button',{name:'Live Editor',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.file-tab .tab-dirty')).toHaveCount(1);expect(await fs.readFile(file,'utf8')).toBe(original);await quit(application);application=undefined;
 }finally{if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});

test('Live Editor code blocks keep a Copy button that copies only the code and does not change the saved file',async()=>{
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-live-code-'))),root=path.join(data,'project'),file=path.join(root,'notes.md');await fs.mkdir(root);
 await fs.writeFile(file,'# Notes\n\n```js\nconst a = 1;\n```\n\n```\nplain\n```\n');await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;
  application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17327'}});application.process().stderr?.on('data',()=>{});
  const page=await application.firstWindow();await page.getByRole('treeitem',{name:'notes.md',exact:true}).click();await page.locator('.view-switch').getByRole('button',{name:'Live Editor',exact:true}).click();
  const rich=page.getByRole('textbox',{name:'Live Markdown editor',exact:true}),buttons=rich.getByRole('button',{name:'Copy code'});await expect(buttons).toHaveCount(2);
  await rich.locator('pre').first().hover();await buttons.first().click();await expect(rich.locator('.code-copy-button').first()).toHaveText('Copied');
  await expect.poll(()=>application!.evaluate(({clipboard})=>clipboard.readText())).toBe('const a = 1;');
  await buttons.nth(1).click();await expect.poll(()=>application!.evaluate(({clipboard})=>clipboard.readText())).toBe('plain');
  await rich.locator('pre code').first().click();await page.keyboard.press('End');await page.keyboard.type(' // x');await page.keyboard.press('Control+S');
  await expect.poll(()=>fs.readFile(file,'utf8')).toBe('# Notes\n\n```js\nconst a = 1; // x\n```\n\n```\nplain\n```\n');
 }finally{if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
