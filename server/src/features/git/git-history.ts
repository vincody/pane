import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {FileError,MAX_TEXT_BYTES} from '../files/files.ts';
import type {GitSnapshot,GitRef,GitHistory,GitCommitDetails,FileDiff} from '../../../../shared/contracts.ts';

const execute=promisify(execFile);
export async function runGit(root:string,args:string[],network=false){
 try{return (await execute('git',['-C',root,...args],{windowsHide:true,timeout:network?120_000:15_000,maxBuffer:8*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',LC_ALL:'C',LANG:'C'}})).stdout;}
 catch(error){const failure=error as {stderr?:string;killed?:boolean;code?:string};const text=failure.stderr||'';
  throw new FileError(400,failure.code==='ENOENT'?'Git is not installed.':failure.killed?'Git timed out. Check the repository and connection, then refresh before retrying.':/not a git repository/i.test(text)?'This workspace is not a Git repository.':/Authentication failed|Permission denied|could not read Username/i.test(text)?'Git authentication failed. Check your local Git credentials or SSH key.':/Could not resolve|unable to access|Could not read from remote|does not appear to be a git repository/i.test(text)?'Could not reach the Git remote. Check your connection, remote URL and access.':/non-fast-forward|fetch first|rejected/i.test(text)?'The remote has changed. Fetch and review the graph before pushing again.':'Git could not complete the operation. Refresh and check the repository in your terminal.');
 }
}
export async function gitSnapshot(root:string):Promise<GitSnapshot>{
 const empty:GitSnapshot={available:false,branch:null,head:null,upstream:null,remote:null,remotes:[],ahead:0,behind:0,dirty:false,conflicted:false,refs:[]};
 try{await runGit(root,['rev-parse','--show-toplevel']);}catch{return empty;}
 const [branch,head,refsText,remoteText,status]=await Promise.all([
  runGit(root,['symbolic-ref','--quiet','--short','HEAD']).then(value=>value.trim(),()=>null),
  runGit(root,['rev-parse','--verify','HEAD']).then(value=>value.trim(),()=>null),
  runGit(root,['for-each-ref','--format=%(refname)%00%(objectname)%00%(*objectname)%00%(symref)','refs/heads','refs/remotes','refs/tags']),
  runGit(root,['remote']),runGit(root,['status','--porcelain=v1','-z','--untracked-files=normal']),
 ]);
 const refs:GitRef[]=refsText.trim().split('\n').flatMap(line=>{const [ref,hash,peeled,symbolic]=line.split('\0');if(!ref||symbolic)return [];const kind=ref.startsWith('refs/heads/')?'local':ref.startsWith('refs/remotes/')?'remote':'tag';return [{ref,name:ref.replace(/^refs\/(heads|remotes|tags)\//,''),hash:peeled||hash,kind}];});
 let upstream:string|null=null,remote:string|null=null,ahead=0,behind=0;
 if(branch){const tracking=(await runGit(root,['for-each-ref','--format=%(upstream)%00%(upstream:remotename)',`refs/heads/${branch}`])).trim().split('\0');upstream=tracking[0]||null;remote=tracking[1]||null;}
 if(head&&upstream){const counts=await runGit(root,['rev-list','--left-right','--count',`${head}...${upstream}`]).catch(()=>null);if(counts){const values=counts.trim().split(/\s+/).map(Number);ahead=values[0];behind=values[1];}else upstream=null;}
 const entries=status.split('\0');let conflicted=false;
 for(let index=0;index<entries.length;index++){const code=entries[index].slice(0,2);if(['DD','AU','UD','UA','DU','AA','UU'].includes(code))conflicted=true;if(/[RC]/.test(code))index++;}
 return {available:true,branch,head,upstream,remote,remotes:remoteText.trim().split('\n').filter(Boolean),ahead,behind,dirty:Boolean(status),conflicted,refs};
}
const commitHash=(value:unknown)=>{if(typeof value!=='string'||!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value))throw new FileError(400,'Choose a valid commit.');return value;};
async function resolveCommit(root:string,value:unknown){const hash=commitHash(value);return (await runGit(root,['rev-parse','--verify',`${hash}^{commit}`])).trim();}
export async function gitHistory(root:string,ref='all',requestedLimit=80):Promise<GitHistory>{
 const state=await gitSnapshot(root);if(!state.available)throw new FileError(400,'This workspace is not a Git repository.');
 if(ref!=='all'&&ref!=='HEAD'&&!state.refs.some(item=>item.ref===ref))throw new FileError(400,'Choose an available branch or tag.');
 const limit=Math.min(400,Math.max(1,Number.isFinite(requestedLimit)?Math.floor(requestedLimit):80));
 if(!state.head&&!state.refs.length)return {commits:[],refs:[],head:null,hasMore:false};
 const revisions=ref==='all'?['--all',...(state.head?['HEAD']:[])]:[ref];
 const fields=(await runGit(root,['log','--topo-order',`--max-count=${limit+1}`,'-z','--format=%H%x00%P%x00%an%x00%aI%x00%s',...revisions,'--'])).split('\0');
 const commits=[];for(let index=0;index+4<fields.length;index+=5){const [hash,parents,author,date,subject]=fields.slice(index,index+5);commits.push({hash,parents:parents?parents.split(' '):[],author,date,subject});}
 return {commits:commits.slice(0,limit),hasMore:commits.length>limit,refs:state.refs,head:state.head};
}
export async function gitCommitDetails(root:string,value:unknown):Promise<GitCommitDetails>{
 const hash=await resolveCommit(root,value);
 const [metadata,changes]=await Promise.all([runGit(root,['show','-s','--format=%P%x00%an%x00%aI%x00%B',hash,'--']),runGit(root,['diff-tree','--root','--no-commit-id','--name-status','-r','-z','-M',hash+'^!', '--'])]);
 const [parents,author,date,...message]=metadata.split('\0');
 // Compare merges against their first parent, matching the selected commit's mainline diff.
 const parent=parents.split(' ').filter(Boolean)[0];
 const raw=parent?await runGit(root,['diff','--no-ext-diff','--no-textconv','--name-status','-z','-M',parent,hash,'--']):changes;
 const parts=raw.split('\0'),files=[];
 for(let index=0;index<parts.length&&parts[index];){const status=parts[index++],first=parts[index++];if(!first)break;if(/^[RC]/.test(status)){const target=parts[index++];if(target)files.push({path:target,previousPath:first,status:status[0]});}else files.push({path:first,status:status[0]});}
 return {hash,parents:parents.split(' ').filter(Boolean),author,date,message:message.join('\0').trimEnd(),files:files.slice(0,300),truncated:files.length>300};
}
export async function gitCommitDiff(root:string,value:unknown,file:unknown):Promise<FileDiff>{
 const details=await gitCommitDetails(root,value);if(typeof file!=='string')throw new FileError(400,'Choose a changed file.');
 const entry=details.files.find(item=>item.path===file);if(!entry)throw new FileError(404,'This file is not in the selected commit.');
 async function content(revision:string,filename:string){
  const size=Number((await runGit(root,['cat-file','-s',`${revision}:${filename}`])).trim());if(size>MAX_TEXT_BYTES)throw new FileError(413,'This file is too large for a text diff.');
  const text=await runGit(root,['show',`${revision}:${filename}`]);if(text.includes('\0')||text.includes('\ufffd'))throw new FileError(415,'This file has no supported text diff.');return text;
 }
 const parent=details.parents[0]||null;
 const [original,modified]=await Promise.all([parent&&entry.status!=='A'?content(parent,entry.previousPath||entry.path):Promise.resolve(''),entry.status!=='D'?content(details.hash,entry.path):Promise.resolve('')]);
 return {path:entry.path,original,modified,baseline:parent};
}
