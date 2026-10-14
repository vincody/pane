import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {FileError,isWithin,type Workspace} from '../files/files.ts';
import type {WorktreeBranches} from '../../../../shared/contracts.ts';
import {automaticWorktreeName,worktreeSlug} from '../../../../shared/worktree-composer.ts';

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
 const [current,refs,trees,remoteDefault]=await Promise.all([
  git(project.root,['symbolic-ref','--quiet','--short','HEAD']).catch(()=>'HEAD'),
  git(project.root,['for-each-ref','--format=%(refname) %(symref)','refs/heads','refs/remotes']),
  git(project.root,['worktree','list','--porcelain','-z']),
  git(project.root,['symbolic-ref','--quiet','refs/remotes/origin/HEAD']).catch(()=>''),
 ]);
 const local:string[]=[],remote:string[]=[];
 for(const line of refs.split('\n')){const [ref,symbolic]=line.trim().split(' ');if(!ref||symbolic)continue;if(ref.startsWith('refs/heads/'))local.push(ref.slice(11));else if(ref.startsWith('refs/remotes/'))remote.push(ref);}
 const worktrees:{root:string;branch:string|null}[]=[];let tree:{root:string;branch:string|null}|undefined,excluded=false;
 const flush=()=>{if(tree&&!excluded)worktrees.push(tree);};
 for(const field of trees.split('\0')){if(field.startsWith('worktree ')){flush();tree={root:field.slice(9),branch:null};excluded=false;}else if(field.startsWith('branch refs/heads/')&&tree)tree.branch=field.slice(18);else if(field==='bare'||field.startsWith('prunable'))excluded=true;}
 flush();
 const bases=[...local,...remote,...(current==='HEAD'?['HEAD']:[])];
 const defaultBase=bases.includes(remoteDefault)?remoteDefault:local.includes('main')?'main':local.includes('master')?'master':current;
 return {current,local,bases,checkedOut:worktrees.flatMap(tree=>tree.branch?[tree.branch]:[]),repositoryRoot,defaultBase,worktrees};
}
export async function createComposerWorktree(project:Workspace,stateDir:string,input:Record<string,unknown>){
 const branches=await worktreeBranches(project);
 const requestedName=typeof input.name==='string'?input.name.trim():'';
 const name=requestedName||automaticWorktreeName();
 if(name.length>80||/[\0\r\n]/.test(name))throw new FileError(400,'Use a workspace name of up to 80 characters.');
 const seed=worktreeSlug(name);if(!seed)throw new FileError(400,'Use a workspace name containing letters or numbers.');
 const source=typeof input.source==='string'&&input.source?input.source:branches.defaultBase||branches.current;
 if(!branches.bases.includes(source))throw new FileError(400,'Choose an available starting branch.');
 const note=typeof input.note==='string'?input.note.trim():'';if(note.length>2000)throw new FileError(400,'Keep the note under 2,000 characters.');
 const override=typeof input.branchName==='string'?input.branchName.trim():'';
 const reuse=input.reuseBranch===true;
 if(reuse&&(!branches.local.includes(source)||branches.checkedOut.includes(source)))throw new FileError(409,'This branch cannot be reused. Open its checkout or create a new branch from it.');
 const root=branches.repositoryRoot||project.root;
 const directoryRoot=path.join(path.dirname(root),path.basename(root)+'-worktrees');
 const customLocation=typeof input.destination==='string'&&input.destination.trim()?input.destination.trim():null;
 for(let attempt=1;attempt<=100;attempt++){
  const leaf=attempt===1?seed:`${seed}-${attempt}`;
  const branch=reuse?source:override||(!requestedName.includes('/')?leaf:attempt===1?requestedName:`${requestedName}-${attempt}`);
  const destination=customLocation||path.join(directoryRoot,leaf);
  let occupied=false;try{await fs.lstat(destination);occupied=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(!reuse&&!override&&branches.local.includes(branch))continue;
  if(!reuse&&!override&&!customLocation&&occupied)continue;
  const result=await createWorktree(project,stateDir,{mode:reuse?'existing':'new',name:attempt===1?name:`${name}-${attempt}`,branch,base:source,destination});
  return {...result,...(note?{note}:{})};
 }
 throw new FileError(409,'Could not find a free worktree name. Enter a different name.');
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
 if(input.mode==='new'&&base.startsWith('refs/remotes/')){
  const remoteRef=base.slice('refs/remotes/'.length);
  const remotes=(await git(project.root,['remote'])).split('\n').filter(Boolean).sort((a,b)=>b.length-a.length);
  const remote=remotes.find(value=>remoteRef.startsWith(`${value}/`));
  if(!remote)throw new FileError(400,'The starting branch remote is unavailable. Choose another starting branch.');
  const remoteBranch=remoteRef.slice(remote.length+1);
  try{await git(project.root,['fetch','--no-tags','--',remote,`+refs/heads/${remoteBranch}:${base}`]);}
  catch{throw new FileError(400,'Could not fetch the latest starting branch. Check your connection and Git access, then retry, or choose a local branch. No worktree was created.');}
 }
 await git(project.root,input.mode==='new'?['worktree','add','-b',branch,'--',directory,base]:['worktree','add','--',directory,branch]);
 return {root:directory,name,parentId:project.id};
}

// Called only if registering a just-created worktree fails. Git refuses to remove dirty files.
export async function unregisterNewWorktree(project:Workspace,root:string){await git(project.root,['worktree','remove','--',root]);}
