import {attachBranchSuggestions} from './branch-suggestions.ts';
import type {Api} from '../../components/contracts.ts';
import type {Workspace,WorktreeBranches} from '../../../../shared/contracts.ts';
import {automaticWorktreeName,worktreeSlug,type WorktreeLaunch} from '../../../../shared/worktree-composer.ts';

export function createSubWorkspaceDialog({api,getProjects,onCreated}:{api:Api;getProjects:()=>Workspace[];onCreated:(project:Workspace,launch:WorktreeLaunch)=>Promise<void>}){
 const dialog=document.createElement('dialog');dialog.id='sub-workspace-dialog';dialog.className='orca-worktree-composer';dialog.setAttribute('aria-labelledby','sub-workspace-title');
 dialog.innerHTML='<header class="dialog-heading"><span id="sub-workspace-title">Create worktree</span><button type="button" class="icon-button" aria-label="Close worktree dialog">×</button></header><form><label>Project<select name="repository" aria-label="Worktree project"></select></label><div class="composer-source-heading"><label for="composer-create-from">Create From <small>Optional</small></label><label class="composer-base"><span>Start from</span><select name="base" aria-label="Starting branch"></select></label></div><input id="composer-create-from" name="source" aria-label="Create From" maxlength="80" placeholder="Name your worktree or choose a branch" autocomplete="off"><p class="composer-source-hint" role="status"></p><div class="composer-reuse" hidden><label><input type="checkbox" name="reuse" aria-label="Reuse branch">Reuse branch</label><small>Check out the existing branch instead of creating a new one from it.</small></div><button type="button" class="composer-open-existing secondary-button" hidden>Open existing worktree</button><label>Agent<select name="agent" aria-label="Worktree agent"><option value="shell">Blank terminal</option><option value="claude">Claude Code</option><option value="codex">Codex</option><option value="none">No session</option></select></label><details class="composer-advanced"><summary>Advanced</summary><div><label class="composer-display-name" hidden>Name<input name="displayName" aria-label="Worktree name" maxlength="80" placeholder="Uses the selected branch name"></label><label>Branch name<input name="branchName" aria-label="Worktree branch" maxlength="200" placeholder="Automatic from the workspace name"></label><label>Location<input name="destination" aria-label="Worktree location" maxlength="4096" placeholder="Automatic location"></label><label>Note<textarea name="note" aria-label="Worktree note" maxlength="2000" rows="2" placeholder="Write a note"></textarea></label></div></details><p class="composer-preview"></p><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary-button sub-workspace-cancel">Cancel</button><button type="submit" class="primary-button">Create worktree</button></div></form>';
 document.body.append(dialog);
 const form=dialog.querySelector<HTMLFormElement>('form')!,error=form.querySelector<HTMLElement>('.form-error')!,submit=form.querySelector<HTMLButtonElement>('[type=submit]')!,source=form.querySelector<HTMLInputElement>('[name=source]')!,base=form.querySelector<HTMLSelectElement>('[name=base]')!,repository=form.querySelector<HTMLSelectElement>('[name=repository]')!,branch=form.querySelector<HTMLInputElement>('[name=branchName]')!,displayName=form.querySelector<HTMLInputElement>('[name=displayName]')!,destination=form.querySelector<HTMLInputElement>('[name=destination]')!,reuse=form.querySelector<HTMLInputElement>('[name=reuse]')!,agent=form.querySelector<HTMLSelectElement>('[name=agent]')!,note=form.querySelector<HTMLTextAreaElement>('[name=note]')!,openExisting=form.querySelector<HTMLButtonElement>('.composer-open-existing')!;
 const suggestions=attachBranchSuggestions(source);
 let parent:Workspace|undefined,metadata:WorktreeBranches|undefined,loaded=false,busy=false,generation=0,automaticName='',lastSource:string|null=null,destinationTouched=false;
 const shortRef=(value:string)=>value.replace(/^refs\/remotes\//,'');
 const pickedSource=()=>metadata?.bases.find(value=>value===source.value.trim()||shortRef(value)===source.value.trim())||null;
 const worktreeName=()=>{const picked=pickedSource();if(picked&&displayName.value.trim())return displayName.value.trim();if(picked?.startsWith('refs/remotes/'))return shortRef(picked).split('/').slice(1).join('/');return source.value.trim()||automaticName;};
 function options(select:HTMLSelectElement,values:string[]){select.replaceChildren(...values.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=shortRef(value);return option;}));}
 function update(){
  const picked=pickedSource(),eligible=Boolean(picked&&metadata?.local.includes(picked)&&!metadata.checkedOut.includes(picked));
  if(picked!==lastSource){reuse.checked=eligible&&!displayName.value.trim();lastSource=picked;}
  form.querySelector<HTMLElement>('.composer-reuse')!.hidden=!eligible;
  form.querySelector<HTMLElement>('.composer-display-name')!.hidden=!picked;
  form.querySelector<HTMLElement>('.composer-base')!.hidden=Boolean(picked);
  branch.disabled=busy||reuse.checked&&eligible;
  let seed=worktreeSlug(worktreeName());
  let targetBranch=reuse.checked&&eligible?picked!:branch.value.trim()||(worktreeName().includes('/')?worktreeName():seed);
  if(!reuse.checked&&!branch.value.trim()){const original=seed;let suffix=1;while(metadata?.local.includes(targetBranch)&&suffix<100){suffix++;seed=`${original}-${suffix}`;targetBranch=worktreeName().includes('/')?`${worktreeName()}-${suffix}`:seed;}}
  const root=metadata?.repositoryRoot||parent?.root||'';
  const separator=root.includes('\\')?'\\':'/';
  const hasNameInput=Boolean(source.value.trim()||displayName.value.trim()||branch.value.trim());
  if(!destinationTouched)destination.value=hasNameInput&&root&&seed?`${root}-worktrees${separator}${seed}`:'';
  const checked=Boolean(picked&&metadata?.checkedOut.includes(picked));openExisting.hidden=!checked;openExisting.disabled=busy||!loaded;
  form.querySelector<HTMLElement>('.composer-source-hint')!.textContent=!loaded?'Loading branches…':picked?`From ${shortRef(picked)}${checked?' · already checked out':''}`:source.value.trim()?'A new workspace named after your task.':'';
  const preview=form.querySelector<HTMLElement>('.composer-preview')!;
  preview.hidden=!loaded||!hasNameInput;
  preview.textContent=preview.hidden?'':`Branch: ${targetBranch}${reuse.checked&&eligible?' · existing':' · new'}`;
  submit.disabled=busy||!loaded||!seed;error.hidden=!error.textContent;
 }
 source.oninput=()=>{error.textContent='';displayName.value='';update();};
 for(const input of [branch,displayName])input.oninput=()=>{error.textContent='';update();};
 reuse.onchange=update;destination.oninput=()=>{destinationTouched=true;error.textContent='';update();};
 agent.onchange=()=>{try{localStorage.setItem('ai-web.worktree-agent',agent.value);}catch{}};
 function close(){if(!busy)dialog.close();}
 dialog.querySelector<HTMLButtonElement>('[aria-label="Close worktree dialog"]')!.onclick=close;form.querySelector<HTMLButtonElement>('.sub-workspace-cancel')!.onclick=close;
 dialog.oncancel=event=>{if(busy)event.preventDefault();};
 async function loadProject(project:Workspace){
  parent=project;loaded=false;metadata=undefined;lastSource=null;const request=++generation;options(base,[]);suggestions.setBranches([]);error.textContent='';update();
  try{
   const data=await api<WorktreeBranches>(`/api/sub-workspaces?${new URLSearchParams({project:project.id})}`);if(request!==generation||!dialog.open)return;
   metadata=data;options(base,data.bases);base.value=data.defaultBase||data.current;
   suggestions.setBranches(data.bases);
   loaded=true;update();
  }catch(failure){if(request===generation){error.textContent=failure instanceof Error?failure.message:'Could not load project.';update();}}
 }
 repository.onchange=()=>{const project=getProjects().find(item=>item.id===repository.value&&!item.parentId);if(project)void loadProject(project);};
 async function perform(open=false){
  if(busy||!loaded||!parent)return;busy=true;error.textContent='';update();submit.textContent=open?'Opening…':'Creating…';
  for(const control of form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea'))control.disabled=true;
  try{
   const picked=pickedSource();
   const created=await api<Workspace>(`/api/sub-workspaces?${new URLSearchParams({project:parent.id})}`,{method:'POST',body:JSON.stringify(open?{mode:'open',branch:picked}:{mode:'compose',name:worktreeName(),source:picked||base.value,reuseBranch:Boolean(picked&&reuse.checked),branchName:branch.value.trim(),...(destinationTouched?{destination:destination.value.trim()}:{}),note:note.value.trim()})});
   dialog.close();await onCreated(created,open||agent.value==='none'?null:agent.value as Exclude<WorktreeLaunch,null>);
  }catch(failure){error.textContent=failure instanceof Error?failure.message:'Could not create worktree.';}
  finally{busy=false;submit.innerHTML='Create worktree';for(const control of form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea'))control.disabled=false;update();}
 }
 form.onsubmit=event=>{event.preventDefault();void perform();};openExisting.onclick=()=>{void perform(true);};
 return {async open(project:Workspace){
  if(busy)return;form.reset();form.querySelector<HTMLDetailsElement>('details')!.open=false;automaticName=automaticWorktreeName(getProjects().map(project=>project.name));destinationTouched=false;metadata=undefined;loaded=false;lastSource=null;
  try{const saved=localStorage.getItem('ai-web.worktree-agent');if(saved&&['shell','claude','codex','none'].includes(saved))agent.value=saved;}catch{}
  options(repository,[]);for(const item of getProjects().filter(item=>!item.parentId)){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;option.title=item.root;repository.append(option);}
  repository.value=project.id;if(!dialog.open)dialog.showModal();source.focus();await loadProject(project);
 }};
}
