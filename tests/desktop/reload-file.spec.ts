import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Reload from disk pulls in outside changes, and asks before discarding unsaved edits',async()=>{
 test.setTimeout(90000);
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-reload-'))),root=path.join(data,'project'),file=path.join(root,'notes.md');await fs.mkdir(root);
 await fs.writeFile(file,'# One\n');await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17399'}});
  application.process().stderr?.on('data',()=>{});
  const page=await application.firstWindow();await expect(page.getByRole('button',{name:'Reload from disk'})).toBeHidden();
  await page.getByRole('treeitem',{name:'notes.md',exact:true}).click();
  const reload=page.getByRole('button',{name:'Reload from disk'});await expect(reload).toBeVisible();
  // Live Editor shows the new text without reopening the file.
  await page.locator('.view-switch').getByRole('button',{name:'Live Editor',exact:true}).click();
  const live=page.getByRole('textbox',{name:'Live Markdown editor',exact:true}).locator('h1');await expect(live).toHaveText('One');
  await fs.writeFile(file,'# Two\n');await expect(live).toHaveText('One');
  await reload.click();await expect(live).toHaveText('Two');
  // The Editor view and the save state follow, and nothing is left unsaved.
  await page.locator('.view-switch').getByRole('button',{name:'Source',exact:true}).click();
  await expect(page.locator('#editor .view-lines')).toContainText('# Two');await expect(page.getByRole('button',{name:'Save file'})).toBeDisabled();
  // Unsaved edits are not overwritten silently.
  await page.locator('#editor .view-lines').click();await page.keyboard.press('Control+End');await page.keyboard.type('local edit');
  await expect(page.getByRole('button',{name:'Save file'})).toBeEnabled();
  await fs.writeFile(file,'# Three\n');
  await reload.click();const dialog=page.locator('.discard-file-dialog');await expect(dialog).toBeVisible();await expect(dialog).toContainText('load the version on disk');
  await dialog.getByRole('button',{name:'Keep editing'}).click();await expect(page.locator('#editor .view-lines')).toContainText('local edit');
  await reload.click();await dialog.getByRole('button',{name:'Discard changes'}).click();
  await expect(page.locator('#editor .view-lines')).toContainText('# Three');await expect(page.locator('#editor .view-lines')).not.toContainText('local edit');
  await expect(page.getByRole('button',{name:'Save file'})).toBeDisabled();
 }finally{
  if(application){const exited=new Promise<void>(resolve=>application!.process().once('exit',()=>resolve()));await application.evaluate(({dialog,app})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();}).catch(()=>{});await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,10000))]);}
  await fs.rm(data,{recursive:true,force:true}).catch(()=>{});
 }
});
