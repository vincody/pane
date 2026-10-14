import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {FileError,isWithin,type Workspace} from '../files/files.ts';
import type {WorktreeBranches} from '../../../../shared/contracts.ts';

const execute=promisify(execFile);
async function canonicalDestination(directory:string):Promise<string>{
 let ancestor=path.dirname(directory);
 for(;;){try{return path.resolve(await fs.realpath(ancestor),path.relative(ancestor,directory));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const parent=path.dirname(ancestor);if(parent===ancestor)throw error;ancestor=parent;}}
}
async function git(root:string,args:string[]){
 try{return (await execute('git',['-C',root,...args],{windowsHide:true,timeout:60_000,maxBuffer:2*1024*1024,env:{...process.env,LC_ALL:'C',LANG:'C',GIT_TERMINAL_PROMPT:'0'}})).stdout.trim();}
 catch(error){const failure=error as {stderr?:string;code?:string;killed?:boolean},details=failure.stderr||'';
  const message=failure.code==='ENOENT'?'Install Git to create worktrees.':failure.killed?'Git was interrupted. Check the branch and location before retrying; any files created have been kept.':/not a git repository/i.test(details)?'Choose a Git repository to create a worktree.':/needed a single revision|invalid reference: HEAD|not a valid object name.*HEAD/i.test(details)?'Create an initial commit in this repository before adding a worktree.':/not a valid branch name|not allowed for a branch name/i.test(details)?'Use a valid branch name without spaces, such as feat/ssh.':/already checked out|already used by worktree/i.test(details)?'This branch is already checked out in another worktree.':/branch.*already exists/i.test(details)?'This branch already exists. Choose Use an existing branch.':/already exists/i.test(details)?'That location already exists. Choose a new folder.':/permission denied|access is denied|operation not permitted/i.test(details)?'Git could not access the repository or location. Check folder permissions.':/no space left|disk full/i.test(details)?'There is not enough disk space to create this worktree.':'Git could not complete this operation. Check the repository, branch and location.';
  throw new FileError(400,message);
 }
}
export async function worktreeBranches(project:Workspace):Promise<WorktreeBranches>{
 const repositoryRoot=await git(project.root,['rev-parse','--show-toplevel']);
 await git(project.root,['rev-parse','--verify','HEAD']);
 const [current,refs,trees]=await Promise.all([
  git(project.root,['symbolic-ref','--quiet','--short','HEAD']).catch(()=>'HEAD'),
  git(project.root,['for-each-ref','--format=%(refname) %(symref)','refs/heads','refs/remotes']),
  git(project.root,['worktree','list','--porcelain','-z']),
 ]);
 const local:string[]=[],remote:string[]=[];
 for(const line of refs.split('\n')){const [ref,symbolic]=line.trim().split(' ');if(!ref||symbolic)continue;if(ref.startsWith('refs/heads/'))local.push(ref.slice(11));else if(ref.startsWith('refs/remotes/'))remote.push(ref);}
 const worktrees:{root:string;branch:string|null}[]=[];let tree:{root:string;branch:string|null}|undefined,excluded=false;
 const flush=()=>{if(tree&&!excluded)worktrees.push(tree);};
 for(const field of trees.split('\0')){if(field.startsWith('worktree ')){flush();tree={root:field.slice(9),branch:null};excluded=false;}else if(field.startsWith('branch refs/heads/')&&tree)tree.branch=field.slice(18);else if(field==='bare'||field.startsWith('prunable'))excluded=true;}
 flush();
 return {current,local,bases:[...local,...remote,...(current==='HEAD'?['HEAD']:[])],checkedOut:worktrees.flatMap(tree=>tree.branch?[tree.branch]:[]),repositoryRoot,worktrees};
}
export async function existingWorktree(project:Workspace,branch:unknown){
 if(typeof branch!=='string'||!branch||branch.length>200)throw new FileError(400,'Choose a branch to open.');
 const tree=(await worktreeBranches(project)).worktrees?.find(tree=>tree.branch===branch);
 if(!tree)throw new FileError(409,'This branch no longer has an open worktree. Refresh the branch list.');
 try{const root=await fs.realpath(tree.root);if(!(await fs.stat(root)).isDirectory())throw new Error();return root;}catch{throw new FileError(404,'This worktree folder is unavailable. Check its location in Git.');}
}
export async function createWorktree(project:Workspace,stateDir:string,input:Record<string,unknown>){
 if(project.parentId)throw new FileError(400,'Create worktrees from the parent workspace.');
 if(input.mode!=='new'&&input.mode!=='existing')throw new FileError(400,'Choose a new or existing branch.');
 const branch=typeof input.branch==='string'?input.branch.trim():'';
 if(!branch||branch.length>200||branch.startsWith('-')||/[\0\r\n]/.test(branch))throw new FileError(400,'Enter a valid branch name.');
 const name=typeof input.name==='string'&&input.name.trim()?input.name.trim():branch;
 if(name.length>200)throw new FileError(400,'Worktree name is too long.');
 await git(project.root,['check-ref-format','--branch',branch]);
 const branches=await worktreeBranches(project);
 if(input.mode==='new'&&branches.local.includes(branch))throw new FileError(409,'This branch already exists. Choose Existing branch.');
 if(input.mode==='existing'&&!branches.local.includes(branch))throw new FileError(400,'Choose an existing local branch.');
 if(branches.checkedOut.includes(branch))throw new FileError(409,'This branch is already checked out in another worktree. Choose another branch.');
 const base=typeof input.base==='string'?input.base:'';
 if(input.mode==='new'&&!branches.bases.includes(base))throw new FileError(400,'Choose a valid starting branch.');
 // Older callers retain their automatic location. New forms supply an explicit path.
 if(input.destination!==undefined&&(typeof input.destination!=='string'||!path.isAbsolute(input.destination)||/[\0\r\n]/.test(input.destination)))throw new FileError(400,'Enter an absolute worktree location.');
 const directory=input.destination===undefined?path.join(path.resolve(stateDir),'worktrees',project.id,crypto.randomUUID()):path.resolve(input.destination as string);
 const repoRoot=await fs.realpath(branches.repositoryRoot||project.root);
 if(input.destination!==undefined&&(isWithin(repoRoot,directory)||isWithin(repoRoot,await canonicalDestination(directory))))throw new FileError(400,'Choose a location outside the repository working folder.');
 try{await fs.lstat(directory);throw new FileError(409,'That location already exists. Choose a new folder.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 try{await fs.mkdir(path.dirname(directory),{recursive:true});}catch{throw new FileError(400,'Could not create the location’s parent folders. Choose a writable folder.');}
 if(input.destination!==undefined&&isWithin(repoRoot,path.join(await fs.realpath(path.dirname(directory)),path.basename(directory))))throw new FileError(400,'Choose a location outside the repository working folder.');
 await git(project.root,input.mode==='new'?['worktree','add','-b',branch,'--',directory,base]:['worktree','add','--',directory,branch]);
 return {root:directory,name,parentId:project.id};
}

// Called only if registering a just-created worktree fails. Git refuses to remove dirty files.
export async function unregisterNewWorktree(project:Workspace,root:string){await git(project.root,['worktree','remove','--',root]);}
