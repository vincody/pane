import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const PANE_PORT=17337;
const guest=(application:ElectronApplication,script:string)=>application.evaluate(async({webContents},code)=>{
 const contents=webContents.getAllWebContents().filter(item=>item.getType()==='webview').at(-1);
 return contents?contents.executeJavaScript(code,true):'no guest';
},script);
const freePort=()=>new Promise<number>(resolve=>{const probe=net.createServer();probe.listen(0,'127.0.0.1',()=>{const {port}=probe.address() as net.AddressInfo;probe.close(()=>resolve(port));});});

test('the Browser tab opens any http page in an isolated session and never reaches Pane itself',async()=>{
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-browser-'))),root=path.join(data,'project');await fs.mkdir(root);await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 const server=http.createServer((request,response)=>{
  const page=(title:string,body='')=>{response.setHeader('content-type','text/html');response.end(`<!doctype html><title>${title}</title>${body}`);};
  if(request.url==='/second')page('Second Page');
  else if(request.url==='/third')page('Third Page');
  else page('Local Page','<a id="popup" target="_blank" href="/second">second</a><a id="plain" href="/third">third</a>');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as net.AddressInfo).port;
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:String(PANE_PORT)}});
  application.process().stderr?.on('data',()=>{});
  const page=await application.firstWindow();await expect(page.locator('.project-button')).toBeVisible();
  await page.locator('#terminal-new').click();await page.locator('[data-launch=browser]').click();
  const address=page.getByLabel('Address');await expect(address).toBeFocused();await expect(page.getByText('Open a page')).toBeVisible();
  await address.fill(`localhost:${port}`);await address.press('Enter');
  await expect(page.locator('#browser-layer webview')).toHaveCount(1);
  await expect(page.locator('#tabs .file-tab .tab-name').filter({hasText:'Local Page'})).toBeVisible({timeout:15000});
  await expect(address).toHaveValue(`http://localhost:${port}/`);
  // Isolation: its own session, no Pane bridge, no Node, and no "Electron" in the user agent.
  expect(await guest(application,'typeof window.paneDesktop')).toBe('undefined');
  expect(await guest(application,'typeof require')).toBe('undefined');
  expect(await guest(application,'navigator.userAgent')).not.toMatch(/Electron|Pane\//);
  expect(await application.evaluate(({webContents,session})=>webContents.getAllWebContents().filter(item=>item.getType()==='webview').every(item=>item.session===session.fromPartition('persist:pane-browser')))).toBe(true);
  // Whatever the page does itself, Pane's server stays out of reach.
  expect(await guest(application,`fetch('http://127.0.0.1:${PANE_PORT}/api/projects',{mode:'no-cors'}).then(()=>'reached',()=>'blocked')`)).toBe('blocked');
  await guest(application,`location.href='http://127.0.0.1:${PANE_PORT}/api/projects'`);await page.waitForTimeout(1500);
  expect(await application.evaluate(({webContents})=>webContents.getAllWebContents().filter(item=>item.getType()==='webview').at(-1)!.getURL())).toBe(`http://localhost:${port}/`);
  // A page's own link navigates in place; back and forward follow.
  await guest(application,'document.getElementById("plain").click()');
  await expect(page.locator('#tabs .file-tab .tab-name').filter({hasText:'Third Page'})).toBeVisible();
  await page.getByRole('button',{name:'Back'}).click();await expect(address).toHaveValue(`http://localhost:${port}/`);
  await page.getByRole('button',{name:'Forward'}).click();await expect(address).toHaveValue(`http://localhost:${port}/third`);
  // target=_blank opens another Browser tab instead of a window.
  await page.getByRole('button',{name:'Back'}).click();await expect(address).toHaveValue(`http://localhost:${port}/`);
  await guest(application,'document.getElementById("popup").click()');
  await expect(page.locator('#tabs .file-tab .tab-name').filter({hasText:'Second Page'})).toBeVisible({timeout:15000});
  expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
  // Connection problems get an explanation and a retry.
  const latest=page.locator('.browser-pane:visible'),latestAddress=latest.getByLabel('Address'),closed=await freePort();
  await latestAddress.fill(`localhost:${closed}`);await latestAddress.press('Enter');
  await expect(latest.locator('.browser-error strong')).toHaveText('Connection refused',{timeout:15000});
  // Pane's own server is off limits, however the address is spelled.
  for(const spelling of [`127.0.0.1:${PANE_PORT}/api/projects`,`localhost:${PANE_PORT}`]){
   await latestAddress.fill(spelling);await latestAddress.press('Enter');
   await expect(latest.locator('.browser-error strong')).toHaveText('Blocked',{timeout:15000});
  }
  // Closing the tab removes its page.
  await page.getByRole('button',{name:'Close browser pane'}).last().click();
  await expect.poll(()=>application!.evaluate(({webContents})=>webContents.getAllWebContents().filter(item=>item.getType()==='webview').length)).toBe(1);
  const exited=new Promise<void>(resolve=>application!.process().once('exit',()=>resolve()));await application.evaluate(({app,dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();});await exited;application=undefined;
 }finally{
  server.close();
  if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
  await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
});

test('running local servers can be opened from the start page and from Local servers',async()=>{
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-browser-servers-'))),root=path.join(data,'project');await fs.mkdir(root);await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 const server=http.createServer((_request,response)=>{response.setHeader('content-type','text/html');response.end('<!doctype html><title>Dev Server Page</title>');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as net.AddressInfo).port;
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17347'}});
  application.process().stderr?.on('data',()=>{});
  const page=await application.firstWindow();
  await page.route('**/api/dev-servers?**',route=>{const projectId=new URL(route.request().url()).searchParams.get('project');route.fulfill({json:{available:true,scannedAt:new Date().toISOString(),rows:[{id:'dev-1',projectId,pid:4242,port,host:'localhost',name:'Vite',status:'running',protocol:'http',url:`http://localhost:${port}/`,observedAt:new Date().toISOString()}]}});});
  await expect(page.locator('.project-button')).toBeVisible();
  // Start page: the running server is listed and opens in the tab.
  await page.locator('#terminal-new').click();await page.locator('[data-launch=browser]').click();
  const entry=page.locator('.browser-server');await expect(entry).toHaveCount(1);await expect(entry).toContainText(`http://localhost:${port}/`);
  await entry.click();
  await expect(page.locator('#tabs .file-tab .tab-name').filter({hasText:'Dev Server Page'})).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Close browser pane'}).last().click();
  await expect.poll(()=>application!.evaluate(({webContents})=>webContents.getAllWebContents().filter(item=>item.getType()==='webview').length)).toBe(0);
  // Local servers: Open now means "Open in Pane".
  await page.locator('#dev-servers-open').click();
  const open=page.locator('.dev-server-actions a').first();await expect(open).toHaveAttribute('title','Open in Pane');await open.click();
  await expect(page.locator('#tabs .file-tab .tab-name').filter({hasText:'Dev Server Page'})).toBeVisible({timeout:15000});
  expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
  const exited=new Promise<void>(resolve=>application!.process().once('exit',()=>resolve()));await application.evaluate(({app,dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();});await exited;application=undefined;
 }finally{
  server.close();
  if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
  await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
});
