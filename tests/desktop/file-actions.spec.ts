import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

test('desktop Files routes reveal and recycling through scoped native shell actions',async()=>{
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-native-files-'))),root=path.join(data,'project'),file=path.join(root,'menu.txt');await fs.mkdir(root);await fs.writeFile(file,'keep');await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;
  application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17327'}});application.process().stderr?.on('data',()=>{});
  const page=await application.firstWindow();await expect(page.getByRole('treeitem',{name:'menu.txt',exact:true})).toBeVisible();
  await application.evaluate(({shell},recycled)=>{
   const calls:{reveal:string[];trash:string[]}={reveal:[],trash:[]};Reflect.set(globalThis,'fileActionCalls',calls);
   shell.showItemInFolder=target=>{calls.reveal.push(target);};shell.trashItem=async target=>{calls.trash.push(target);await process.getBuiltinModule('fs').promises.rename(target,recycled);};
  },path.join(data,'recycled.txt'));
  const row=page.getByRole('treeitem',{name:'menu.txt',exact:true}),menu=page.getByRole('menu',{name:'File actions'});
  await row.click({button:'right'});await menu.getByRole('menuitem',{name:'Reveal in File Explorer',exact:true}).click();await expect.poll(()=>application!.evaluate(()=>Reflect.get(globalThis,'fileActionCalls').reveal)).toEqual([file]);
  await row.click();await row.click({button:'right'});await menu.getByRole('menuitem',{name:'Delete',exact:true}).click();await page.locator('.file-action-dialog').getByRole('button',{name:'Move to Recycle Bin',exact:true}).click();await expect(row).toHaveCount(0);await expect(page.locator('.file-tab').filter({hasText:'menu.txt'})).toHaveCount(0);
  expect(await application.evaluate(()=>Reflect.get(globalThis,'fileActionCalls').trash)).toEqual([file]);expect(await fs.readFile(path.join(data,'recycled.txt'),'utf8')).toBe('keep');
  await application.evaluate(({app,dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();});await application.close();application=undefined;
 }finally{if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
