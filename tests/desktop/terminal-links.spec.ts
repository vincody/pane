import {test,expect,_electron as electron,type ElectronApplication,type WebSocketRoute} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Ctrl+clicking a terminal link, plain or OSC 8, asks first and never opens the system browser by itself',async()=>{
 test.setTimeout(90000);
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-terminal-links-'))),root=path.join(data,'project');await fs.mkdir(root);await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17393'}});
  application.process().stderr?.on('data',()=>{});const app=application;
  await app.evaluate(({shell})=>{const urls:string[]=[];Reflect.set(globalThis,'paneOpened',urls);shell.openExternal=async(url:string)=>{urls.push(url);};});
  const opened=()=>app.evaluate(()=>[...(Reflect.get(globalThis,'paneOpened') as string[])]);
  const page=await app.firstWindow();await page.waitForLoadState('load');await page.evaluate(()=>localStorage.setItem('ai-web.terminal-renderer','dom'));await page.reload();await expect(page.locator('.project-button')).toBeVisible();
  let socket:WebSocketRoute|undefined;
  await page.routeWebSocket('**/api/terminal',connection=>connection.onMessage(raw=>{if(JSON.parse(raw.toString()).type==='start'){socket=connection;connection.send(JSON.stringify({type:'ready',shell:'Test shell'}));}}));
  await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();await expect.poll(()=>Boolean(socket)).toBe(true);
  const print=(text:string)=>socket!.send(JSON.stringify({type:'data',data:text}));
  print('plain https://example.com/plain end\r\n');
  print('\x1b]8;;https://example.com/osc\x07label of osc link\x1b]8;;\x07 end\r\n');
  print('\x1b]8;;https://example.com/same\x07https://example.com/same\x1b]8;;\x07 end\r\n');
  await expect(page.locator('.xterm-rows').filter({hasText:'label of osc link'}).first()).toBeVisible();
  // The text of a row can be split over several elements (a hyperlink is styled separately), so walk them all.
  const at=(needle:string)=>page.evaluate(needle=>{for(const row of document.querySelectorAll('.terminal-pane-body:not([hidden]) .xterm-rows > div')){const nodes:Text[]=[],walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode())nodes.push(node as Text);const full=nodes.map(node=>node.textContent||'').join('').replace(/ /g,' '),index=full.indexOf(needle);if(index<0)continue;const place=(offset:number)=>{let rest=offset;for(const node of nodes){const length=(node.textContent||'').length;if(rest<=length)return {node,offset:rest};rest-=length;}return {node:nodes.at(-1)!,offset:(nodes.at(-1)!.textContent||'').length};};const from=place(index+needle.length-4),to=place(index+needle.length-1),range=document.createRange();range.setStart(from.node,from.offset);range.setEnd(to.node,to.offset);const rect=range.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};}return null;},needle);
  const native:string[]=[];page.on('dialog',async item=>{native.push(`${item.type()}: ${item.message()}`);await item.accept();});
  const dialog=page.locator('#link-choice');
  for(const [needle,url] of [['example.com/plain','https://example.com/plain'],['label of osc link','https://example.com/osc'],['example.com/same','https://example.com/same']] as const){
   const target=await at(needle);expect(target,needle).not.toBeNull();
   await page.mouse.move(target!.x,target!.y);await page.mouse.move(target!.x+1,target!.y);
   await page.keyboard.down('Control');await page.mouse.down();await page.mouse.up();await page.keyboard.up('Control');
   await page.waitForTimeout(600);
   expect(native,`${needle}: xterm's own confirm dialog must not appear`).toEqual([]);
   expect(await opened(),`${needle}: nothing may open before a choice`).toEqual([]);
   await expect(dialog,needle).toBeVisible();await expect(dialog.locator('.link-choice-url')).toHaveText(url);
   await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(await opened()).toEqual([]);
  }
  // A click without Ctrl does nothing.
  const plain=await at('example.com/plain');await page.mouse.move(plain!.x,plain!.y);await page.mouse.move(plain!.x+1,plain!.y);await page.mouse.down();await page.mouse.up();await page.waitForTimeout(600);
  expect(await opened()).toEqual([]);await expect(dialog).toBeHidden();
 }finally{
  if(application){const exited=new Promise<void>(resolve=>application!.process().once('exit',()=>resolve()));await application.evaluate(({dialog,app})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();}).catch(()=>{});await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,10000))]);}
  await fs.rm(data,{recursive:true,force:true}).catch(()=>{});
 }
});
