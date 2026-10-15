import path from 'node:path';
import {FileError} from '../files/files.ts';
import {gitSnapshot,runGit} from './git-history.ts';

const operations=new Map<string,Promise<unknown>>();
export async function gitSync(root:string,input:Record<string,unknown>){
 if(!['fetch','pull','push'].includes(String(input.action)))throw new FileError(400,'Choose Fetch, Pull or Push.');
 const common=path.resolve(root,(await runGit(root,['rev-parse','--git-common-dir'])).trim());
 const previous=operations.get(common)||Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{
  const state=await gitSnapshot(root);if(!state.available)throw new FileError(400,'Choose a Git workspace.');
  const remote=typeof input.remote==='string'?input.remote:state.remote|| (state.remotes.includes('origin')?'origin':state.remotes[0]);
  if(!remote||!state.remotes.includes(remote)||remote.startsWith('-'))throw new FileError(400,'Choose an available Git remote.');
  if(input.action==='fetch'){await runGit(root,['fetch','--',remote],true);return {message:`Fetched ${remote}.`,state:await gitSnapshot(root)};}
  if(!state.branch||!state.head)throw new FileError(409,'Check out a branch with a commit before pulling or pushing.');
  if(input.expectedHead!==state.head||input.expectedBranch!==state.branch)throw new FileError(409,'The current branch changed. Refresh and review it before retrying.');
  if(state.conflicted)throw new FileError(409,'Resolve the merge conflicts in your terminal before syncing.');
  if(input.action==='pull'){
   if(!state.upstream||state.remote!==remote)throw new FileError(409,'This branch has no upstream on the selected remote. Publish it first or configure its upstream in your terminal.');
   if(state.dirty)throw new FileError(409,'Commit or stash your local changes before pulling.');
   const upstreamBranch=(await runGit(root,['for-each-ref','--format=%(upstream:remoteref)',`refs/heads/${state.branch}`])).trim();
   if(!upstreamBranch.startsWith('refs/heads/'))throw new FileError(409,'Configure a valid upstream branch in your terminal.');
   await runGit(root,['fetch','--',remote,`+${upstreamBranch}:${state.upstream}`],true);
   const refreshed=await gitSnapshot(root);
   if(refreshed.branch!==state.branch||refreshed.head!==state.head||refreshed.upstream!==state.upstream||refreshed.remote!==remote||refreshed.dirty)throw new FileError(409,'The workspace changed while fetching. Refresh before pulling.');
   if(!refreshed.upstream||refreshed.ahead>0&&refreshed.behind>0)throw new FileError(409,'The branches have diverged or the upstream is unavailable. Review the graph and resolve this in your terminal.');
   await runGit(root,['merge','--ff-only','--no-edit','--no-autostash',refreshed.upstream],true);
   return {message:'Updated with a fast-forward pull.',state:await gitSnapshot(root)};
  }
  if(state.upstream&&state.remote!==remote)throw new FileError(409,'Select the branch’s upstream remote before pushing.');
  const tracking=state.upstream?(await runGit(root,['for-each-ref','--format=%(upstream:remoteref)',`refs/heads/${state.branch}`])).trim():`refs/heads/${state.branch}`;
  if(!tracking.startsWith('refs/heads/'))throw new FileError(409,'Configure a valid upstream branch in your terminal.');
  await runGit(root,['push','--',remote,`${state.head}:${tracking}`],true);
  if(!state.upstream)await runGit(root,['branch',`--set-upstream-to=refs/remotes/${remote}/${state.branch}`,state.branch]);
  return {message:state.upstream?'Pushed commits.':'Published branch and configured its upstream.',state:await gitSnapshot(root)};
 });
 operations.set(common,task);try{return await task;}finally{if(operations.get(common)===task)operations.delete(common);}
}
