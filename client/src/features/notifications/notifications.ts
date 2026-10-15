import type { AgentSnapshot } from '../../../../shared/contracts.ts';
import {createSystemNotifications,isNotificationWindowFocused} from './system-notifications.ts';
import {createNotificationSoundPlayer,readNotificationSoundMode,type NotificationSoundMode} from './notification-sound.ts';
import type { NativeIcon } from '../../components/contracts.ts';
export interface NotificationPreferences { popup: boolean; soundMode: NotificationSoundMode; focused: boolean; system: boolean }
export interface NotificationOptions { icon: NativeIcon; isViewing: (agent: AgentSnapshot)=>boolean; onOpen: (agent: AgentSnapshot)=>void }
export type NotificationsController = ReturnType<typeof createNotifications>;
type NoticeKind='done'|'blocked'|'error';
export function createNotifications({icon,isViewing,onOpen}: NotificationOptions){
 let preferences: NotificationPreferences={popup:true,soundMode:'app',focused:false,system:true};try{const raw: unknown=JSON.parse(localStorage.getItem('ai-web.notifications')||'{}');if(raw&&typeof raw==='object'){const stored=raw as Record<string,unknown>;preferences.soundMode=readNotificationSoundMode(stored);for(const key of ['popup','focused','system'] as const)if(typeof stored[key]==='boolean')preferences[key]=stored[key];}}catch{}
 const states=new Map<string,string>(),cards=new Map<string,{dismiss: ()=>void}>();const soundPlayer=createNotificationSoundPlayer();
 const nativeNotices=new Map<string,AgentSnapshot>();const system=createSystemNotifications(id=>{const agent=nativeNotices.get(id);if(agent){nativeNotices.delete(id);cards.get(id)?.dismiss();document.querySelector<HTMLDialogElement>('#settings-dialog')?.close();onOpen(agent);}});
 const actionNotices=new Set<string>(),resumeTimers=new Map<string,ReturnType<typeof setTimeout>>();
 const stack=document.createElement('aside');stack.id='agent-notifications';stack.setAttribute('aria-label','Agent notifications');document.body.append(stack);
 function persist(){try{localStorage.setItem('ai-web.notifications',JSON.stringify({...preferences,sound:preferences.soundMode!=='off'}));}catch{}}
 const settings=document.createElement('div');settings.innerHTML='<div class="setting-row"><div><strong>Popup notifications</strong><small>Show completion, input requests and errors inside Pane</small></div><input type="checkbox" aria-label="Popup notifications"></div><div class="setting-row"><div><strong>Notification sound</strong><small>App sound uses different tones for completion and action requests</small></div><select aria-label="Notification sounds"><option value="app">App sound</option><option value="system">Windows default</option><option value="off">Off</option></select></div>';
 const popupControl=settings.querySelector('input')!;popupControl.checked=preferences.popup;popupControl.onchange=()=>{preferences.popup=popupControl.checked;persist();if(!preferences.popup)for(const entry of cards.values())entry.dismiss();};
 const soundControl=settings.querySelector('select')!;soundControl.value=preferences.soundMode;soundControl.onchange=()=>{preferences.soundMode=soundControl.value as NotificationSoundMode;soundPlayer.stop();persist();};
 document.querySelector<HTMLElement>('.settings-footnote')!.before(settings);settings.id='notification-settings';
 const systemRow=document.createElement('div');systemRow.className='setting-row';systemRow.innerHTML='<div><strong>System notifications</strong><small></small></div><input type="checkbox" aria-label="System notifications">';settings.append(systemRow);
 systemRow.querySelector('small')!.textContent='Send app notifications when Pane is in the background. Click one to return to its session.';
 const systemControl=systemRow.querySelector('input')!;systemControl.checked=preferences.system;systemControl.onchange=()=>{preferences.system=systemControl.checked;persist();};
 const testRow=document.createElement('div');testRow.className='setting-row';testRow.innerHTML='<div><strong>Try a system notification</strong><small id="notification-test-feedback" role="status">Send a system notification, even while Pane is focused</small></div><button type="button" id="test-notification" class="secondary-button">Test notification</button>';settings.append(testRow);const feedback=testRow.querySelector<HTMLElement>('small')!,testButton=testRow.querySelector<HTMLButtonElement>('button')!;
 testButton.onclick=async()=>{
  testButton.disabled=true;feedback.textContent='Sending system notification…';
  try{const result=await system.send({id:'pane-notification-test',title:'Pane · Test notification',body:'App notifications are working. Click here to return to Pane.',silent:preferences.soundMode!=='system',allowFocused:true});const played=result.status==='sent'&&preferences.soundMode==='app'?await soundPlayer.play('done'):true;feedback.textContent=result.status==='sent'&&!played?'Notification sent, but the app sound could not play. Check your audio output.':result.status==='sent'?'System notification sent. If no banner appears, check your system’s notification and Do Not Disturb settings.':result.message||'The notification was suppressed by the system.';}finally{testButton.disabled=false;}
 };
 document.querySelector<HTMLDialogElement>('#settings-dialog')!.addEventListener('close',()=>document.body.append(stack));
 const focusedRow=document.createElement('div');focusedRow.className='setting-row';focusedRow.innerHTML='<div><strong>Notify while focused</strong><small>Also notify when Pane is focused or you are viewing the active session</small></div><input type="checkbox" aria-label="Notify while focused">';settings.append(focusedRow);
 const focusedControl=focusedRow.querySelector<HTMLInputElement>('input')!;focusedControl.checked=Boolean(preferences.focused);focusedControl.onchange=()=>{preferences.focused=focusedControl.checked;persist();};
 function key(agent: AgentSnapshot){return String(agent.agent_session?.value || agent.saved_session_id || agent.id || agent.pane_id);}
 function observe(agent: AgentSnapshot | null | undefined){if(!agent||agent.archived)return;const id=key(agent),state=agent.terminalSession&&agent.completed?'done':agent.agent_status||agent.status||'unknown';if(!['working','idle','done','blocked','error','failed'].includes(state))return;const previous=states.get(id);states.set(id,state);if(state==='working'){if(!resumeTimers.has(id))resumeTimers.set(id,setTimeout(()=>{resumeTimers.delete(id);if(states.get(id)==='working')actionNotices.delete(id);},1200));}else{clearTimeout(resumeTimers.get(id));resumeTimers.delete(id);}if(state==='done')actionNotices.delete(id);if(previous===state || previous===undefined&&state!=='blocked')return;const kind: NoticeKind | null=state==='blocked'?'blocked':['error','failed'].includes(state)?'error':(agent.terminalSession?state==='done':previous==='working'&&['idle','done'].includes(state))?'done':null;if(!kind)return;if(kind==='blocked'){if(actionNotices.has(id))return;actionNotices.add(id);}if(isNotificationWindowFocused()&&isViewing(agent)&&!preferences.focused)return;showNotice(agent,kind);
 }
 function showNotice(agent:AgentSnapshot,kind:NoticeKind){
  const id=key(agent),provider=agent.agent?agent.agent.charAt(0).toUpperCase()+agent.agent.slice(1):'Agent';
  const title=kind==='blocked'?provider+' needs your action':kind==='done'?provider+' work completed':provider+' encountered an error';
  if(preferences.system&&(preferences.focused||!isNotificationWindowFocused())){
   if(nativeNotices.size>=64)nativeNotices.delete(nativeNotices.keys().next().value!);nativeNotices.set(id,agent);
   void system.send({id,title,body:agent.name||provider,silent:preferences.soundMode!=='system',allowFocused:preferences.focused}).then(result=>{if(result.status!=='sent'&&result.status!=='suppressed')feedback.textContent=result.message||'System notification unavailable.';});
  }
  if(preferences.soundMode==='app')void soundPlayer.play(kind).then(played=>{if(!played)feedback.textContent='The app notification sound could not play. Check your audio output.';});
  if(!preferences.popup)return;
  const dialog=document.querySelector<HTMLDialogElement>('#settings-dialog')!;(dialog.open?dialog:document.body).append(stack);
  cards.get(id)?.dismiss();if(cards.size>=3)cards.values().next().value?.dismiss();
  const card=document.createElement('section');card.className='agent-notification';card.dataset.kind=kind;
  const open=document.createElement('button');open.className='notification-open';const mark=document.createElement('span');mark.className='notification-mark';
  if(['codex','claude','opencode'].includes(agent.agent)){const image=document.createElement('img');image.src=`/agents/${agent.agent}.svg`;image.alt='';mark.append(image);}else mark.append(icon('monitor'));
  const copy=document.createElement('span'),heading=document.createElement('strong');heading.textContent=title;copy.append(heading);open.append(mark,copy);open.setAttribute('aria-label',`Open session: ${title}`);
  const close=document.createElement('button');close.className='notification-dismiss';close.setAttribute('aria-label','Dismiss notification');close.append(icon('close'));card.append(open,close);
  let timer:ReturnType<typeof setTimeout>|undefined;const dismiss=()=>{clearTimeout(timer);card.remove();cards.delete(id);};cards.set(id,{dismiss});close.onclick=dismiss;open.onclick=()=>{dismiss();dialog.close();onOpen(agent);};stack.append(card);card.setAttribute('role','status');
  const schedule=()=>{clearTimeout(timer);if(kind!=='blocked')timer=setTimeout(dismiss,8000);};card.onmouseenter=()=>clearTimeout(timer);card.onmouseleave=schedule;card.addEventListener('focusin',()=>clearTimeout(timer));card.addEventListener('focusout',()=>{if(!card.contains(document.activeElement))schedule();});schedule();
 }

 return {observe,remove(value: unknown){const id=String(value);states.delete(id);nativeNotices.delete(id);actionNotices.delete(id);clearTimeout(resumeTimers.get(id));resumeTimers.delete(id);cards.get(id)?.dismiss();}};
}
