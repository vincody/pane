import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../../server/src/app.ts';
import {serverPort} from '../helpers/http.ts';

test('Files menu creates, renames, duplicates and recycles files while retaining unsaved work',async({page,context})=>{
 const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-files-ui-'))),root=path.join(directory,'project');await fs.mkdir(root);await fs.writeFile(path.join(root,'original.txt'),'original\n');
 const revealed:string[]=[],trashed:string[]=[];
 const app=await createApp({initialRoot:root,stateDir:path.join(directory,'state'),agentHome:directory,nativeFileActions:{reveal:target=>{revealed.push(target);},trash:async target=>{trashed.push(target);await fs.rename(target,path.join(directory,'recycled'));}}});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${serverPort(app.server)}`;await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 const row=(name:string)=>page.getByRole('treeitem',{name,exact:true}),menu=page.getByRole('menu',{name:'File actions'}),dialog=page.locator('.file-action-dialog');
 const blankMenu=async()=>{await page.locator('#tree').click({button:'right',position:{x:180,y:220}});await expect(menu).toBeVisible();};
 try{
  await page.goto(base);await expect(row('original.txt')).toBeVisible();
  await row('original.txt').click({button:'right'});await expect(menu).toBeVisible();await expect(menu.getByRole('menuitem',{name:'New File',exact:true})).toHaveCSS('display','flex');await menu.getByRole('menuitem',{name:'Copy Relative Path',exact:true}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('original.txt');
  await row('original.txt').click({button:'right'});await menu.getByRole('menuitem',{name:'Copy Path',exact:true}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(path.join(root,'original.txt'));
  await blankMenu();await menu.getByRole('menuitem',{name:'New Folder',exact:true}).click();await dialog.getByLabel('Name',{exact:true}).fill('src');await dialog.getByRole('button',{name:'Create',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(row('src')).toBeVisible();
  await row('src').click({button:'right'});await menu.getByRole('menuitem',{name:'New File',exact:true}).click();await dialog.getByLabel('Name',{exact:true}).fill('notes.txt');await dialog.getByRole('button',{name:'Create',exact:true}).click();await expect(row('notes.txt')).toBeVisible();await expect(page.locator('.file-tab')).toContainText('notes.txt');
  await page.locator('#editor .monaco-editor textarea').focus();await page.keyboard.type('unsaved draft');
  await row('notes.txt').click({button:'right'});await menu.getByRole('menuitem',{name:'Rename',exact:true}).click();await expect(page.locator('#toast')).toContainText('Save or close unsaved files');await expect(dialog).not.toBeVisible();expect(await fs.readFile(path.join(root,'src/notes.txt'),'utf8')).toBe('');
  await page.getByRole('button',{name:/^Save/}).click();await expect(page.locator('.file-tab .tab-dirty')).toHaveCount(0);
  await row('notes.txt').click({button:'right'});await menu.getByRole('menuitem',{name:'Rename',exact:true}).click();await dialog.getByLabel('Name',{exact:true}).fill('renamed.txt');await dialog.getByRole('button',{name:'Rename',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(row('renamed.txt')).toBeVisible();await expect(page.locator('.file-tab')).toContainText('renamed.txt');expect(await fs.readFile(path.join(root,'src/renamed.txt'),'utf8')).toBe('unsaved draft');
  await row('renamed.txt').click({button:'right'});await menu.getByRole('menuitem',{name:'Duplicate',exact:true}).click();await expect(row('renamed copy.txt')).toBeVisible();expect(await fs.readFile(path.join(root,'src/renamed copy.txt'),'utf8')).toBe('unsaved draft');
  await row('renamed.txt').click({button:'right'});await menu.getByRole('menuitem',{name:'Reveal in File Explorer',exact:true}).click();await expect.poll(()=>revealed).toEqual([path.join(root,'src/renamed.txt')]);
  await row('renamed.txt').click({button:'right'});await menu.getByRole('menuitem',{name:'Delete',exact:true}).click();await expect(dialog).toContainText('Recycle Bin');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(row('renamed.txt')).toBeVisible();expect(trashed).toEqual([]);
  await row('renamed.txt').click({button:'right'});await menu.getByRole('menuitem',{name:'Delete',exact:true}).click();await dialog.getByRole('button',{name:'Move to Recycle Bin',exact:true}).click();await expect(row('renamed.txt')).toHaveCount(0);await expect(page.locator('.file-tab').filter({hasText:'renamed.txt'})).toHaveCount(0);expect(await fs.readFile(path.join(directory,'recycled'),'utf8')).toBe('unsaved draft');
  await row('src').click({button:'right'});await menu.getByRole('menuitem',{name:'Rename',exact:true}).click();await dialog.getByLabel('Name',{exact:true}).fill('lib');await dialog.getByRole('button',{name:'Rename',exact:true}).click();await expect(row('lib')).toBeVisible();await expect(row('renamed copy.txt')).toBeVisible();
  await row('original.txt').focus();await page.keyboard.press('Shift+F10');await expect(menu).toBeVisible();await page.keyboard.press('End');await expect(menu.getByRole('menuitem',{name:'Delete',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(menu).not.toBeVisible();
  await row('original.txt').click({button:'right'});await page.screenshot({path:'test-results/file-context-menu-light.png',animations:'disabled'});await page.keyboard.press('Escape');await page.evaluate(()=>document.documentElement.dataset.theme='dark');await row('original.txt').click({button:'right'});await page.screenshot({path:'test-results/file-context-menu-dark.png',animations:'disabled'});
  expect(errors).toEqual([]);
 }finally{await app.closeSessions();await new Promise<void>(resolve=>app.server.close(()=>resolve()));await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
