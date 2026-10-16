import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDevServers,probeWebProtocol,loopbackHost} from '../../server/src/features/dev-servers/dev-servers.ts';
import type {PortScan,Listener} from '../../server/src/features/dev-servers/dev-server-scan.ts';
import type {Workspace,DevServerSnapshot} from '../../shared/contracts.ts';
import {createApp} from '../../server/src/app.ts';
import {serverPort} from '../helpers/http.ts';

const workspace:Workspace={id:'one',name:'One',root:path.resolve('fixtures','one')};
const startTime='2026-10-14T00:00:00.000Z';
const listener:Listener={pid:20,host:'0.0.0.0',port:5173,processName:'node',startTime};
function fixture(){
 let now=Date.parse(startTime)+1000,scan:PortScan={complete:true,listeners:[listener],processes:[{ProcessId:10,ParentProcessId:1},{ProcessId:20,ParentProcessId:10}]};
 let projects=[workspace],calls=0;
 const service=createDevServers({getProjects:()=>projects,collect:async()=>{calls++;return scan;},clock:()=>now,probe:async()=> 'http',excludePid:-1});
 service.register(10,workspace);
 return {service,get calls(){return calls;},set scan(value:PortScan){scan=value;},set projects(value:Workspace[]){projects=value;},advance(ms=3000){now+=ms;}};
}
test('listening descendants belong to their terminal workspace, dual stack is one server and scan calls coalesce',async()=>{
 const f=fixture();f.scan={complete:true,listeners:[listener,{...listener,host:'::'}],processes:[{ProcessId:20,ParentProcessId:10}]};
 const [first,second]=await Promise.all([f.service.read('one'),f.service.read('one')]);
 assert.equal(f.calls,1);assert.deepEqual(first,second);assert.equal(first.rows.length,1);
 assert.equal(first.rows[0].url,'http://127.0.0.1:5173/');assert.equal(first.rows[0].status,'running');
 f.projects=[];assert.equal((await f.service.read('one')).rows.length,0);f.service.dispose();
});
test('external servers match the deepest directory with path boundaries',async()=>{
 const nested:Workspace={id:'nested',name:'Nested',root:path.join(workspace.root,'nested')};
 const service=createDevServers({getProjects:()=>[workspace,nested],collect:async()=>({complete:true,processes:[],listeners:[{...listener,cwd:path.join(nested.root,'src')},{...listener,pid:21,port:5174,commandLine:`node "${path.join(workspace.root,'server.mjs')}"`},{...listener,pid:22,port:5175,commandLine:`node "${workspace.root}-other/server.mjs"`}]}),probe:async()=> 'unknown'});
 assert.equal((await service.read('nested')).rows[0].port,5173);
 assert.deepEqual((await service.read('one')).rows.map(row=>row.port),[5174]);service.dispose();
});
test('scan failures and incomplete scans never turn one missed observation into a stopped server',async()=>{
 const f=fixture();await f.service.read('one');
 const missing:PortScan={complete:true,listeners:[],processes:[]};
 f.scan=missing;f.advance();assert.equal((await f.service.read('one')).rows[0].status,'unknown');
 f.scan={...missing,complete:false,error:'Temporary failure'};f.advance();const failed=await f.service.read('one');
 assert.equal(failed.available,false);assert.equal(failed.rows[0].status,'unknown');
 f.scan=missing;f.advance();assert.equal((await f.service.read('one')).rows[0].status,'unknown');
 f.advance();assert.equal((await f.service.read('one')).rows[0].status,'stopped');
 f.advance(4999);assert.equal((await f.service.read('one')).rows[0].status,'stopped');
 f.advance(1);assert.equal((await f.service.read('one')).rows.length,0);f.service.dispose();
});
test('a recycled PID on the same port gets a new identity and loses the previous web URL',async()=>{
 let scan:PortScan={complete:true,processes:[{ProcessId:20,ParentProcessId:10}],listeners:[listener]},now=Date.parse(startTime)+1000;
 const service=createDevServers({getProjects:()=>[workspace],collect:async()=>scan,probe:async()=> 'unknown',clock:()=>now,excludePid:-1});service.register(10,workspace);
 service.output(10,'\x1b[32mLocal: http://local');service.output(10,'host:5173/preview?secret=hidden\x1b[0m\n');
 const original=(await service.read('one')).rows[0];assert.equal(original.url,'http://127.0.0.1:5173/preview');
 now+=3000;scan={...scan,listeners:[{...listener,startTime:'2026-10-14T00:00:04.000Z'}]};
 const current=(await service.read('one')).rows[0];assert.notEqual(current.id,original.id);assert.equal(current.url,null);assert.equal(current.protocol,'unknown');service.dispose();
});
test('unreadable sockets block stop confirmation only for their own port',async()=>{
 const f=fixture();await f.service.read('one');
 f.scan={complete:true,listeners:[],processes:[],unresolvedPorts:[5173]};
 f.advance();await f.service.read('one');f.advance();assert.equal((await f.service.read('one')).rows[0].status,'unknown');
 f.scan={complete:true,listeners:[],processes:[],unresolvedPorts:[9229]};
 f.advance();await f.service.read('one');f.advance();assert.equal((await f.service.read('one')).rows[0].status,'stopped');f.service.dispose();
});
test('web probing uses HEAD without following redirects and leaves non-loopback ports unknown',async t=>{
 const methods:string[]=[];const server=http.createServer((req,res)=>{methods.push(`${req.method} ${req.url}`);res.writeHead(302,{Location:'http://example.invalid/'});res.end();});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 assert.equal(await probeWebProtocol('0.0.0.0',serverPort(server)),'http');assert.deepEqual(methods,['HEAD /']);
 assert.equal(await probeWebProtocol('192.168.1.10',5173),'unknown');
 assert.equal(loopbackHost('0000:0000:0000:0000:0000:0000:0000:0001'),'::1');assert.equal(loopbackHost('127.999.0.1'),null);
});
test('Dev servers API requires authentication and registered workspace, exposing only scoped display data',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-dev-server-api-')));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const app=await createApp({initialRoot:root,stateDir:path.join(root,'state'),agentHome:root,devServerOptions:{collect:async()=>({complete:true,listeners:[{...listener,commandLine:`node "${path.join(root,'server.mjs')}"`}],processes:[]}),probe:async()=> 'http',excludePid:-1}});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.closeSessions();await new Promise<void>(resolve=>app.server.close(()=>resolve()));});
 const base=`http://127.0.0.1:${serverPort(app.server)}/api/dev-servers?project=`,project=[...app.files.projects.values()][0],headers={'X-AI-Web-Token':app.token};
 assert.equal((await fetch(base+project.id)).status,403);assert.equal((await fetch(base+'missing',{headers})).status,404);
 const snapshot=await (await fetch(base+project.id,{headers})).json() as DevServerSnapshot;
 assert.equal(snapshot.rows.length,1);assert.equal(snapshot.rows[0].projectId,project.id);assert.equal('commandLine' in snapshot.rows[0],false);assert.equal('cwd' in snapshot.rows[0],false);
});
const statusOf=(code:number)=>(error:unknown)=>(error as {status?:number}).status===code;
function terminable(overrides:{excludePid?:number;kill?:(pid:number)=>Promise<void>;scan?:PortScan}={}){
 const killed:number[]=[];let now=Date.parse(startTime)+1000,scan:PortScan=overrides.scan??{complete:true,listeners:[listener],processes:[{ProcessId:10,ParentProcessId:1},{ProcessId:20,ParentProcessId:10}]},collects=0;
 const service=createDevServers({getProjects:()=>[workspace],collect:async()=>{collects++;return scan;},clock:()=>now,probe:async()=> 'http',excludePid:overrides.excludePid??-1,kill:overrides.kill??(async pid=>{killed.push(pid);})});
 return {service,killed,get collects(){return collects;},set scan(value:PortScan){scan=value;},advance(ms=3000){now+=ms;}};
}
test('the server running Pane itself is never listed, by process or by the port the request came in on',async()=>{
 const own=createDevServers({getProjects:()=>[workspace],collect:async()=>({complete:true,listeners:[{...listener,pid:process.pid,port:7317},listener],processes:[]}),probe:async()=> 'http',clock:()=>Date.parse(startTime)+1000});
 own.register(process.pid,workspace);own.register(20,workspace);
 assert.deepEqual((await own.read('one')).rows.map(row=>row.port),[5173]);own.dispose();
 const f=terminable();f.service.register(10,workspace);assert.equal((await f.service.read('one',{ownPort:5173})).rows.length,0);assert.equal((await f.service.read('one',{ownPort:7317})).rows.length,1);f.service.dispose();
});
test('terminate stops a verified running server and shows it as stopped right away',async()=>{
 const f=terminable();f.service.register(10,workspace);
 const [row]=(await f.service.read('one')).rows;assert.equal(row.status,'running');
 assert.deepEqual(await f.service.terminate('one',row.id),{terminated:true});assert.deepEqual(f.killed,[20]);
 f.scan={complete:true,listeners:[],processes:[]};
 const after=(await f.service.read('one')).rows;assert.equal(after.length,1);assert.equal(after[0].status,'stopped');
 await assert.rejects(()=>f.service.terminate('one',row.id),statusOf(404));assert.deepEqual(f.killed,[20]);f.service.dispose();
});
test('terminate refuses unknown servers, other workspaces and servers that changed since the scan',async()=>{
 const f=terminable();f.service.register(10,workspace);
 const [row]=(await f.service.read('one')).rows;
 await assert.rejects(()=>f.service.terminate('one','missing'),statusOf(404));
 await assert.rejects(()=>f.service.terminate('other',row.id),statusOf(404));
 f.scan={complete:true,listeners:[{...listener,startTime:'2026-10-15T00:00:00.000Z'}],processes:[]};
 await assert.rejects(()=>f.service.terminate('one',row.id),statusOf(409));
 f.scan={complete:true,listeners:[{...listener,port:3000}],processes:[]};
 await assert.rejects(()=>f.service.terminate('one',row.id),statusOf(409));
 assert.deepEqual(f.killed,[]);f.service.dispose();
});
test('terminate never stops Pane, its parent processes or a terminal shell',async()=>{
 const itself=terminable({excludePid:20});itself.service.register(10,workspace);
 const [own]=(await itself.service.read('one')).rows??[];assert.equal(own,undefined);itself.service.dispose();
 const parent=terminable({excludePid:30,scan:{complete:true,listeners:[listener],processes:[{ProcessId:10,ParentProcessId:1},{ProcessId:20,ParentProcessId:10},{ProcessId:30,ParentProcessId:20}]}});parent.service.register(10,workspace);
 const [row]=(await parent.service.read('one')).rows;
 await assert.rejects(()=>parent.service.terminate('one',row.id),statusOf(403));assert.deepEqual(parent.killed,[]);parent.service.dispose();
 const shell=terminable();shell.service.register(20,workspace);
 const [terminal]=(await shell.service.read('one')).rows;
 await assert.rejects(()=>shell.service.terminate('one',terminal.id),statusOf(403));assert.deepEqual(shell.killed,[]);shell.service.dispose();
});
test('a failed stop is reported and the server stays running',async()=>{
 const f=terminable({kill:async()=>{throw new Error('Access is denied.');}});f.service.register(10,workspace);
 const [row]=(await f.service.read('one')).rows;
 await assert.rejects(()=>f.service.terminate('one',row.id),statusOf(500));
 assert.equal((await f.service.read('one')).rows[0].status,'running');f.service.dispose();
});
test('the terminate API needs the token and a registered workspace and stops only what Pane lists',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-dev-server-stop-')));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const killed:number[]=[];
 const app=await createApp({initialRoot:root,stateDir:path.join(root,'state'),agentHome:root,devServerOptions:{collect:async()=>({complete:true,listeners:[{...listener,commandLine:`node "${path.join(root,'server.mjs')}"`}],processes:[]}),probe:async()=> 'http',excludePid:-1,kill:async pid=>{killed.push(pid);}}});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.closeSessions();await new Promise<void>(resolve=>app.server.close(()=>resolve()));});
 const origin=`http://127.0.0.1:${serverPort(app.server)}`,project=[...app.files.projects.values()][0],headers={'X-AI-Web-Token':app.token,'Content-Type':'application/json'};
 const stop=(body:unknown,authenticated=true)=>fetch(`${origin}/api/dev-servers/terminate`,{method:'POST',headers:authenticated?headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const snapshot=await (await fetch(`${origin}/api/dev-servers?project=${project.id}`,{headers})).json() as DevServerSnapshot;const [row]=snapshot.rows;
 assert.equal((await stop({project:project.id,id:row.id},false)).status,403);
 assert.equal((await stop({project:'missing',id:row.id})).status,404);assert.equal((await stop({project:project.id})).status,400);assert.equal((await stop({project:project.id,id:'nope'})).status,404);
 assert.deepEqual(killed,[]);
 assert.equal((await stop({project:project.id,id:row.id})).status,200);assert.deepEqual(killed,[listener.pid]);
});
