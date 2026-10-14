import http from 'node:http';
import https from 'node:https';
import type {DevServer,DevServerSnapshot,Workspace} from '../../../../shared/contracts.ts';
import {collectDevServerPorts,type Listener,type PortScan} from './dev-server-scan.ts';

type Protocol=DevServer['protocol'];
interface Observation {row:DevServer;startTime?:string;misses:number;stoppedAt?:number;probedAt?:number}
interface TerminalRoot {projectId:string;tail:string;urls:Map<number,{url:string;at:number}>}
export interface DevServerOptions {getProjects:()=>Workspace[];collect?:()=>Promise<PortScan>;probe?:(host:string,port:number)=>Promise<Protocol>;clock?:()=>number;excludePid?:number}

export function loopbackHost(host:string):string|null {
 if(host==='0.0.0.0'||host==='localhost'||host==='*')return '127.0.0.1';
 if(host.includes(':'))try{host=new URL(`http://[${host}]/`).hostname.slice(1,-1);}catch{return null;}
 if(host==='::'||host==='::1')return '::1';
 return /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)&&host.split('.').every(part=>Number(part)<=255)?host:null;
}
export function probeWebProtocol(host:string,port:number):Promise<Protocol>{
 const target=loopbackHost(host);if(!target)return Promise.resolve('unknown');
 const attempt=(tls:boolean)=>new Promise<boolean>(resolve=>{
  const finish=(result:boolean)=>{clearTimeout(timer);request.destroy();resolve(result);};
  // Detection accepts local development certificates. Opening the URL still uses
  // the browser's normal certificate validation; no credentials or redirects.
  const request=(tls?https:http).request({hostname:target,port,method:'HEAD',path:'/',agent:false,maxHeaderSize:16384,...(tls?{rejectUnauthorized:false}:{})},response=>{response.destroy();finish(true);});
  const timer=setTimeout(()=>finish(false),600);
  request.on('error',()=>finish(false));
  request.end();
 });
 return attempt(false).then(async plain=>plain?'http':await attempt(true)?'https':'unknown');
}
function comparable(value:string):string {const normalized=value.replaceAll('\\','/').replace(/\/+$/,'');return process.platform==='win32'?normalized.toLowerCase():normalized;}
function within(root:string,cwd:string):boolean {const parent=comparable(root),child=comparable(cwd);return child===parent||child.startsWith(parent+'/');}
function commandContains(command:string,root:string):boolean {
 const text=comparable(command),value=comparable(root);let index=text.indexOf(value);
 while(index>=0){const before=index?text[index-1]:'',after=text[index+value.length]||'';if((!before||/[\s"'=]/.test(before))&&(!after||/[\s"'/]/.test(after)))return true;index=text.indexOf(value,index+value.length);}
 return false;
}
export function createDevServers({getProjects,collect=collectDevServerPorts,probe=probeWebProtocol,clock=Date.now,excludePid}:DevServerOptions){
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
   if(listener.pid===excludePid)continue;
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
   if(host&&(observation.probedAt===undefined||now-observation.probedAt>=15000))pending.push({observation,host});
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
    try{protocol=await probe(host,observation.row.port);}catch{}
    if(disposed)return;
    observation.probedAt=clock();
    if(protocol!=='unknown'){observation.row.protocol=protocol;const origin=`${protocol}://${host.includes(':')?`[${host}]`:host}:${observation.row.port}`;
     if(!observation.row.url||!observation.row.url.startsWith(origin+'/'))observation.row.url=origin+'/';
    }else if(!observation.row.url){observation.row.protocol='unknown';}
   }
  }));
 }
 async function read(projectId:string):Promise<DevServerSnapshot>{
  if(!disposed&&(!scannedAt||clock()-lastScan>=3000)){
   inFlight||=scan().finally(()=>{inFlight=undefined;});
  }
  await inFlight;
  for(const [key,value] of observations)if(value.stoppedAt!==undefined&&clock()-value.stoppedAt>=5000)observations.delete(key);
  const projects=getProjects();
  const rows=[...observations.values()].filter(value=>value.row.projectId===projectId&&projects.some(project=>project.id===projectId)).map(value=>({...value.row,...(value.stoppedAt!==undefined?{stoppedAt:new Date(value.stoppedAt).toISOString()}:{}),...(clock()-Date.parse(value.row.observedAt)>15000&&value.row.status==='running'?{status:'unknown' as const}:{})})).sort((a,b)=>a.port-b.port).slice(0,200);
  return {available,scannedAt,rows,...(error?{error}:{})};
 }
 return {register,unregister,output,read,dispose(){disposed=true;roots.clear();observations.clear();}};
}
