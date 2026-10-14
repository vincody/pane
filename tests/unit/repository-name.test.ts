import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {nameFromRemote} from '../../server/src/features/git/repository-name.ts';
import {createApp} from '../../server/src/app.ts';
import {isWithin} from '../../server/src/features/files/files.ts';
test('repository identity comes from HTTPS and SSH origin URLs without exposing credentials',()=>{
 for(const url of ['https://github.com/vincody/pane.git','git@github.com:vincody/pane.git','ssh://git@github.com/vincody/pane.git','https://user:password@github.com/vincody/pane.git?token=secret','https://github.com/vincody/pane/'])assert.equal(nameFromRemote(url),'pane');
 for(const url of ['','/local/repo','C:\\local\\repo','file:///local/repo'])assert.equal(nameFromRemote(url),null);
});
test('legacy folder names become repository names while custom labels survive restarts',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pane-name-')),root=path.join(temp,'ai-web'),stateDir=path.join(temp,'state');
 await fs.mkdir(root);await fs.mkdir(stateDir);const run=promisify(execFile);
 await run('git',['-C',root,'init'],{windowsHide:true});await run('git',['-C',root,'remote','add','origin','https://github.com/vincody/pane.git'],{windowsHide:true});
 await fs.writeFile(path.join(stateDir,'projects.json'),JSON.stringify({projects:[{root,name:'ai-web'}]}));
 const first=await createApp({initialRoot:root,stateDir});assert.equal([...first.files.projects.values()][0]!.name,'pane');await first.closeSessions();
 await fs.writeFile(path.join(stateDir,'projects.json'),JSON.stringify({projects:[{root,name:'My project'}]}));
 const custom=await createApp({initialRoot:root,stateDir});assert.equal([...custom.files.projects.values()][0]!.name,'My project');await custom.closeSessions();
 await fs.writeFile(path.join(stateDir,'projects.json'),JSON.stringify({projects:[{root,name:'ai-web',nameSource:'custom'}]}));
 const explicit=await createApp({initialRoot:root,stateDir});assert.equal([...explicit.files.projects.values()][0]!.name,'ai-web');await explicit.closeSessions();
 t.after(async()=>{assert.ok(isWithin(path.resolve(os.tmpdir()),path.resolve(temp)));await fs.rm(temp,{recursive:true,force:true});});
});
