import type {Api} from '../../components/contracts.ts';
import type {Workspace,WorktreeBranches} from '../../../../shared/contracts.ts';
import {suggestWorktreePath} from '../../../../shared/worktree-path.ts';

export function createSubWorkspaceDialog({api,getProjects,onCreated}:{api:Api;getProjects:()=>Workspace[];onCreated:(project:Workspace)=>Promise<void>}){
 const dialog=document.createElement('dialog');dialog.id='sub-workspace-dialog';dialog.setAttribute('aria-labelledby','sub-workspace-title');
 dialog.innerHTML='<header class="dialog-heading"><span id="sub-workspace-title">Worktree</span><button type="button" class="icon-button" aria-label="Close worktree dialog">×</button></header><p class="sub-workspace-parent"></p><form><label>Repository<select name="repository" aria-label="Worktree repository"></select></label><div class="worktree-branch-group"><label>Branch<input name="branch" aria-label="Worktree branch" list="worktree-branch-list" required maxlength="200" placeholder="Choose a branch or type a new name" autocomplete="off"><datalist id="worktree-branch-list"></datalist></label><p class="worktree-branch-hint" role="status"></p><label class="base-branch-field">Start from<select name="base" aria-label="Starting branch"></select></label></div><label>Location<input name="destination" aria-label="Worktree location" required maxlength="4096" placeholder="Enter an absolute folder path" autocomplete="off"><small class="worktree-location-hint">Suggested from the branch. You can choose a different new folder.</small></label><label class="worktree-name-field">Display name <small>optional</small><input name="name" aria-label="Worktree name" maxlength="80" placeholder="Uses the branch name"></label><p class="sub-workspace-note">Select an existing branch or enter a new one. A checked-out branch opens its current folder. Uncommitted changes in Local stay there.</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary-button sub-workspace-cancel">Cancel</button><button type="submit" class="primary-button">Create worktree</button></div></form>';
 document.body.append(dialog);
 const form=dialog.querySelector<HTMLFormElement>('form')!,error=dialog.querySelector<HTMLElement>('.form-error')!,submit=form.querySelector<HTMLButtonElement>('[type=submit]')!,name=form.querySelector<HTMLInputElement>('[name=name]')!,branch=form.querySelector<HTMLInputElement>('[name=branch]')!,base=form.querySelector<HTMLSelectElement>('[name=base]')!,repository=form.querySelector<HTMLSelectElement>('[name=repository]')!,destination=form.querySelector<HTMLInputElement>('[name=destination]')!,branchList=form.querySelector<HTMLDataListElement>('datalist')!,hint=form.querySelector<HTMLElement>('.worktree-branch-hint')!;
 let parent:Workspace|undefined,generation=0,busy=false,loaded=false,destinationTouched=false,customDestination='',repositoryRoot='',metadata:WorktreeBranches|undefined;
 const selectedBranch=()=>branch.value.trim();
 const action=()=>metadata?.checkedOut.includes(selectedBranch())?'open':metadata?.local.includes(selectedBranch())?'existing':'new';
 function canSubmit(){submit.disabled=busy||!loaded||!selectedBranch()||(action()!=='open'&&!destination.value.trim());}
 function updateBranch(){
  const mode=action(),open=mode==='open';destination.readOnly=open;destination.required=!open;
  form.querySelector<HTMLElement>('.base-branch-field')!.hidden=mode!=='new';form.querySelector<HTMLElement>('.worktree-name-field')!.hidden=open;
  if(open){destination.value=metadata?.worktrees?.find(tree=>tree.branch===selectedBranch())?.root||(selectedBranch()===metadata?.current?parent?.root||'':'');}
  else destination.value=destinationTouched?customDestination:suggestWorktreePath(repositoryRoot,selectedBranch());
  hint.textContent=!loaded?'Loading branches…':!selectedBranch()?'Choose an existing branch from the list, or type a new branch name.':open?'Opens the existing checkout without changing its branch.':mode==='existing'?'Checks out this existing branch in a new worktree.':'Creates a new branch in a separate worktree.';
  form.querySelector<HTMLElement>('.worktree-location-hint')!.textContent=open?'Current checkout location.':'Suggested from the branch. You can choose a different new folder.';
  if(!busy)submit.textContent=open?'Open branch':'Create worktree';canSubmit();
 }
 function options(select:HTMLSelectElement,values:string[]){select.replaceChildren(...values.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=value.replace(/^refs\/remotes\//,'');return option;}));}
 branch.oninput=()=>{if(loaded)error.textContent='';updateBranch();};
 destination.oninput=()=>{destinationTouched=true;customDestination=destination.value;if(loaded)error.textContent='';canSubmit();};
 function close(){if(!busy)dialog.close();}
 dialog.querySelector<HTMLButtonElement>('[aria-label="Close worktree dialog"]')!.onclick=close;form.querySelector<HTMLButtonElement>('.sub-workspace-cancel')!.onclick=close;
 dialog.oncancel=event=>{if(busy)event.preventDefault();};
 async function loadRepository(project:Workspace){
  parent=project;repositoryRoot=project.root;loaded=false;const request=++generation;error.textContent='Loading branches…';metadata=undefined;options(base,[]);branchList.replaceChildren();updateBranch();dialog.querySelector<HTMLElement>('.sub-workspace-parent')!.textContent=project.root;
  try{
   const branches=await api<WorktreeBranches>(`/api/sub-workspaces?${new URLSearchParams({project:project.id})}`);
   if(request!==generation||!dialog.open)return;
   metadata=branches;repositoryRoot=branches.repositoryRoot||project.root;options(base,branches.bases);base.value=branches.bases.includes(branches.current)?branches.current:branches.bases[0]||'';for(const value of branches.local){const option=document.createElement('option');option.value=value;option.label=branches.checkedOut.includes(value)?`${value} · Open checkout`:`${value} · Existing branch`;branchList.append(option);}loaded=true;error.textContent='';updateBranch();
  }catch(failure){if(request===generation){error.textContent=failure instanceof Error?failure.message:'Could not load branches.';canSubmit();}}
 }
 repository.onchange=()=>{const project=getProjects().find(project=>project.id===repository.value&&!project.parentId);if(project)void loadRepository(project);};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!loaded||!parent||!selectedBranch()||(action()!=='open'&&!destination.value.trim()))return;busy=true;error.textContent='';submit.disabled=true;submit.textContent='Creating…';
  for(const control of form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))control.disabled=true;
  try{
   const created=await api<Workspace>(`/api/sub-workspaces?${new URLSearchParams({project:parent.id})}`,{method:'POST',body:JSON.stringify({name:name.value.trim()||selectedBranch(),mode:action(),branch:selectedBranch(),base:base.value,destination:destination.value.trim()})});
   dialog.close();await onCreated(created);
  }catch(failure){error.textContent=failure instanceof Error?failure.message:'Could not create worktree.';}
  finally{busy=false;submit.textContent='Create worktree';for(const control of form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))control.disabled=false;updateBranch();}
 };
 return {async open(project:Workspace){
  if(busy)return;form.reset();destinationTouched=false;customDestination='';metadata=undefined;options(repository,[]);
  for(const item of getProjects().filter(item=>!item.parentId)){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;option.title=item.root;repository.append(option);}
  repository.value=project.id;loaded=false;canSubmit();if(!dialog.open)dialog.showModal();branch.focus();await loadRepository(project);
 }};
}
