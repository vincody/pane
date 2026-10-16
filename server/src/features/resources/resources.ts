import os from 'node:os';
import {readProcesses,type ProcessRow} from '../terminal/terminal-agents.ts';
import type {ResourceApp,ResourceSnapshot,ResourceTerminal,ResourceUsage} from '../../../../shared/resources.ts';

export interface TerminalRoot {id:string;project:string;pid:number;agent:string|null;ssh:boolean}
type CpuSamples=Map<string,{time:number;at:number}>;
const MIN_SAMPLE_GAP=1000;
// An older baseline would turn into a misleading long-run average.
const MAX_CPU_WINDOW=15000;
const num=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};

function descendants(children:Map<number,number[]>,root:number){
 const found=new Set<number>([root]),queue=[root];
 for(let index=0;index<queue.length;index++)for(const child of children.get(queue[index])||[])if(!found.has(child)){found.add(child);queue.push(child);}
 return found;
}
const empty=():ResourceUsage=>({memory:0,cpu:null,processes:0});

// CPU time is cumulative, so a percentage (of one core) needs the previous sample of the same process.
export function buildResourceSnapshot(input:{rows:ProcessRow[];terminals:TerminalRoot[];rootPid:number;previous:CpuSamples;at:number;host:{totalMemory:number;freeMemory:number}}):{snapshot:ResourceSnapshot;samples:CpuSamples}{
 const {rows,terminals,rootPid,previous,at,host}=input;
 const byPid=new Map<number,ProcessRow>(),children=new Map<number,number[]>();
 for(const row of rows){const pid=Number(row.ProcessId),parent=Number(row.ParentProcessId);byPid.set(pid,row);children.set(parent,[...(children.get(parent)||[]),pid]);}
 const samples:CpuSamples=new Map();
 const add=(usage:ResourceUsage,pid:number)=>{
  const row=byPid.get(pid);if(!row)return;
  usage.memory+=num(row.WorkingSetSize);usage.processes++;
  if(row.KernelModeTime===undefined&&row.UserModeTime===undefined)return;
  const key=`${pid}:${row.CreationDate||''}`,time=num(row.KernelModeTime)+num(row.UserModeTime);samples.set(key,{time,at});
  const before=previous.get(key);
  if(before&&at>before.at&&at-before.at<=MAX_CPU_WINDOW&&time>=before.time)usage.cpu=(usage.cpu??0)+(time-before.time)/((at-before.at)*10000)*100;
 };
 const owned=new Set<number>(),rowsOut:ResourceTerminal[]=[];
 for(const terminal of terminals){
  if(!byPid.has(terminal.pid))continue;
  const usage:ResourceUsage=empty(),tree=descendants(children,terminal.pid);
  for(const pid of tree){owned.add(pid);add(usage,pid);}
  rowsOut.push({...usage,id:terminal.id,project:terminal.project,pid:terminal.pid,agent:terminal.agent,ssh:terminal.ssh});
 }
 const app:ResourceApp={...empty(),main:empty(),renderer:empty(),gpu:empty(),other:empty()};
 for(const pid of descendants(children,rootPid)){
  if(owned.has(pid)||!byPid.has(pid))continue;
  const command=String(byPid.get(pid)!.CommandLine||''),kind=pid===rootPid?'main':/--type=renderer\b/.test(command)?'renderer':/--type=gpu-process\b/.test(command)?'gpu':'other';
  add(app[kind],pid);add(app,pid);
 }
 return {snapshot:{available:true,sampledAt:new Date(at).toISOString(),host,app,terminals:rowsOut},samples};
}

export interface ResourceMonitorOptions {listTerminals:()=>TerminalRoot[];read?:()=>Promise<ProcessRow[]>;rootPid?:number;now?:()=>number;host?:()=>{totalMemory:number;freeMemory:number}}
export function createResourceMonitor({listTerminals,read=readProcesses,rootPid=process.pid,now=Date.now,host=()=>({totalMemory:os.totalmem(),freeMemory:os.freemem()})}:ResourceMonitorOptions){
 let previous:CpuSamples=new Map(),last:ResourceSnapshot|undefined,lastAt=0,pending:Promise<ResourceSnapshot>|undefined;
 async function sample():Promise<ResourceSnapshot>{
  try{
   const rows=await read(),at=now();
   const result=buildResourceSnapshot({rows,terminals:listTerminals(),rootPid,previous,at,host:host()});
   previous=result.samples;last=result.snapshot;lastAt=at;return result.snapshot;
  }catch{
   return {available:false,error:'Process information is unavailable.',sampledAt:new Date(now()).toISOString(),host:host(),app:{...empty(),main:empty(),renderer:empty(),gpu:empty(),other:empty()},terminals:[]};
  }
 }
 return {
  // Repeated calls inside a second share one reading so the CPU window never collapses to zero.
  read(){
   if(last&&now()-lastAt<MIN_SAMPLE_GAP)return Promise.resolve(last);
   return pending||=sample().finally(()=>{pending=undefined;});
  },
 };
}
