import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Markdown headings use a font with Vietnamese stacked diacritics, not Georgia',async()=>{
 test.setTimeout(90000);
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-heading-font-'))),root=path.join(data,'project');await fs.mkdir(root);
 await fs.writeFile(path.join(root,'notes.md'),'# Kiến thức thi\n\n## Cấu hình cần làm\n\nNội dung tiếng Việt.\n');await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17397'}});
  application.process().stderr?.on('data',()=>{});
  const page=await application.firstWindow();await page.getByRole('treeitem',{name:'notes.md',exact:true}).click();
  await page.locator('.view-switch').getByRole('button',{name:'Live Editor',exact:true}).click();
  const heading=page.getByRole('textbox',{name:'Live Markdown editor',exact:true}).locator('h1');await expect(heading).toHaveText('Kiến thức thi');
  expect(await heading.evaluate(node=>getComputedStyle(node).fontFamily)).toMatch(/^"?Inter/);
  // The rendered Markdown preview heading style (also used by the app's other display text).
  expect(await page.evaluate(()=>{const probe=document.createElement('h1');document.querySelector('#preview-content')!.append(probe);const family=getComputedStyle(probe).fontFamily;probe.remove();return family;})).toMatch(/^"?Inter/);
 }finally{
  if(application){const exited=new Promise<void>(resolve=>application!.process().once('exit',()=>resolve()));await application.evaluate(({dialog,app})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();}).catch(()=>{});await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,10000))]);}
  await fs.rm(data,{recursive:true,force:true}).catch(()=>{});
 }
});
