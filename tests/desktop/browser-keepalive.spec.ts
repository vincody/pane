import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const guest=(application:ElectronApplication,script:string)=>application.evaluate(async({webContents},code)=>{
 const contents=webContents.getAllWebContents().filter(item=>item.getType()==='webview').at(-1);
 return contents?contents.executeJavaScript(code,true):'no guest';
},script);

test('a page in the Browser tab keeps its state when switching to other tabs and back',async()=>{
 test.setTimeout(120000);
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-keepalive-'))),root=path.join(data,'project');await fs.mkdir(root);
 await fs.writeFile(path.join(root,'README.md'),'# Notes\n');await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let hits=0;
 const server=http.createServer((_request,response)=>{hits++;response.setHeader('content-type','text/html');response.end('<!doctype html><title>Login Page</title><input id="user">');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as net.AddressInfo).port;
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17391'}});
  application.process().stderr?.on('data',()=>{});const app=application;
  const page=await application.firstWindow();await expect(page.locator('.project-button')).toBeVisible();
  await page.locator('#terminal-new').click();await page.locator('[data-launch=browser]').click();
  const address=page.getByLabel('Address');await address.fill(`localhost:${port}`);await address.press('Enter');
  const loginTab=page.locator('#tabs .file-tab').filter({hasText:'Login Page'});await expect(loginTab).toBeVisible({timeout:15000});
  await guest(app,"document.querySelector('#user').value='secret';window.__marker='alive';0");
  const alive=()=>guest(app,"window.__marker+':'+document.querySelector('#user').value");
  expect(await alive()).toBe('alive:secret');const first=hits;
  // Another file tab, then back to the browser tab.
  await page.locator('.file-row[data-path="README.md"]').click();await expect(page.locator('#tabs .file-tab .tab-name').filter({hasText:'README.md'})).toBeVisible();
  await page.waitForTimeout(800);await loginTab.click();await page.waitForTimeout(1200);
  expect(await alive(),'state after file tab round trip').toBe('alive:secret');
  // A terminal session, then back.
  await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();await page.waitForTimeout(800);
  await loginTab.click();await page.waitForTimeout(1200);
  expect(await alive(),'state after terminal round trip').toBe('alive:secret');
  expect(hits).toBe(first);
 }finally{
  // Quitting with a running session asks for confirmation; answer it so no dialog is left open.
  if(application){const exited=new Promise<void>(resolve=>application!.process().once('exit',()=>resolve()));await application.evaluate(({dialog,app})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();}).catch(()=>{});await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,10000))]);}
  await new Promise(resolve=>server.close(resolve));await fs.rm(data,{recursive:true,force:true}).catch(()=>{});
 }
});
