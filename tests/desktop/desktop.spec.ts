import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('desktop isolates Node, restores drafts and splits, keeps hidden terminals alive, and stops them on quit',async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'pane-desktop-')),root=path.join(data,'project');await fs.mkdir(root);await fs.writeFile(path.join(root,'draft.txt'),'original\n');
 await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 const env={...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17327'};
 let desktop:ElectronApplication|undefined;
 const launch=async()=>{const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;const app=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env});app.process().stderr?.on('data',()=>{});return app;};
 const quit=async(app:ElectronApplication)=>{const exited=new Promise<void>(resolve=>app.process().once('exit',()=>resolve()));await app.evaluate(({dialog,app})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();});await exited;};
 try{
  desktop=await launch();let page=await desktop.firstWindow();await expect(page.getByRole('treeitem',{name:'draft.txt',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>({require:typeof Reflect.get(window,'require'),native:!!window.paneDesktop}))).toEqual({require:'undefined',native:true});
  await page.locator('#settings').click();await page.getByRole('button',{name:'About & Updates',exact:true}).click();
  await expect(page.getByRole('article',{name:'About Pane'})).toContainText(JSON.parse(await fs.readFile(path.resolve('package.json'),'utf8')).version);
  if(!process.env.PANE_DESKTOP_EXECUTABLE){await expect(page.getByRole('button',{name:'Check for updates',exact:true})).toBeDisabled();await expect(page.getByRole('article',{name:'About Pane'})).toContainText('Development builds do not download updates.');}
  await page.getByRole('button',{name:'Close settings',exact:true}).click();
  expect(await desktop.evaluate(({BrowserWindow})=>{const contents=BrowserWindow.getAllWindows()[0].webContents;const prefs=Reflect.get(contents,'getLastWebPreferences').call(contents) as Record<string,unknown>;return {sandbox:prefs.sandbox,nodeIntegration:prefs.nodeIntegration,contextIsolation:prefs.contextIsolation};})).toEqual({sandbox:true,nodeIntegration:false,contextIsolation:true});
  await expect(page.getByRole('button',{name:'Pane menu',exact:true})).toBeVisible();await expect(page.locator('.topbar')).toHaveCSS('-webkit-app-region','drag');await expect(page.getByRole('button',{name:'Close window',exact:true})).toHaveCSS('-webkit-app-region','no-drag');
  expect(await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMenuBarVisible())).toBe(false);
  const tabOffset=()=>page.evaluate(()=>{const tabs=document.querySelector('#unified-tabs')!.getBoundingClientRect(),main=document.querySelector('main')!.getBoundingClientRect();return Math.round(tabs.left-main.left);});
  await expect.poll(tabOffset).toBe(8);await page.getByRole('separator',{name:'Resize workspace sidebar',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect.poll(tabOffset).toBe(8);await page.keyboard.press('Home');await expect.poll(tabOffset).toBe(8);
  await page.getByRole('button',{name:'Toggle workspaces sidebar',exact:true}).click();await expect(page.locator('#app')).toHaveClass(/sidebar-hidden/);await expect.poll(()=>page.locator('#unified-tabs').evaluate(node=>Math.round(node.getBoundingClientRect().left))).toBe(104);await page.getByRole('button',{name:'Toggle workspaces sidebar',exact:true}).click();await expect.poll(tabOffset).toBe(8);

  await page.getByRole('button',{name:'Maximize window',exact:true}).click();await expect.poll(()=>desktop!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);await expect(page.getByRole('button',{name:'Restore window',exact:true})).toBeVisible();await page.getByRole('button',{name:'Restore window',exact:true}).click();await expect.poll(()=>desktop!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
  await page.getByRole('button',{name:'Minimize window',exact:true}).click();await expect.poll(()=>desktop!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);await desktop.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.restore();window.show();window.focus();});
  expect(await desktop.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];return Math.abs(window.getBounds().height-window.getContentBounds().height);})).toBeLessThanOrEqual(2);
  await desktop.evaluate(({dialog,BrowserWindow},root)=>{
    Reflect.set(dialog,'showOpenDialog',async(owner:unknown,options:{properties:string[]})=>{Reflect.set(globalThis,'panePickerOwner',owner===BrowserWindow.getAllWindows()[0]);return {canceled:false,filePaths:[options.properties.includes('openDirectory')?root:root+'\\draft.txt']};});
  },root);
  const picked=await page.evaluate(async()=>{const token=document.querySelector<HTMLMetaElement>('meta[name=ai-web-token]')!.content;const headers={'X-AI-Web-Token':token};return Promise.all(['/api/select-workspace-folder','/api/ssh/select-key'].map(route=>fetch(route,{method:'POST',headers}).then(response=>response.json())));});
  expect(picked).toEqual([{path:root},{path:path.join(root,'draft.txt')}]);expect(await desktop.evaluate(()=>Reflect.get(globalThis,'panePickerOwner'))).toBe(true);
  await page.getByRole('treeitem',{name:'draft.txt',exact:true}).click();await page.locator('#editor .monaco-editor textarea').focus();await page.keyboard.press('Control+End');await page.keyboard.type('recovered draft');await expect(page.locator('.file-tab .tab-dirty')).toHaveCount(1);
  // Real PTYs, no AI prompts and no commands sent to external services.
  await page.getByRole('button',{name:'New session',exact:true}).click();await page.locator('[data-launch=shell]').click();await expect(page.locator('.terminal-tab[data-session-id]')).toHaveCount(1);
  await expect(page.locator('.terminal-tab-status')).toHaveAttribute('data-state','running',{timeout:20000});
  await page.getByRole('button',{name:'New session',exact:true}).click();await page.locator('[data-launch=shell]').click();await expect(page.locator('.terminal-screen:not([hidden])')).toHaveCount(2);
  const ids=await page.locator('.terminal-tab').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.sessionId));
  await page.getByRole('separator',{name:'Resize terminal panes'}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('separator',{name:'Resize terminal panes'})).toHaveAttribute('aria-valuenow','55');
  await page.locator('.terminal-screen.pane-focused .xterm-helper-textarea').focus();await page.keyboard.type('Write-Output "PANE_TEST_PID=$PID"');await page.keyboard.press('Enter');await expect(page.locator('.terminal-screen.pane-focused .xterm-rows')).toContainText(/PANE_TEST_PID=\d+/);const pid=Number((await page.locator('.terminal-screen.pane-focused .xterm-rows').innerText()).match(/PANE_TEST_PID=(\d+)/)![1]);
  const viewport=page.locator('.terminal-screen.pane-focused .xterm-viewport');await expect(viewport).toHaveCSS('overflow-y','hidden');await expect(viewport).toHaveCSS('scrollbar-width','none');
  await page.locator('.terminal-screen.pane-focused .xterm-helper-textarea').focus();await page.keyboard.type('1..150 | ForEach-Object { "Scrollback line $_" }');await page.keyboard.press('Enter');const rows=page.locator('.terminal-screen.pane-focused .xterm-rows');await expect(rows).toContainText('Scrollback line 150');await page.locator('.terminal-screen.pane-focused .xterm-screen').hover();await page.mouse.wheel(0,-500);await expect(rows).not.toContainText('Scrollback line 150');await page.screenshot({path:'test-results/desktop-terminal-scrollbar.png',animations:'disabled'});
  await page.waitForFunction(()=>Boolean(localStorage.getItem('pane.workbench.v1')));
  // X -> keep running in tray; restore the same window and terminal identities.
  await desktop.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});await page.getByRole('button',{name:'Close window',exact:true}).click();
  await expect.poll(()=>desktop!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
  await desktop.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].show();});
  await page.reload();await expect(page.getByRole('separator',{name:'Resize terminal panes'})).toHaveAttribute('aria-valuenow','55');
  await expect.poll(()=>page.locator('.terminal-tab').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.sessionId))).toEqual(ids);
  await page.locator('.file-tab').filter({hasText:'draft.txt'}).click();await expect(page.locator('#editor')).toContainText('recovered draft');await expect(page.locator('.file-tab .tab-dirty')).toHaveCount(1);
  await page.screenshot({path:'test-results/desktop-recovery.png'});
  await quit(desktop);desktop=undefined;
  await expect.poll(()=>{try{process.kill(pid,0);return true;}catch{return false;}}).toBe(false);
  expect(await fs.readFile(path.join(root,'draft.txt'),'utf8')).toBe('original\n');
  await fs.writeFile(path.join(root,'draft.txt'),'external edit\n');
  desktop=await launch();page=await desktop.firstWindow();await expect(page.locator('#editor')).toContainText('recovered draft');
  await page.getByRole('button',{name:/^Save/}).click();await expect(page.locator('#toast')).toContainText('The file changed on disk');expect(await fs.readFile(path.join(root,'draft.txt'),'utf8')).toBe('external edit\n');
  // A new app process must not silently start fresh agents or SSH connections.
  await expect(page.locator('.terminal-tab')).toHaveCount(2);await expect(page.locator('.terminal-tab-status[data-state=running]')).toHaveCount(0);
  await page.locator('.terminal-tab').first().click();await expect(page.locator('.terminal-screen:visible').first()).toContainText('This terminal ended');
  await quit(desktop);desktop=undefined;
  await fs.unlink(path.join(root,'draft.txt'));desktop=await launch();page=await desktop.firstWindow();await page.locator('.file-tab').filter({hasText:'draft.txt'}).click();await expect(page.locator('#editor')).toContainText('recovered draft');await expect(page.locator('.file-tab .tab-dirty')).toHaveCount(1);await quit(desktop);desktop=undefined;
 }finally{if(desktop){const pid=desktop.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
