import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Runs the app with the real PATH minus any folder holding a real claude or codex, plus an optional folder of fake agent CLIs.
async function withApp(fakeAgents:boolean,run:(app:ElectronApplication,page:import('@playwright/test').Page,root:string)=>Promise<void>){
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-agent-'))),root=path.join(data,'my project'),bin=path.join(data,'bin');await fs.mkdir(root);await fs.mkdir(bin);
 await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 if(fakeAgents)for(const agent of ['claude','codex'])await fs.writeFile(path.join(bin,`${agent}.cmd`),`@echo off\r\necho FAKE_${agent.toUpperCase()}_RUNNING in %CD%\r\n`);
 const hasAgent=(dir:string)=>['claude','codex'].some(agent=>['','.exe','.cmd','.bat','.ps1'].some(extension=>existsSync(path.join(dir,agent+extension))));
 const inherited=(process.env.PATH||process.env.Path||'').split(path.delimiter).filter(dir=>dir&&!hasAgent(dir));
 const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='path')),Path:[fakeAgents?bin:'',...inherited].filter(Boolean).join(path.delimiter),PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17327'};
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;
  application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env});application.process().stderr?.on('data',()=>{});
  await run(application,await application.firstWindow(),root);
 }finally{if(application){const pid=application.process().pid;if(pid)try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}

test('an agent session starts without its command being typed into the terminal',async()=>{
 await withApp(true,async(_app,page,root)=>{
  await page.getByRole('button',{name:'New session',exact:true}).click();
  const claude=page.locator('[data-launch=claude]');await expect(claude).toBeEnabled();await claude.click();
  const rows=page.locator('.terminal-screen.pane-focused .xterm-rows');
  await expect(rows).toContainText('FAKE_CLAUDE_RUNNING',{timeout:30000});
  const text=await rows.innerText();
  expect(text).toContain(root);expect(text).not.toMatch(/PS [^\n]*> *claude/);expect(text).not.toMatch(/-EncodedCommand|Set-Location/);
 });
});

test('Claude and Codex cannot be launched when their CLI is not installed, while Shell still can',async()=>{
 await withApp(false,async(_app,page)=>{
  await page.getByRole('button',{name:'New session',exact:true}).click();
  for(const agent of ['claude','codex']){const button=page.locator(`[data-launch=${agent}]`);await expect(button).toBeDisabled();await expect(button).toContainText('Not installed');await expect(button).toHaveAttribute('title',/is not installed/);}
  await expect(page.locator('[data-launch=shell]')).toBeEnabled();
  await page.locator('[data-launch=shell]').click();await expect(page.locator('.terminal-tab-status[data-state=running]')).toHaveCount(1,{timeout:20000});
 });
});
