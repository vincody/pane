import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildResourceSnapshot,createResourceMonitor} from '../../server/src/features/resources/resources.ts';
import {parsePsRows,type ProcessRow} from '../../server/src/features/terminal/terminal-agents.ts';

const MB=1024*1024;
const row=(ProcessId:number,ParentProcessId:number,Name:string,mb:number,cpu100ns=0,CommandLine=''):ProcessRow=>({ProcessId,ParentProcessId,Name,CommandLine,CreationDate:'2026-01-01T00:00:00Z',WorkingSetSize:mb*MB,KernelModeTime:cpu100ns,UserModeTime:0});
const host={totalMemory:16*1024*MB,freeMemory:4*1024*MB};
const terminals=[{id:'t1',project:'p',pid:100,agent:'claude',ssh:false}];
// Pane (10) with a renderer, a GPU process and a utility process; terminal 100 runs a shell (100) and an agent (101); 999 is unrelated.
const processes=(cpu:number)=>[row(10,1,'Pane.exe',100,cpu),row(11,10,'Pane.exe',300,cpu,'Pane.exe --type=renderer --lang=en'),row(12,10,'Pane.exe',200,cpu,'Pane.exe --type=gpu-process'),row(13,10,'Pane.exe',50,cpu,'Pane.exe --type=utility'),row(100,10,'pwsh.exe',40,cpu),row(101,100,'node.exe',500,cpu),row(999,1,'other.exe',900,cpu)];

test('processes under Pane are split into the app groups and terminals, and unrelated ones are ignored',()=>{
 const {snapshot}=buildResourceSnapshot({rows:processes(0),terminals,rootPid:10,previous:new Map(),at:1000,host});
 assert.equal(snapshot.app.main.memory,100*MB);assert.equal(snapshot.app.renderer.memory,300*MB);assert.equal(snapshot.app.gpu.memory,200*MB);assert.equal(snapshot.app.other.memory,50*MB);
 assert.equal(snapshot.app.memory,650*MB);assert.equal(snapshot.app.processes,4);
 assert.deepEqual(snapshot.terminals.map(item=>({id:item.id,memory:item.memory,processes:item.processes,agent:item.agent})),[{id:'t1',memory:540*MB,processes:2,agent:'claude'}]);
 assert.equal(snapshot.app.cpu,null);assert.equal(snapshot.terminals[0].cpu,null);
});

test('CPU is a percentage of one core between two samples, and a reused process ID starts over',()=>{
 const first=buildResourceSnapshot({rows:processes(0),terminals,rootPid:10,previous:new Map(),at:1000,host});
 // 2 s later every process has used 1 s of CPU time (10,000,000 units of 100 ns): 50% each.
 const second=buildResourceSnapshot({rows:processes(10_000_000),terminals,rootPid:10,previous:first.samples,at:3000,host});
 assert.equal(Math.round(second.snapshot.app.main.cpu!),50);assert.equal(Math.round(second.snapshot.app.cpu!),200);assert.equal(Math.round(second.snapshot.terminals[0].cpu!),100);
 const reused=processes(10_000_000).map(item=>Number(item.ProcessId)===101?{...item,CreationDate:'2026-02-02T00:00:00Z',KernelModeTime:10}:item);
 const third=buildResourceSnapshot({rows:reused,terminals,rootPid:10,previous:first.samples,at:3000,host});
 assert.equal(Math.round(third.snapshot.terminals[0].cpu!),50);
});

test('a baseline older than 15 seconds is not used for CPU',()=>{
 const first=buildResourceSnapshot({rows:processes(0),terminals,rootPid:10,previous:new Map(),at:1000,host});
 const late=buildResourceSnapshot({rows:processes(10_000_000),terminals,rootPid:10,previous:first.samples,at:1000+16000,host});
 assert.equal(late.snapshot.app.cpu,null);
 const soon=buildResourceSnapshot({rows:processes(10_000_000),terminals,rootPid:10,previous:first.samples,at:1000+14000,host});
 assert.ok(soon.snapshot.app.cpu!>0);
});

test('a terminal whose process is gone is left out, and platforms without CPU times report no CPU',()=>{
 const gone=buildResourceSnapshot({rows:processes(0).filter(item=>Number(item.ProcessId)!==100&&Number(item.ProcessId)!==101),terminals,rootPid:10,previous:new Map(),at:1,host});
 assert.deepEqual(gone.snapshot.terminals,[]);
 const noCpu=buildResourceSnapshot({rows:[{ProcessId:10,ParentProcessId:1,Name:'pane',WorkingSetSize:5*MB}],terminals:[],rootPid:10,previous:new Map(),at:1,host});
 assert.equal(noCpu.snapshot.app.cpu,null);assert.equal(noCpu.snapshot.app.memory,5*MB);
});

test('the monitor shares a reading taken within a second, keeps CPU history and reports failures',async()=>{
 let time=10_000,reads=0,fail=false;
 const monitor=createResourceMonitor({listTerminals:()=>terminals,rootPid:10,now:()=>time,host:()=>host,read:async()=>{reads++;if(fail)throw new Error('wmi');return processes(reads*10_000_000);}});
 const first=await monitor.read();assert.equal(first.available,true);assert.equal(first.app.cpu,null);
 time+=500;assert.equal(await monitor.read(),first);assert.equal(reads,1);
 time+=2000;const second=await monitor.read();assert.equal(reads,2);assert.ok(second.app.cpu!>0);
 time+=3000;fail=true;const failed=await monitor.read();assert.equal(failed.available,false);assert.equal(failed.terminals.length,0);
});

test('ps output is parsed with resident memory in bytes',()=>{
 const rows=parsePsRows('  42     1  2048 Mon Jan  5 10:00:00 2026 node /usr/bin/node /opt/app/server.js\n  43    42   512 Mon Jan  5 10:00:01 2026 bash bash -l\nnot a row\n');
 assert.deepEqual(rows.map(item=>[item.ProcessId,item.ParentProcessId,item.WorkingSetSize,item.Name]),[[42,1,2048*1024,'node'],[43,42,512*1024,'bash']]);
});
