import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import {isIP} from 'node:net';
import {readProcesses, type ProcessRow} from '../terminal/terminal-agents.ts';
import {native} from '../../lib/native.ts';

export interface Listener {pid:number;host:string;port:number;processName?:string;commandLine?:string;cwd?:string;startTime?:string}
export interface PortScan {listeners:Listener[];processes:ProcessRow[];complete:boolean;error?:string;unresolvedPorts?:number[]}
type Run = (file:string,args:string[])=>Promise<string>;
const exec=promisify(execFile);
const run:Run=async(file,args)=>(await exec(file,args,{windowsHide:true,timeout:5000,maxBuffer:8*1024*1024})).stdout;
function address(value:string):{host:string;port:number}|null {
 const colon=value.lastIndexOf(':');if(colon<1)return null;
 const host=value.slice(0,colon).replace(/^\[|\]$/g,''),raw=value.slice(colon+1),port=Number(raw);
 return (host==='*'||isIP(host)!==0)&&/^\d+$/.test(raw)&&Number.isInteger(port)&&port>0&&port<=65535?{host,port}:null;
}
function unique(rows:Listener[]):Listener[]{return [...new Map(rows.map(row=>[`${row.pid}:${row.host}:${row.port}`,row])).values()];}
export function parseNetstatListeners(text:string):Listener[]{
 return unique(text.split(/\r?\n/).flatMap(line=>{const fields=line.trim().split(/\s+/);if(fields.length!==5||fields[0]!=='TCP'||fields[3]!=='LISTENING'||!/^\d+$/.test(fields[4]))return [];const local=address(fields[1]),pid=Number(fields[4]);return local&&local.host!=='*'&&Number.isSafeInteger(pid)&&pid>0?[{...local,pid}]:[];}));
}
export function parseLsofListeners(text:string):Listener[]{
 let pid=0,name='';const rows:Listener[]=[];
 for(const line of text.split(/\r?\n/)){const field=line[0],value=line.slice(1);if(field==='p'){pid=Number(value);name='';}else if(field==='c')name=value;else if(field==='n'){const local=address(value);if(local&&Number.isSafeInteger(pid)&&pid>0)rows.push({...local,pid,processName:name});}}
 return unique(rows);
}
export interface ScanOptions {platform?:NodeJS.Platform;run?:Run;processes?:()=>Promise<ProcessRow[]>;procRoot?:string}
export async function collectDevServerPorts(options:ScanOptions={}):Promise<PortScan>{
 const platform=options.platform??process.platform,execute=options.run??run;
 let processes:ProcessRow[]=[];
 try{
  processes=await (options.processes??readProcesses)();let listeners:Listener[]=[],complete=true,unresolvedPorts:number[]|undefined;
  if(platform==='win32'){
   // Only the real scan uses the addon: a caller that supplies `run` or `platform` is testing the netstat path.
   const addon=options.run===undefined&&options.platform===undefined?native():null;let direct:Listener[]|undefined;
   if(addon)try{direct=unique((JSON.parse(addon.listTcpListeners()) as {pid:number;host:string;port:number}[]).filter(row=>row.pid>0));}catch{}
   listeners=direct??parseNetstatListeners(await execute('netstat.exe',['-ano','-p','tcp']));
  }
  else if(platform==='linux'){
   const root=options.procRoot??'/proc',inodes=new Map<string,{host:string;port:number}[]>();
   for(const version of ['tcp','tcp6']){let content:string;try{content=await fs.readFile(`${root}/net/${version}`,'utf8');}catch{complete=false;continue;}
    for(const line of content.split('\n').slice(1)){const fields=line.trim().split(/\s+/);if(fields.length<10||fields[3]!=='0A')continue;const [hex,portHex]=fields[1].split(':');if(!portHex||!/^([\da-f]{8}|[\da-f]{32})$/i.test(hex))continue;const port=parseInt(portHex,16);if(port<1||port>65535)continue;const bytes=hex.match(/../g);if(!bytes)continue;
     const ordered=hex.length===8?[...bytes].reverse():Array.from({length:4},(_,index)=>bytes.slice(index*4,index*4+4).reverse()).flat();const host=hex.length===8?ordered.map(byte=>parseInt(byte,16)).join('.'):Array.from({length:8},(_,index)=>ordered.slice(index*2,index*2+2).join('')).join(':');const inode=fields[9];inodes.set(inode,[...(inodes.get(inode)??[]),{host,port}]);
    }
   }
   const resolvedInodes=new Set<string>();
   for(const row of processes){const pid=Number(row.ProcessId);if(!Number.isSafeInteger(pid)||pid<1)continue;let descriptors:string[];try{descriptors=await fs.readdir(`${root}/${pid}/fd`);}catch{continue;}
    let cwd:string|undefined;try{cwd=await fs.readlink(`${root}/${pid}/cwd`);}catch{}
    for(const fd of descriptors){try{const target=await fs.readlink(`${root}/${pid}/fd/${fd}`),match=target.match(/^socket:\[(\d+)\]$/);if(match){resolvedInodes.add(match[1]);for(const local of inodes.get(match[1])??[])listeners.push({...local,pid,cwd});}}catch{}}
   }
   listeners=unique(listeners);
   unresolvedPorts=[...new Set([...inodes.entries()].filter(([inode])=>!resolvedInodes.has(inode)).flatMap(([,entries])=>entries.map(entry=>entry.port)))];
  }else if(platform==='darwin'){
   let output:string;try{output=await execute('lsof',['-nP','-iTCP','-sTCP:LISTEN','-Fpcn']);}catch(error){if(error instanceof Error&&'code' in error&&error.code===1&&'stdout' in error&&error.stdout==='')output='';else throw error;}
   listeners=parseLsofListeners(output);
   const pids=[...new Set(listeners.map(row=>row.pid))];if(pids.length){const cwdByPid=new Map<number,string>();let pid=0;for(const line of (await execute('lsof',['-a','-d','cwd','-p',pids.join(','),'-Fpn'])).split(/\r?\n/)){if(line[0]==='p')pid=Number(line.slice(1));else if(line[0]==='n')cwdByPid.set(pid,line.slice(1));}listeners=listeners.map(row=>({...row,cwd:cwdByPid.get(row.pid)}));}
  }else return {listeners:[],processes,complete:false,error:'Listening-port discovery is unavailable on this platform.'};
  const metadata=new Map(processes.map(row=>[Number(row.ProcessId),row]));
  listeners=listeners.map(listener=>{const row=metadata.get(listener.pid);return {...listener,processName:row?.Name??listener.processName,commandLine:row?.CommandLine,startTime:row&&'CreationDate' in row&&typeof row.CreationDate==='string'?row.CreationDate:undefined};});
  return {listeners,processes,complete,...(unresolvedPorts?{unresolvedPorts}:{}),...(!complete?{error:'Some process or socket information could not be read.'}:{})};
 }catch(error){return {listeners:[],processes,complete:false,error:error instanceof Error?error.message:'Listening-port discovery failed.'};}
}
