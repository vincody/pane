import {test,expect,_electron as electron,type ElectronApplication,type Page,type WebSocketRoute} from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const opened=(application:ElectronApplication)=>application.evaluate(()=>[...(Reflect.get(globalThis,'paneOpened') as string[])]);
const webviews=(application:ElectronApplication)=>application.evaluate(({webContents})=>webContents.getAllWebContents().filter(item=>item.getType()==='webview').length);
async function setLinks(page:Page,mode:'ask'|'app'|'system'){
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-settings-page=links]').click();
 await page.getByLabel('Open links',{exact:true}).selectOption(mode);await page.getByLabel('Close settings').click();
}
test('web links ask where to open, remember the choice, and local servers in terminal output are offered',async()=>{
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-links-'))),root=path.join(data,'project');await fs.mkdir(root);
 const web=http.createServer((_request,response)=>{response.setHeader('content-type','text/html');response.end('<!doctype html><title>Linked Page</title>');});
 await new Promise<void>(resolve=>web.listen(0,'127.0.0.1',resolve));const web2=http.createServer((_request,response)=>{response.setHeader('content-type','text/html');response.end('<!doctype html><title>Linked Page</title>');});
 await new Promise<void>(resolve=>web2.listen(0,'127.0.0.1',resolve));const port=(web.address() as net.AddressInfo).port,second=(web2.address() as net.AddressInfo).port;
 await fs.writeFile(path.join(root,'README.md'),`# Notes\n\n[Local app](http://localhost:${port}/docs)\n`);await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17357'}});
  application.process().stderr?.on('data',()=>{});const app=application;
  await application.evaluate(({shell})=>{const urls:string[]=[];Reflect.set(globalThis,'paneOpened',urls);shell.openExternal=async(url:string)=>{urls.push(url);};});
  const page=await application.firstWindow();await expect(page.locator('.project-button')).toBeVisible();
  // Settings has a Links page with sensible defaults.
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-settings-page=links]').click();
  await expect(page.getByLabel('Open links',{exact:true})).toHaveValue('ask');await expect(page.getByLabel('Detect local servers')).toBeChecked();await page.getByLabel('Close settings').click();
  // A terminal prints local servers: one prompt per server, with both ways to open it.
  let socket:WebSocketRoute|undefined;
  await page.routeWebSocket('**/api/terminal',connection=>connection.onMessage(raw=>{if(JSON.parse(raw.toString()).type==='start'){socket=connection;connection.send(JSON.stringify({type:'ready',shell:'Test shell'}));}}));
  await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();await expect.poll(()=>Boolean(socket)).toBe(true);
  const print=(text:string)=>socket!.send(JSON.stringify({type:'data',data:text}));
  print(`  \x1b[32m➜\x1b[39m  Local:   \x1b[36mhttp://localhost:${port}/\x1b[39m\r\n  ➜  Network: http://192.168.1.20:${port}/\r\n`);
  const cards=page.locator('#link-prompts .link-prompt');await expect(cards).toHaveCount(1);await expect(cards.first()).toContainText(`localhost:${port}`);
  await expect(cards.first().getByRole('button')).toHaveCount(3);
  await cards.first().getByRole('button',{name:/Open in system browser/}).click();
  await expect(cards).toHaveCount(0);expect(await opened(app)).toEqual([`http://localhost:${port}/`]);
  print(`restarted\r\n  Local:   http://localhost:${port}/\r\n`);await page.waitForTimeout(400);await expect(cards).toHaveCount(0);
  print(`  Local:   http://localhost:${second}/\r\n`);await expect(cards).toHaveCount(1);
  await cards.first().getByRole('button',{name:/Open in Pane/}).click();
  await expect(page.locator('#tabs .file-tab .tab-name').filter({hasText:'Linked Page'})).toBeVisible({timeout:15000});expect(await webviews(app)).toBe(1);
  // Ctrl+click on a link in the terminal asks, and cancelling does nothing.
  await page.locator('.terminal-tab').first().click();
  print(`docs: http://localhost:${port}/docs\r\n`);
  await expect(page.locator('.xterm-rows').filter({hasText:`localhost:${port}/docs`}).first()).toBeVisible();
  const target=await page.evaluate(port=>{const walker=document.createTreeWalker(document.querySelector('.terminal-pane-body:not([hidden]) .xterm-rows')||document.body,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode()){const text=node.textContent||'',index=text.indexOf(`localhost:${port}/docs`);if(index>=0){const range=document.createRange();range.setStart(node,index+3);range.setEnd(node,index+9);const rect=range.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};}}return null;},port);
  expect(target).not.toBeNull();
  await page.mouse.move(target!.x,target!.y);await page.mouse.move(target!.x+1,target!.y);
  await page.keyboard.down('Control');await page.mouse.down();await page.mouse.up();await page.keyboard.up('Control');
  const dialog=page.locator('#link-choice');await expect(dialog).toBeVisible();await expect(dialog.locator('.link-choice-url')).toHaveText(`http://localhost:${port}/docs`);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect((await opened(app)).length).toBe(1);
  // A Markdown link asks too; choosing In Pane in Settings skips the question.
  await page.locator('.file-row[data-path="README.md"]').click();await page.locator('.topbar [data-view=live]').click();
  const link=page.locator('.live-markdown-content a').first();await expect(link).toBeVisible();
  const before=await webviews(app);
  await link.click({modifiers:['Control']});await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Remember my choice')).toHaveCount(0);await expect(dialog.locator('.link-choice-note')).toContainText('Settings → Links');
  await dialog.getByRole('button',{name:'Open in Pane'}).click();
  await expect.poll(()=>webviews(app)).toBe(before+1);
  expect(await page.evaluate(()=>localStorage.getItem('ai-web.links'))).toBeNull();
  await setLinks(page,'app');
  await page.locator('#tabs .file-tab').filter({hasText:'README.md'}).click();await expect(link).toBeVisible();
  await link.click({modifiers:['Control']});await expect(dialog).toBeHidden();await expect.poll(()=>webviews(app)).toBe(before+2);
  // Choosing the system browser in Settings opens links outside without asking.
  await setLinks(page,'system');
  await page.locator('#tabs .file-tab').filter({hasText:'README.md'}).click();await link.click({modifiers:['Control']});
  await expect(dialog).toBeHidden();await expect.poll(async()=>(await opened(app)).at(-1)).toBe(`http://localhost:${port}/docs`);expect(await webviews(app)).toBe(before+2);
  // Ctrl+click on the URL in the source editor follows the same preference.
  const countBefore=(await opened(app)).length;
  await page.locator('.topbar [data-view=editor]').click();await expect(page.locator('.monaco-editor .view-lines').first()).toContainText(`localhost:${port}/docs`);
  const spot=await page.evaluate(port=>{const walker=document.createTreeWalker(document.querySelector('.monaco-editor .view-lines')!,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode()){const text=node.textContent||'',index=text.indexOf(`localhost:${port}/docs`);if(index>=0){const range=document.createRange();range.setStart(node,index+4);range.setEnd(node,index+10);const rect=range.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};}}return null;},port);
  expect(spot).not.toBeNull();
  await page.mouse.move(spot!.x,spot!.y);await page.mouse.move(spot!.x+1,spot!.y);await page.waitForTimeout(300);
  await page.keyboard.down('Control');await page.mouse.down();await page.mouse.up();await page.keyboard.up('Control');
  await expect.poll(async()=>(await opened(app)).length).toBe(countBefore+1);
  // With detection off nothing is announced.
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-settings-page=links]').click();await page.getByLabel('Detect local servers').uncheck();await page.getByLabel('Close settings').click();
  print(`  Local:   http://localhost:${second+7}/\r\n`);await page.waitForTimeout(500);await expect(cards).toHaveCount(0);
  const exited=new Promise<void>(resolve=>application!.process().once('exit',()=>resolve()));await application.evaluate(({app,dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();});await exited;application=undefined;
 }finally{
  web.close();web2.close();
  if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
  await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
});
