import {workspaceForSession} from './history-session.js';
export function setupHistory({api,getProjects,getCurrentProject,onResume}){
 const trigger=document.createElement('button');trigger.id='history-open';trigger.type='button';trigger.className='sidebar-tool';trigger.title='History';trigger.setAttribute('aria-label','History');trigger.setAttribute('aria-haspopup','dialog');trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/></svg>';document.querySelector('.sidebar-footer').prepend(trigger);
 const dialog=document.createElement('dialog');dialog.id='history-dialog';dialog.setAttribute('aria-labelledby','history-title');dialog.innerHTML='<header class="usage-dialog-head"><strong id="history-title">History</strong><button type="button" class="icon-button" aria-label="Close history">×</button></header><div class="history-filters"><input type="search" aria-label="Search history" placeholder="Search conversations…"><select aria-label="History workspace"></select><button type="button" class="icon-button" aria-label="Refresh history" title="Refresh history">↻</button></div><p class="history-status" role="status"></p><div class="history-list"></div>';document.body.append(dialog);
 const search=dialog.querySelector('input'),filter=dialog.querySelector('select'),list=dialog.querySelector('.history-list'),status=dialog.querySelector('.history-status'),refresh=dialog.querySelector('[aria-label="Refresh history"]');
 let records=[],loading=false,resuming=false,request=0,error='';
 function draw(){
  list.replaceChildren();if(loading){status.textContent='Loading history…';return;}if(error){status.textContent=error;return;}
  const projects=getProjects(),query=search.value.trim().toLowerCase(),groups=new Map();
  for(const record of [...records].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))){
   const project=workspaceForSession(record,projects);if(!project||filter.value&&project.id!==filter.value||!['codex','claude'].includes(record.agent))continue;
   if(query&&!`${record.name} ${record.agent} ${project.name}`.toLowerCase().includes(query))continue;
   if(!groups.has(project.id))groups.set(project.id,{project,records:[]});groups.get(project.id).records.push(record);
  }
  let count=0;
  for(const {project,records:items} of groups.values()){
   const heading=document.createElement('h3');heading.textContent=project.name;list.append(heading);
   for(const record of items){
    count++;const button=document.createElement('button');button.type='button';button.className='history-session';button.disabled=resuming;
    const mark=document.createElement('img');mark.src=`/agents/${record.agent}.svg`;mark.alt='';
    const copy=document.createElement('span');copy.className='history-session-copy';const title=document.createElement('strong');title.textContent=record.name||`${record.agent} session`;const meta=document.createElement('small');const date=new Date(record.updatedAt);meta.textContent=`${record.agent==='codex'?'Codex':'Claude'} · ${Number.isNaN(date.getTime())?'Unknown date':date.toLocaleString()}`;copy.append(title,meta);button.append(mark,copy);button.title=`Resume ${title.textContent}\n${record.cwd}`;button.setAttribute('aria-label',`Resume ${record.agent}: ${title.textContent}`);
    button.onclick=async()=>{if(resuming)return;resuming=true;status.textContent='Opening terminal…';for(const entry of list.querySelectorAll('button'))entry.disabled=true;try{await onResume(record,project);dialog.close();}catch(failure){status.textContent=failure.message||'Could not resume session.';}finally{resuming=false;for(const entry of list.querySelectorAll('button'))entry.disabled=false;}};list.append(button);
   }
  }
  status.textContent=count?`${count} conversation${count===1?'':'s'}`:query?'No matching conversations.':'No saved Codex or Claude conversations in this workspace.';
 }
 async function load(){const stamp=++request;loading=true;error='';refresh.disabled=true;draw();try{const data=await api('/api/local-sessions');if(stamp===request)records=data.sessions||[];}catch(failure){if(stamp===request)error=failure.message||'Could not load history. Try refreshing.';}finally{if(stamp===request){loading=false;refresh.disabled=false;draw();}}}
 trigger.onclick=()=>{if(dialog.open)return;filter.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='All workspaces';filter.append(all);for(const project of getProjects()){const option=document.createElement('option');option.value=project.id;option.textContent=project.name;filter.append(option);}filter.value=getCurrentProject()?.id||'';search.value='';dialog.showModal();void load();search.focus();};
 search.oninput=filter.onchange=draw;refresh.onclick=()=>void load();dialog.querySelector('[aria-label="Close history"]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{request++;trigger.focus();});
 return {open:()=>trigger.click()};
}
