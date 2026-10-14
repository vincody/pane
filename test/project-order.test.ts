import {serverPort} from './helpers/http.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/app.ts';
import {newestSessions,sessionDate} from '../client/session-date.ts';
test('session rows sort by newest activity across live and saved records and expose an absolute date',()=>{
 const records=[{id:'old-live',live:true,updatedAt:'2026-09-01T10:00:00Z'},{id:'new-saved',updatedAt:'2026-10-12T10:00:00Z'},{id:'unknown'}];assert.deepEqual(newestSessions(records).map((item:{id:string})=>item.id),['new-saved','old-live','unknown']);assert.equal(records[0].id,'old-live');assert.match(sessionDate(records[1])!.label,/12\/10\/2026/);assert.equal(sessionDate(records[1])!.iso,'2026-10-12T10:00:00.000Z');assert.equal(sessionDate(records[2]),null);
});
test('project order is validated, written atomically and survives an app restart',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ai-web-order-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const directories=['first','second','third'].map(name=>path.join(root,name));for(const directory of directories)await fs.mkdir(directory);const stateDir=path.join(root,'state');let app=await createApp({initialRoot:directories[0],stateDir});let open=()=>new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));await open();let base=`http://127.0.0.1:${serverPort(app.server)}`,headers={'X-AI-Web-Token':app.token,'Content-Type':'application/json'};for(const directory of directories.slice(1))await fetch(base+'/api/projects',{headers,method:'POST',body:JSON.stringify({path:directory})});const projects=(await(await fetch(base+'/api/projects',{headers})).json()).projects;const ids=projects.map((item:{id:string})=>item.id).reverse();const post=(body:unknown)=>fetch(base+'/api/project-order',{headers,method:'POST',body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/api/project-order',{method:'POST',body:'{}'})).status,403);assert.equal((await post({ids:[ids[0],ids[0],ids[1]]})).status,400);assert.equal((await post({ids:ids.slice(1)})).status,409);assert.equal((await post({ids})).status,200);assert.deepEqual((await(await fetch(base+'/api/projects',{headers})).json()).projects.map((item:{id:string})=>item.id),ids);await new Promise<void>(resolve=>app.server.close(()=>resolve()));app=await createApp({initialRoot:directories[0],stateDir});await open();t.after(()=>new Promise<void>(resolve=>app.server.close(()=>resolve())));base=`http://127.0.0.1:${serverPort(app.server)}`;headers['X-AI-Web-Token']=app.token;assert.deepEqual((await(await fetch(base+'/api/projects',{headers})).json()).projects.map((item:{id:string})=>item.id),ids);
});
