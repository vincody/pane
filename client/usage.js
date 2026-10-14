import {miniQuota} from './quota-mini.js';
export function createUsagePanel({api}) {
  const footer=document.querySelector('.sidebar-footer'),settings=document.querySelector('#settings');
  settings.setAttribute('aria-label','Settings');settings.title='Settings';
  for(const node of [...settings.childNodes])if(node.nodeType===Node.TEXT_NODE)node.remove();
  settings.classList.add('sidebar-tool');
  const trigger=document.createElement('button');trigger.id='usage-open';trigger.type='button';trigger.className='sidebar-tool';trigger.title='Usage';trigger.setAttribute('aria-label','Usage');trigger.setAttribute('aria-haspopup','dialog');trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 18a9 9 0 1 1 16 0M12 3v2M5.6 6.6 7 8M18.4 6.6 17 8M3 12h2M19 12h2M12 14l4-5"/><circle cx="12" cy="14" r="1.5"/></svg>';footer.prepend(trigger);
  const dialog=document.createElement('dialog');dialog.id='usage-dialog';dialog.setAttribute('aria-labelledby','usage-title');dialog.innerHTML='<header class="usage-dialog-head"><strong id="usage-title">Usage</strong><button type="button" class="icon-button" aria-label="Close usage">×</button></header><p class="usage-dialog-caption">Account quota remaining</p><div class="usage-dialog-content"></div><button type="button" class="usage-refresh secondary-button">Refresh</button>';document.body.append(dialog);
  const content=dialog.querySelector('.usage-dialog-content'),refreshButton=dialog.querySelector('.usage-refresh');
  dialog.querySelector('[aria-label="Close usage"]').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>trigger.focus());
  trigger.onclick=()=>{if(!dialog.open)dialog.showModal();drawDetails();void refreshDetails();};
  refreshButton.onclick=()=>void refreshDetails();
  const panel=document.createElement('section');panel.id='sidebar-usage';panel.className='compact-usage';panel.setAttribute('aria-label','Account quota remaining');panel.hidden=true;footer.after(panel);
  const row=document.createElement('div');row.className='setting-row';row.innerHTML='<div><strong>Show usage</strong><small>One-line quota remaining below the sidebar tools</small></div><input type="checkbox" aria-label="Show usage">';document.querySelector('.settings-footnote').before(row);
  const setting=row.querySelector('input');let enabled=true;try{enabled=localStorage.getItem('ai-web.show-usage')!=='false';}catch{}setting.checked=enabled;
  let active=['claude','codex'],windowMode='auto';
  try{const saved=JSON.parse(localStorage.getItem('ai-web.usage-display')||'null');if(Array.isArray(saved?.providers))active=['claude','codex'].filter(provider=>saved.providers.includes(provider));if(['auto','5h','7d','both'].includes(saved?.windows))windowMode=saved.windows;}catch{}
  const providerSettings=[];
  for(const provider of ['claude','codex']){
    const name=provider==='codex'?'Codex':'Claude',control=document.createElement('div');control.className='setting-row';control.innerHTML=`<div><strong>${name}</strong><small>Show ${name} in the sidebar quota line</small></div><input type="checkbox" aria-label="Show ${name} usage">`;row.after(control);const input=control.querySelector('input');input.checked=active.includes(provider);providerSettings.push({provider,input});input.onchange=()=>{active=providerSettings.filter(item=>item.input.checked).map(item=>item.provider).sort((a,b)=>a==='claude'?-1:b==='claude'?1:0);saveDisplay();};
  }
  const windowRow=document.createElement('div');windowRow.className='setting-row';windowRow.innerHTML='<div><strong>Quota window</strong><small>Choose which limits appear in the sidebar</small></div><select aria-label="Usage quota window"><option value="auto">Closest to limit</option><option value="5h">5 hours</option><option value="7d">Weekly</option><option value="both">Both</option></select>';row.after(windowRow);const windowSelect=windowRow.querySelector('select');windowSelect.value=windowMode;windowSelect.onchange=()=>{windowMode=windowSelect.value;saveDisplay();};
  let data=new Map(),pending=false,generation=0;
  function saveDisplay(){generation++;try{localStorage.setItem('ai-web.usage-display',JSON.stringify({providers:active,windows:windowMode}));}catch{}draw();void refresh();}
  let detailsPending=false;
  function drawDetails(){
    content.replaceChildren();
    for(const provider of ['codex','claude']){
      const value=data.get(provider),section=document.createElement('section');section.className='usage-provider';
      const heading=document.createElement('strong');heading.textContent=provider==='codex'?'Codex':'Claude';section.append(heading);
      if(value?.available){
        for(const [label,limit] of [['5 hours',value.fiveHour],['Weekly',value.weekly]]){
          const line=document.createElement('div');line.className='usage-detail-line';const name=document.createElement('span'),quota=document.createElement('strong');name.textContent=label;
          const valid=limit&&(!limit.resetsAt||Date.parse(limit.resetsAt)>Date.now());quota.textContent=valid?`${Math.round(Math.max(0,Math.min(100,100-limit.usedPercent)))}% remaining`:'—';line.append(name,quota);section.append(line);
          if(valid&&limit.resetsAt){const reset=document.createElement('small');reset.className='usage-unavailable';reset.textContent=`Resets ${new Date(limit.resetsAt).toLocaleString()}`;section.append(reset);}
        }
      }else{const message=document.createElement('small');message.className='usage-unavailable';message.textContent=value?.message||(value?'Usage unavailable':'Loading…');section.append(message);}
      content.append(section);
    }
    refreshButton.disabled=detailsPending;refreshButton.textContent=detailsPending?'Refreshing…':'Refresh';
  }
  async function refreshDetails(){
    if(detailsPending)return;detailsPending=true;drawDetails();
    try{const result=await api('/api/account-usage?providers=codex,claude');for(const value of result.providers)data.set(value.provider,value);}
    catch{for(const provider of ['codex','claude'])if(!data.has(provider))data.set(provider,{available:false,message:'Could not load usage. Try refreshing.'});}
    finally{detailsPending=false;drawDetails();draw();}
  }
  function draw(){
    panel.hidden=!enabled||!active.length;panel.replaceChildren();if(panel.hidden)return;
    for(const provider of active){
      const value=data.get(provider),button=document.createElement('button');button.type='button';button.className='compact-usage-line';button.onclick=()=>trigger.click();
      const label=document.createElement('span');label.textContent=provider==='codex'?'Codex':'Claude';
      const quota=document.createElement('span');
      const {windows,tightest}=miniQuota(value);
      const shown=windowMode==='auto'?(tightest?[tightest]:[]):windows.filter(window=>windowMode==='both'||window.label===windowMode);
      const displayWindow=label=>`${label} ${windows.find(window=>window.label===label)?.remaining??'—'}${windows.some(window=>window.label===label)?'%':''}`;
      quota.textContent=windowMode==='both'?`${displayWindow('5h')} · ${displayWindow('7d')}`:shown.length?`${shown[0].remaining}% · ${shown[0].label}`:windowMode==='auto'?'—':`${windowMode} —`;
      const details=windows.map(window=>`${window.label}: ${window.remaining}% remaining${window.resetsAt?`; resets ${new Date(window.resetsAt).toLocaleString()}`:''}`);
      button.title=[label.textContent,...(details.length?details:[value?.message||(!value?'Loading account usage':'Limit unavailable or expired')]),...(value?.stale?['Last known quota; refresh unavailable']:[]),'Open usage details'].join('\n');
      button.setAttribute('aria-label',`${label.textContent}: ${details.join('; ')||'Quota unavailable'}. Open usage details`);
      button.classList.toggle('near-limit',shown.some(window=>window.used>=90));
      button.append(label,quota);panel.append(button);
    }
  }
  async function refresh(){if(!enabled||!active.length||pending||document.hidden)return;pending=true;const stamp=generation;
    try{const result=await api(`/api/account-usage?providers=${active.join(',')}`);if(stamp===generation){data=new Map(result.providers.map(value=>[value.provider,value]));draw();}}
    catch{if(stamp===generation){for(const provider of active)if(!data.has(provider))data.set(provider,{available:false});draw();}}
    finally{pending=false;if(stamp!==generation)void refresh();}
  }
  setting.onchange=()=>{enabled=setting.checked;generation++;try{localStorage.setItem('ai-web.show-usage',String(enabled));}catch{}draw();void refresh();};
  setInterval(()=>{draw();void refresh();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  draw();void refresh();
  return {setAgents(){draw();}};
}
