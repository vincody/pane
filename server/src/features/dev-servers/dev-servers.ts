import type {DevServer,DevServerSnapshot,Workspace} from '../../../../shared/contracts.ts';
import {collectDevServerPorts,type Listener,type PortScan} from './dev-server-scan.ts';
import {terminateProcess} from './dev-server-kill.ts';
import {FileError} from '../files/files.ts';

type Protocol=DevServer['protocol'];
interface Observation {row:DevServer;startTime?:string;misses:number;stoppedAt?:number;probedAt?:number}
interface TerminalRoot {projectId:string;tail:string;urls:Map<number,{url:string;at:number}>}
export interface DevServerOptions {getProjects:()=>Workspace[];collect?:()=>Promise<PortScan>;/** Optional active protocol check. Off by default: like Orca, a listener's protocol comes only from a URL its terminal printed, because a plain-HTTP probe of a TLS server (agy's local endpoint) is logged into that terminal as a TLS handshake error. */probe?:(host:string,port:number)=>Promise<Protocol>;clock?:()=>number;excludePid?:number;kill?:(pid:number)=>Promise<void>}

export function loopbackHost(host:string):string|null {
 if(host==='0.0.0.0'||host==='localhost'||host==='*')return '127.0.0.1';
 if(host.includes(':'))try{host=new URL(`http://[${host}]/`).hostname.slice(1,-1);}catch{return null;}
 if(host==='::'||host==='::1')return '::1';
 return /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)&&host.split('.').every(part=>Number(part)<=255)?host:null;
}
function comparable(value:string):string {const normalized=value.replaceAll('\\','/').replace(/\/+$/,'');return process.platform==='win32'?normalized.toLowerCase():normalized;}
function within(root:string,cwd:string):boolean {const parent=comparable(root),child=comparable(cwd);return child===parent||child.startsWith(parent+'/');}
function commandContains(command:string,root:string):boolean {
 const text=comparable(command),value=comparable(root);let index=text.indexOf(value);
 while(index>=0){const before=index?text[index-1]:'',after=text[index+value.length]||'';if((!before||/[\s"'=]/.test(before))&&(!after||/[\s"'/]/.test(after)))return true;index=text.indexOf(value,index+value.length);}
 return false;
}
const AGENT_CLI=/^(agy|antigravity|codex|claude)(\.exe)?$/i;
export function createDevServers({getProjects,collect=collectDevServerPorts,probe,clock=Date.now,excludePid=process.pid,kill=terminateProcess}:DevServerOptions){
 const roots=new Map<number,TerminalRoot>(),observations=new Map<string,Observation>();
 let lastScan=0,scannedAt:string|null=null,available=true,error:string|undefined,inFlight:Promise<void>|undefined,disposed=false;
 function register(pid:number,project:Workspace){roots.set(pid,{projectId:project.id,tail:'',urls:new Map()});}
 function unregister(pid:number){roots.delete(pid);}
 function output(pid:number,data:string){
  const root=roots.get(pid);if(!root)return;
  const text=(root.tail+data).slice(-8192);root.tail=text.slice(-4096);
  const clean=text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
  for(const match of clean.matchAll(/https?:\/\/[^\s<>"'`]+/g))try{
   const url=new URL(match[0].replace(/[),.;]+$/,'')),host=loopbackHost(url.hostname.replace(/^\[|\]$/g,''));
   if(!host||url.username||url.password)continue;
   const port=Number(url.port||(url.protocol==='https:'?443:80));url.hostname=host.includes(':')?`[${host}]`:host;url.search='';url.hash='';
   root.urls.set(port,{url:url.href,at:clock()});if(root.urls.size>32)root.urls.delete(root.urls.keys().next().value!);
  }catch{}
 }
 function identity(listener:Listener){return `${listener.pid}:${listener.port}`;}
 function owner(listener:Listener,scan:PortScan,projects:Workspace[]):{project:Workspace;root?:TerminalRoot}|undefined {
  const parents=new Map(scan.processes.map(row=>[Number(row.ProcessId),Number(row.ParentProcessId)]));
  const visited=new Set<number>();let pid=listener.pid;
  while(pid&&!visited.has(pid)){visited.add(pid);const root=roots.get(pid),project=root&&projects.find(project=>project.id===root.projectId);if(root&&project)return {project,root};pid=parents.get(pid)||0;}
  const ordered=[...projects].sort((a,b)=>b.root.length-a.root.length);
  const project=ordered.find(project=>listener.cwd&&within(project.root,listener.cwd))||ordered.find(project=>listener.commandLine&&commandContains(listener.commandLine,project.root));
  return project?{project}:undefined;
 }
 async function scan(){
  const now=clock(),projects=getProjects();
  let result:PortScan;
  try{result=await collect();}catch{result={listeners:[],processes:[],complete:false,error:'Port scan unavailable.'};}
  if(disposed)return;
  available=result.complete||result.listeners.length>0;error=result.error;
  scannedAt=new Date(now).toISOString();lastScan=clock();
  const seen=new Set<string>(),pending:{observation:Observation;host:string}[]=[];
  const listeners=new Map<string,Listener>();
  for(const listener of result.listeners){const key=identity(listener),previous=listeners.get(key),host=loopbackHost(listener.host);if(!previous||host&&!loopbackHost(previous.host)||host&&!host.includes(':')&&loopbackHost(previous.host)?.includes(':'))listeners.set(key,listener);}
  for(const listener of listeners.values()){
   // An agent CLI's own local endpoints (agy opens two) are not the project's servers.
   if(listener.pid===excludePid||AGENT_CLI.test(listener.processName||''))continue;
   const key=identity(listener),previous=observations.get(key),assignment=owner(listener,result,projects);
   seen.add(key);
   const continuous=Boolean(previous&&previous.startTime&&listener.startTime===previous.startTime);
   if(!assignment){
    if(previous){if(previous.startTime&&listener.startTime&&listener.startTime!==previous.startTime)observations.delete(key);else {previous.row.status='unknown';previous.misses=0;previous.stoppedAt=undefined;}}
    continue;
   }
   const host=loopbackHost(listener.host),hint=assignment.root?.urls.get(listener.port),protocol=continuous?previous!.row.protocol:'unknown';
   const changedIdentity=previous?.startTime&&listener.startTime&&previous.startTime!==listener.startTime;
   const id=continuous||previous&&!listener.startTime&&previous.stoppedAt===undefined?previous!.row.id:`${key}:${listener.startTime||now}`;
   const observation:Observation={startTime:listener.startTime||previous?.startTime,misses:0,probedAt:previous&&!changedIdentity?previous.probedAt:undefined,row:{id,projectId:assignment.project.id,pid:listener.pid,port:listener.port,host:listener.host,name:listener.processName||'Process',status:'running',protocol,url:continuous?previous!.row.url:null,observedAt:new Date(now).toISOString()}};
   const started=listener.startTime?Date.parse(listener.startTime):NaN;
   if(hint&&host&&!changedIdentity&&(!Number.isFinite(started)||started<=hint.at+1000)){
    const url=new URL(hint.url);if(url.hostname.replace(/^\[|\]$/g,'')===host){observation.row.protocol=url.protocol==='https:'?'https':'http';observation.row.url=hint.url;}
   }
   observations.set(key,observation);
   if(probe&&host&&(observation.probedAt===undefined||now-observation.probedAt>=15000))pending.push({observation,host});
  }
  for(const [key,observation] of observations){
   if(!projects.some(project=>project.id===observation.row.projectId)){observations.delete(key);continue;}
   if(!seen.has(key)){
    if(result.complete&&!result.unresolvedPorts?.includes(observation.row.port)){observation.misses++;if(observation.misses>=2){observation.row.status='stopped';observation.stoppedAt??=now;}else observation.row.status='unknown';}
    else {observation.misses=0;if(observation.row.status!=='stopped')observation.row.status='unknown';}
   }
   if(observation.stoppedAt!==undefined&&now-observation.stoppedAt>=5000)observations.delete(key);
  }
  // Bound protocol work per scan; unknown listeners are retried after a cooldown.
  const queue=pending.slice(0,24);
  await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
   for(let item=queue.shift();item;item=queue.shift()){
    const {observation,host}=item;let protocol:Protocol='unknown';
    try{protocol=await probe!(host,observation.row.port);}catch{}
    if(disposed)return;
    observation.probedAt=clock();
    if(protocol!=='unknown'){observation.row.protocol=protocol;const origin=`${protocol}://${host.includes(':')?`[${host}]`:host}:${observation.row.port}`;
     if(!observation.row.url||!observation.row.url.startsWith(origin+'/'))observation.row.url=origin+'/';
    }else if(!observation.row.url){observation.row.protocol='unknown';}
   }
  }));
 }
 /** Stops a running server of a workspace. The process is re-verified (pid, port and start time) just before, and Pane never stops itself, its parents or a terminal. */
 async function terminate(projectId:string,id:string){
  const observation=[...observations.values()].find(value=>value.row.id===id&&value.row.projectId===projectId);
  if(!observation||observation.row.status!=='running'||!getProjects().some(project=>project.id===projectId))throw new FileError(404,'This server is no longer running.');
  const {pid,port}=observation.row;
  if(pid<=4||pid===excludePid||roots.has(pid))throw new FileError(403,'Pane will not stop this process.');
  let fresh:PortScan;try{fresh=await collect();}catch{throw new FileError(503,'Could not verify the server. Try again.');}
  if(!fresh.listeners.some(listener=>listener.pid===pid&&listener.port===port&&(!observation.startTime||listener.startTime===observation.startTime)))throw new FileError(409,'This server changed or has already stopped. Refresh the list.');
  const parents=new Map(fresh.processes.map(row=>[Number(row.ProcessId),Number(row.ParentProcessId)]));
  for(let ancestor=excludePid,hops=0;ancestor>0&&hops<64;ancestor=parents.get(ancestor)||0,hops++)if(ancestor===pid)throw new FileError(403,'Pane will not stop its own process.');
  try{await kill(pid);}catch{throw new FileError(500,'The process could not be stopped. It may need administrator rights.');}
  observation.row.status='stopped';observation.misses=2;observation.stoppedAt=clock();lastScan=0;
  return {terminated:true};
 }
 async function read(projectId:string,{ownPort}:{ownPort?:number}={}):Promise<DevServerSnapshot>{
  if(!disposed&&(!scannedAt||clock()-lastScan>=3000)){
   inFlight||=scan().finally(()=>{inFlight=undefined;});
  }
  await inFlight;
  for(const [key,value] of observations)if(value.stoppedAt!==undefined&&clock()-value.stoppedAt>=5000)observations.delete(key);
  const projects=getProjects();
  const rows=[...observations.values()].filter(value=>value.row.projectId===projectId&&value.row.port!==ownPort&&projects.some(project=>project.id===projectId)).map(value=>({...value.row,...(value.stoppedAt!==undefined?{stoppedAt:new Date(value.stoppedAt).toISOString()}:{}),...(clock()-Date.parse(value.row.observedAt)>15000&&value.row.status==='running'?{status:'unknown' as const}:{})})).sort((a,b)=>a.port-b.port).slice(0,200);
  return {available,scannedAt,rows,...(error?{error}:{})};
 }
 return {register,unregister,output,read,terminate,dispose(){disposed=true;roots.clear();observations.clear();}};
}
