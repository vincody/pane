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
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pane-dev-server-api-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const app=await createApp({initialRoot:root,stateDir:path.join(root,'state'),agentHome:root,devServerOptions:{collect:async()=>({complete:true,listeners:[{...listener,commandLine:`node "${path.join(root,'server.mjs')}"`}],processes:[]}),probe:async()=> 'http',excludePid:-1}});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.closeSessions();await new Promise<void>(resolve=>app.server.close(()=>resolve()));});
 const base=`http://127.0.0.1:${serverPort(app.server)}/api/dev-servers?project=`,project=[...app.files.projects.values()][0],headers={'X-AI-Web-Token':app.token};
 assert.equal((await fetch(base+project.id)).status,403);assert.equal((await fetch(base+'missing',{headers})).status,404);
 const snapshot=await (await fetch(base+project.id,{headers})).json() as DevServerSnapshot;
 assert.equal(snapshot.rows.length,1);assert.equal(snapshot.rows[0].projectId,project.id);assert.equal('commandLine' in snapshot.rows[0],false);assert.equal('cwd' in snapshot.rows[0],false);
});
