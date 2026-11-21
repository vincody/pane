import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {FileError,type Workspace} from '../files/files.ts';

const execute=promisify(execFile);
async function git(root:string,args:string[]){
 try{return (await execute('git',['-C',root,...args],{windowsHide:true,timeout:30_000,maxBuffer:2*1024*1024,env:{...process.env,LC_ALL:'C',GIT_TERMINAL_PROMPT:'0'}})).stdout.trim();}
 catch(error){const failure=error as {stderr?:string;code?:string};throw new FileError(400,failure.code==='ENOENT'?'Install Git to switch branches.':(failure.stderr||'Git could not complete this request.').split('\n')[0]);}
}
export interface BranchEntry {name:string;remote:boolean;when:string;checkedOut:boolean}

/** Local and remote branches, newest first, for the chat's branch picker. */
export async function listBranches(project:Workspace){
 const [current,refs,trees]=await Promise.all([
  git(project.root,['symbolic-ref','--quiet','--short','HEAD']).catch(()=>''),
  git(project.root,['for-each-ref','--sort=-committerdate','--format=%(refname)|%(committerdate:relative)|%(symref)','refs/heads','refs/remotes']),
  git(project.root,['worktree','list','--porcelain']).catch(()=>''),
 ]);
 const busy=new Set(trees.split('\n').filter(line=>line.startsWith('branch refs/heads/')).map(line=>line.slice(18)));
 const entries:BranchEntry[]=[];
 for(const line of refs.split('\n')){
  const [ref,when,symbolic]=line.split('|');if(!ref||symbolic)continue;
  if(ref.startsWith('refs/heads/')){const name=ref.slice(11);entries.push({name,remote:false,when,checkedOut:busy.has(name)&&name!==current});}
  else if(ref.startsWith('refs/remotes/')){const name=ref.slice(13);if(!name.endsWith('/HEAD'))entries.push({name,remote:true,when,checkedOut:false});}
 }
 return {current,branches:entries.slice(0,200)};
}

export async function switchBranch(project:Workspace,name:unknown){
 if(typeof name!=='string'||!name||name.length>200||/[\0\r\n]|^-/.test(name))throw new FileError(400,'Choose a branch to switch to.');
 const known=await listBranches(project);
 const entry=known.branches.find(item=>item.name===name);
 if(!entry)throw new FileError(404,'That branch no longer exists.');
 if(entry.checkedOut)throw new FileError(409,'This branch is checked out in another workspace.');
 if(entry.remote){const local=name.slice(name.indexOf('/')+1);await git(project.root,['switch','--create',local,'--track',name]);}
 else await git(project.root,['switch',name]);
 return listBranches(project);
}
