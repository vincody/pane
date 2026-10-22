import {agentLabel} from '../../../../shared/agent-label.ts';
import type { AgentSnapshot } from '../../../../shared/contracts.ts';
import {createSystemNotifications,isNotificationWindowFocused} from './system-notifications.ts';
import {createNotificationSoundPlayer,readNotificationSoundAll,readNotificationSoundChoices,readNotificationSoundMode,readNotificationSoundScope,soundForKind,readNotificationVolume,NOTIFICATION_SOUNDS,NO_SOUND,DEFAULT_SOUND_CHOICES,DEFAULT_SOUND_VOLUME,type NotificationSoundChoices,type NotificationSoundKind,type NotificationSoundMode,type NotificationSoundScope} from './notification-sound.ts';
import type { NativeIcon } from '../../components/contracts.ts';
import {formatWorked} from './notification-duration.ts';
import {notificationTitle} from './notification-title.ts';
export interface NotificationPreferences { popup: boolean; soundMode: NotificationSoundMode; sounds: NotificationSoundChoices; soundScope: NotificationSoundScope; soundAll: string; volume: number; soundFocused: boolean; focused: boolean; system: boolean }
export interface NotificationOptions { icon: NativeIcon; isViewing: (agent: AgentSnapshot)=>boolean; onOpen: (agent: AgentSnapshot)=>void }
export type NotificationsController = ReturnType<typeof createNotifications>;
type NoticeKind='done'|'blocked'|'error';
export function createNotifications({icon,isViewing,onOpen}: NotificationOptions){
 let preferences: NotificationPreferences={popup:true,soundMode:'app',sounds:{...DEFAULT_SOUND_CHOICES},soundScope:'each',soundAll:DEFAULT_SOUND_CHOICES.done,volume:DEFAULT_SOUND_VOLUME,soundFocused:true,focused:false,system:true};try{const raw: unknown=JSON.parse(localStorage.getItem('ai-web.notifications')||'{}');if(raw&&typeof raw==='object'){const stored=raw as Record<string,unknown>;preferences.soundMode=readNotificationSoundMode(stored);preferences.sounds=readNotificationSoundChoices(stored);preferences.soundScope=readNotificationSoundScope(stored);preferences.soundAll=readNotificationSoundAll(stored);preferences.volume=readNotificationVolume(stored);for(const key of ['popup','focused','system','soundFocused'] as const)if(typeof stored[key]==='boolean')preferences[key]=stored[key];}}catch{}
 const states=new Map<string,string>(),started=new Map<string,number>(),cards=new Map<string,{dismiss: ()=>void}>();const soundPlayer=createNotificationSoundPlayer();
 const nativeNotices=new Map<string,AgentSnapshot>();const system=createSystemNotifications(id=>{const agent=nativeNotices.get(id);if(agent){nativeNotices.delete(id);cards.get(id)?.dismiss();document.querySelector<HTMLDialogElement>('#settings-dialog')?.close();onOpen(agent);}});
 const actionNotices=new Set<string>(),resumeTimers=new Map<string,ReturnType<typeof setTimeout>>();
 const stack=document.createElement('aside');stack.id='agent-notifications';stack.setAttribute('aria-label','Agent notifications');document.body.append(stack);
 function persist(){try{localStorage.setItem('ai-web.notifications',JSON.stringify({...preferences,sound:preferences.soundMode!=='off'}));}catch{}}
 const settings=document.createElement('div');settings.innerHTML='<div class="setting-row"><div><strong>Popup notifications</strong><small>Show completion, input requests and errors inside Pane while it is focused</small></div><input type="checkbox" aria-label="Popup notifications"></div><div class="setting-row"><div><strong>Notification sound</strong><small>App sound uses different tones for completion and action requests</small></div><select aria-label="Notification sounds"><option value="app">App sound</option><option value="system">Windows default</option><option value="off">Off</option></select></div>';
 const popupControl=settings.querySelector('input')!;popupControl.checked=preferences.popup;popupControl.onchange=()=>{preferences.popup=popupControl.checked;persist();if(!preferences.popup)for(const entry of cards.values())entry.dismiss();};
 const soundControl=settings.querySelector('select')!;soundControl.value=preferences.soundMode;const soundRow=soundControl.closest('.setting-row')!;
 const soundOptions=NOTIFICATION_SOUNDS.map(sound=>`<option value="${sound.id}">${sound.name}</option>`).join('')+`<option value="${NO_SOUND}">Silent</option>`;
 const soundDetails: HTMLElement[]=[];
 const volumeRow=document.createElement('div');volumeRow.className='setting-row';volumeRow.innerHTML='<div><strong>Volume</strong><small>Applies to the app sounds below</small></div><div class="sound-picker"><input type="range" min="0" max="100" step="5" aria-label="Notification volume"><output></output></div>';
 const volumeControl=volumeRow.querySelector('input')!,volumeOutput=volumeRow.querySelector('output')!;volumeControl.value=String(preferences.volume);volumeOutput.textContent=preferences.volume+'%';
 let previewTimer:ReturnType<typeof setTimeout>|undefined;
 volumeControl.oninput=()=>{preferences.volume=Number(volumeControl.value);volumeOutput.textContent=preferences.volume+'%';persist();clearTimeout(previewTimer);previewTimer=setTimeout(()=>void soundPlayer.play(soundForKind(preferences,'done'),preferences.volume),250);};
 soundDetails.push(volumeRow);
 const scopeRow=document.createElement('div');scopeRow.className='setting-row';scopeRow.innerHTML='<div><strong>Sound choice</strong><small>Use one sound for every notification, or choose a sound for each status</small></div><select aria-label="Sound choice"><option value="all">Same sound for all</option><option value="each">Different sound for each status</option></select>';
 const scopeControl=scopeRow.querySelector('select')!;scopeControl.value=preferences.soundScope;soundDetails.push(scopeRow);
 const allRow=document.createElement('div');allRow.className='setting-row';allRow.innerHTML=`<div><strong>Sound for all notifications</strong><small>Played for completion, input requests and errors</small></div><div class="sound-picker"><select aria-label="Sound for all notifications">${soundOptions}</select><button type="button" class="secondary-button" aria-label="Preview sound for all notifications">Preview</button></div>`;
 const allSelect=allRow.querySelector('select')!,allPreview=allRow.querySelector('button')!;allSelect.value=preferences.soundAll;
 allSelect.onchange=()=>{preferences.soundAll=allSelect.value;persist();void soundPlayer.play(allSelect.value,preferences.volume);};allPreview.onclick=()=>void soundPlayer.play(preferences.soundAll,preferences.volume);soundDetails.push(allRow);
 const kindRows: HTMLElement[]=[];
 const kindCopy: Record<NotificationSoundKind,[string,string]>={done:['Completion sound','Played when an agent finishes its work'],blocked:['Input request sound','Played when an agent needs your action'],error:['Error sound','Played when an agent hits an error']};
 for(const kind of ['done','blocked','error'] as const){
  const row=document.createElement('div');row.className='setting-row';row.innerHTML=`<div><strong></strong><small></small></div><div class="sound-picker"><select>${soundOptions}</select><button type="button" class="secondary-button">Preview</button></div>`;
  row.querySelector('strong')!.textContent=kindCopy[kind][0];row.querySelector('small')!.textContent=kindCopy[kind][1];
  const select=row.querySelector('select')!,preview=row.querySelector('button')!;select.setAttribute('aria-label',kindCopy[kind][0]);preview.setAttribute('aria-label','Preview '+kindCopy[kind][0].toLowerCase());select.value=preferences.sounds[kind];
  select.onchange=()=>{preferences.sounds[kind]=select.value;persist();void soundPlayer.play(select.value,preferences.volume);};preview.onclick=()=>void soundPlayer.play(preferences.sounds[kind],preferences.volume);
  soundDetails.push(row);kindRows.push(row);
 }
 const soundFocusedRow=document.createElement('div');soundFocusedRow.className='setting-row';soundFocusedRow.innerHTML='<div><strong>Sound while focused</strong><small>Turn off to hear notification sounds only when Pane is in the background</small></div><input type="checkbox" aria-label="Sound while focused">';
 const soundFocusedControl=soundFocusedRow.querySelector('input')!;soundFocusedControl.checked=preferences.soundFocused;soundFocusedControl.onchange=()=>{preferences.soundFocused=soundFocusedControl.checked;persist();};soundDetails.push(soundFocusedRow);
 soundRow.after(...soundDetails);
 const syncSoundRows=()=>{for(const row of soundDetails)row.hidden=preferences.soundMode!=='app';if(preferences.soundMode==='app'){allRow.hidden=preferences.soundScope!=='all';for(const row of kindRows)row.hidden=preferences.soundScope!=='each';}};syncSoundRows();
 scopeControl.onchange=()=>{preferences.soundScope=scopeControl.value as NotificationSoundScope;persist();syncSoundRows();};
 soundControl.onchange=()=>{preferences.soundMode=soundControl.value as NotificationSoundMode;soundPlayer.stop();persist();syncSoundRows();};
 document.querySelector<HTMLElement>('.settings-footnote')!.before(settings);settings.id='notification-settings';
 const systemRow=document.createElement('div');systemRow.className='setting-row';systemRow.innerHTML='<div><strong>System notifications</strong><small></small></div><input type="checkbox" aria-label="System notifications">';settings.append(systemRow);
 systemRow.querySelector('small')!.textContent='Send app notifications when Pane is in the background. Click one to return to its session.';
 const systemControl=systemRow.querySelector('input')!;systemControl.checked=preferences.system;systemControl.onchange=()=>{preferences.system=systemControl.checked;persist();};
 const testRow=document.createElement('div');testRow.className='setting-row';testRow.innerHTML='<div><strong>Try a system notification</strong><small id="notification-test-feedback" role="status">Send a system notification, even while Pane is focused</small></div><button type="button" id="test-notification" class="secondary-button">Test notification</button>';settings.append(testRow);const feedback=testRow.querySelector<HTMLElement>('small')!,testButton=testRow.querySelector<HTMLButtonElement>('button')!;
 testButton.onclick=async()=>{
  testButton.disabled=true;feedback.textContent='Sending system notification…';
  try{const result=await system.send({id:'pane-notification-test',title:'Pane · Test notification',body:'App notifications are working. Click here to return to Pane.',silent:preferences.soundMode!=='system',allowFocused:true});const played=result.status==='sent'&&preferences.soundMode==='app'?await soundPlayer.play(soundForKind(preferences,'done'),preferences.volume):true;feedback.textContent=result.status==='sent'&&!played?'Notification sent, but the app sound could not play. Check your audio output.':result.status==='sent'?'System notification sent. If no banner appears, check your system’s notification and Do Not Disturb settings.':result.message||'The notification was suppressed by the system.';}finally{testButton.disabled=false;}
 };
 const popupTestRow=document.createElement('div');popupTestRow.className='setting-row';popupTestRow.innerHTML='<div><strong>Try a popup notification</strong><small id="popup-test-feedback" role="status">Show a sample popup inside Pane. Each click shows the next status.</small></div><button type="button" id="test-popup-notification" class="secondary-button">Test popup</button>';settings.append(popupTestRow);
 const popupFeedback=popupTestRow.querySelector<HTMLElement>('small')!,popupTestKinds: NoticeKind[]=['done','blocked','error'];let popupTestIndex=0;
 popupTestRow.querySelector<HTMLButtonElement>('button')!.onclick=()=>{
  if(!preferences.popup){popupFeedback.textContent='Popup notifications are turned off. Turn them on to see the popup.';return;}
  const kind=popupTestKinds[popupTestIndex++%popupTestKinds.length];popupFeedback.textContent=`Showing the “${kind==='done'?'finished':kind==='blocked'?'needs your action':'error'}” popup. Click again for the next status.`;
  showNotice({id:'pane-popup-test',agent:'claude',name:'Test notification'},kind,7400,true);
 };
 document.querySelector<HTMLDialogElement>('#settings-dialog')!.addEventListener('close',()=>document.body.append(stack));
 const focusedRow=document.createElement('div');focusedRow.className='setting-row';focusedRow.innerHTML='<div><strong>Notify while focused</strong><small>Also show the in-app notice when you are viewing the active session</small></div><input type="checkbox" aria-label="Notify while focused">';settings.append(focusedRow);
 const focusedControl=focusedRow.querySelector<HTMLInputElement>('input')!;focusedControl.checked=Boolean(preferences.focused);focusedControl.onchange=()=>{preferences.focused=focusedControl.checked;persist();};
 function key(agent: AgentSnapshot){return String(agent.agent_session?.value || agent.saved_session_id || agent.id || agent.pane_id);}
 function observe(agent: AgentSnapshot | null | undefined){if(!agent||agent.archived)return;const id=key(agent),state=agent.terminalSession&&agent.completed?'done':agent.agent_status||agent.status||'unknown';if(!['working','idle','done','blocked','error','failed'].includes(state))return;const previous=states.get(id);states.set(id,state);if(state==='working'){if(previous!=='working')started.set(id,Date.now());if(!resumeTimers.has(id))resumeTimers.set(id,setTimeout(()=>{resumeTimers.delete(id);if(states.get(id)==='working')actionNotices.delete(id);},1200));}else{clearTimeout(resumeTimers.get(id));resumeTimers.delete(id);}if(state==='done')actionNotices.delete(id);if(previous===state || previous===undefined&&state!=='blocked')return;const kind: NoticeKind | null=state==='blocked'?'blocked':['error','failed'].includes(state)?'error':(agent.terminalSession?state==='done':previous==='working'&&['idle','done'].includes(state))?'done':null;if(!kind)return;const worked=kind==='done'?workedMs(agent,id):undefined;if(kind==='blocked'){if(actionNotices.has(id))return;actionNotices.add(id);}if(isNotificationWindowFocused()&&isViewing(agent)&&!preferences.focused)return;showNotice(agent,kind,worked);
 }
 /** Own clock from the moment Pane saw the agent start working; the session's start time covers an app opened mid-turn. */
 function workedMs(agent:AgentSnapshot,id:string){const own=started.get(id);started.delete(id);if(own!==undefined)return Date.now()-own;const begin=Date.parse(agent.externalStartedAt||'');return Number.isFinite(begin)?Date.now()-begin:undefined;}
 function showNotice(agent:AgentSnapshot,kind:NoticeKind,worked?:number,sample=false){
  const id=key(agent),provider=agent.agent?agentLabel(agent.agent):'Agent',detail=notificationTitle(agent);
  const status=kind==='blocked'?'needs your action':kind==='done'?'finished':'hit an error',duration=kind==='done'?formatWorked(worked):'';
  const summary=status+(duration?' · worked for '+duration:''),title=provider+' '+summary;
  // Focused: show the notice inside Pane. In the background: use the system notification, and fall back to the in-app notice only if it could not be sent.
  const background=!sample&&!isNotificationWindowFocused();
  if(preferences.system&&background){
   if(nativeNotices.size>=64)nativeNotices.delete(nativeNotices.keys().next().value!);nativeNotices.set(id,agent);
   void system.send({id,title,body:detail,silent:preferences.soundMode!=='system',allowFocused:false}).then(result=>{if(result.status==='sent')return;nativeNotices.delete(id);if(result.status!=='suppressed')feedback.textContent=result.message||'System notification unavailable.';if(preferences.popup)showCard();});
  }
  if(preferences.soundMode==='app'&&(preferences.soundFocused||background))void soundPlayer.play(soundForKind(preferences,kind),preferences.volume).then(played=>{if(!played)feedback.textContent='The app notification sound could not play. Check your audio output.';});
  if(!preferences.popup||preferences.system&&background)return;
  showCard();
  function showCard(){
  const dialog=document.querySelector<HTMLDialogElement>('#settings-dialog')!;(dialog.open?dialog:document.body).append(stack);
  cards.get(id)?.dismiss();if(cards.size>=3)cards.values().next().value?.dismiss();
  const card=document.createElement('section');card.className='agent-notification';card.dataset.kind=kind;
  const open=document.createElement('button');open.className='notification-open';const mark=document.createElement('span');mark.className='notification-mark';
  if(['codex','claude','opencode','agy'].includes(agent.agent)){const image=document.createElement('img');image.src=`/agents/${agent.agent}.svg`;image.alt='';mark.append(image);}else mark.append(icon('monitor'));
  const copy=document.createElement('span'),head=document.createElement('span'),heading=document.createElement('strong'),state=document.createElement('small');head.className='notification-head';heading.textContent=provider.toLowerCase();state.textContent=summary;head.append(heading,state);copy.append(head);
  if(detail.toLowerCase()!==provider.toLowerCase()){const line=document.createElement('span');line.className='notification-detail';line.textContent=detail;copy.append(line);}open.append(mark,copy);open.setAttribute('aria-label',`Open session: ${title}`);
  const close=document.createElement('button');close.className='notification-dismiss';close.setAttribute('aria-label','Dismiss notification');close.append(icon('close'));card.append(open,close);
  let timer:ReturnType<typeof setTimeout>|undefined;const dismiss=()=>{clearTimeout(timer);card.remove();cards.delete(id);};cards.set(id,{dismiss});close.onclick=dismiss;open.onclick=()=>{dismiss();if(sample)return;dialog.close();onOpen(agent);};stack.append(card);card.setAttribute('role','status');
  const schedule=()=>{clearTimeout(timer);if(kind!=='blocked')timer=setTimeout(dismiss,8000);};card.onmouseenter=()=>clearTimeout(timer);card.onmouseleave=schedule;card.addEventListener('focusin',()=>clearTimeout(timer));card.addEventListener('focusout',()=>{if(!card.contains(document.activeElement))schedule();});schedule();
  }
 }

 return {observe,remove(value: unknown){const id=String(value);states.delete(id);started.delete(id);nativeNotices.delete(id);actionNotices.delete(id);clearTimeout(resumeTimers.get(id));resumeTimers.delete(id);cards.get(id)?.dismiss();}};
}
