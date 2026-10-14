import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FileError,isWithin,MAX_TEXT_BYTES } from './files.ts';
const exec=promisify(execFile);
export interface GitChange { path: string; added: number | null; removed: number | null; binary: boolean; untracked?: boolean }
export interface GitStatus { code: string; originalPath?: string }
export type GitStatuses = Record<string, GitStatus>;
export type GitChanges = { available: false; files: GitChange[] } | { available: true; baseline: 'HEAD' | null; files: GitChange[]; statuses: GitStatuses; truncated: boolean };
export interface GitFileDiff { path: string; original: string; modified: string; baseline: 'HEAD' | null }
const git=async(cwd: string,args: string[])=>(await exec('git',args,{cwd,windowsHide:true,timeout:6000,maxBuffer:4*1024*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}})).stdout;
export function parseNumstat(text: string): GitChange[]{const parts=text.split('\0'),files: GitChange[]=[];for(let i=0;i<parts.length;i++){const match=parts[i].match(/^(\d+|-)\t(\d+|-)\t([\s\S]*)$/);if(!match)continue;let file=match[3];if(!file){i++;file=parts[++i];}if(file)files.push({path:file,added:match[1]==='-'?null:Number(match[1]),removed:match[2]==='-'?null:Number(match[2]),binary:match[1]==='-'});}return files;}
async function textFile(root: string,file: string){const target=path.resolve(root,file);if(!isWithin(root,target))throw new FileError(403,'File is outside this workspace.');try{const real=await fs.realpath(target);if(!isWithin(root,real))throw new FileError(403,'Linked file is outside this workspace.');const stat=await fs.stat(real);if(stat.size>MAX_TEXT_BYTES)throw new FileError(413,'File is too large for diff preview.');const data=await fs.readFile(real);if(data.includes(0))throw new FileError(415,'Binary files have no text diff.');return new TextDecoder('utf-8',{fatal:true}).decode(data);}catch(error){if(error instanceof Error && 'code' in error && error.code==='ENOENT')return '';throw error;}}
export function parseStatus(text: string): GitStatuses {const parts=text.split('\0'),statuses: GitStatuses={};for(let i=0;i<parts.length;i++){const row=parts[i];if(row.length<4)continue;const code=row.slice(0,2),file=row.slice(3);statuses[file]={code};if(/[RC]/.test(code))statuses[file].originalPath=parts[++i];}return statuses;}
export async function changes(cwd: string | undefined): Promise<GitChanges>{
 if(!cwd)return {available:false,files:[]};
 try{
  const root=await fs.realpath(cwd);await git(root,['rev-parse','--show-toplevel']);
  const baseline=await git(root,['rev-parse','--verify','HEAD']).then(()=> 'HEAD' as const,()=>null);
  const [stat,statusText]=await Promise.all([baseline?git(root,['diff','--no-ext-diff','--no-textconv','--relative','--numstat','-z','HEAD','--','.']):Promise.resolve(''),git(root,['status','--porcelain=v1','-z','--untracked-files=all','--','.'])]);
  const prefix=(await git(root,['rev-parse','--show-prefix'])).trim();
  const statuses: GitStatuses={};for(const [file,status] of Object.entries(parseStatus(statusText))){if(prefix&&!file.startsWith(prefix))continue;const relative=prefix?file.slice(prefix.length):file;statuses[relative]={...status,...(status.originalPath?{originalPath:prefix&&status.originalPath.startsWith(prefix)?status.originalPath.slice(prefix.length):status.originalPath}:{})};}
  const files=parseNumstat(stat);
  const additions=Object.keys(statuses).filter(file=>!baseline||statuses[file].code==='??'||/A/.test(statuses[file].code)&&!files.some(entry=>entry.path===file));
  for(const file of additions.slice(0,200)){try{const text=await textFile(root,file);files.push({path:file,added:text?text.split('\n').length-(text.endsWith('\n')?1:0):0,removed:0,untracked:true,binary:false});}catch{files.push({path:file,added:null,removed:null,untracked:true,binary:true});}}
  return {available:true,baseline,files:files.slice(0,200),statuses,truncated:files.length>200||additions.length>200};
 }catch{return {available:false,files:[]};}
}
export async function fileDiff(cwd: string,file: string): Promise<GitFileDiff>{const data=await changes(cwd);if(!data.available)throw new FileError(404,'This file is no longer in the change list.');const entry=data.files.find(item=>item.path===file);if(!entry)throw new FileError(404,'This file is no longer in the change list.');if(entry.binary)throw new FileError(415,'This file has no supported text diff.');const root=await fs.realpath(cwd);const modified=await textFile(root,file);let original='';if(data.baseline&&!entry.untracked&&!/^A/.test(data.statuses?.[file]?.code||'')){const prefix=(await git(root,['rev-parse','--show-prefix'])).trim();original=await git(root,['show',`HEAD:${prefix}${data.statuses?.[file]?.originalPath||file}`]);if(Buffer.byteLength(original)>MAX_TEXT_BYTES)throw new FileError(413,'Original file is too large for diff preview.');}return {path:file,original,modified,baseline:data.baseline};}
