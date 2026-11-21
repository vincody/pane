/** Settings for native chat: whether Claude sessions open as chat, and how large its text is. */
import {readClaudeMode,saveClaudeMode} from '../terminal/terminal-mode.ts';

export const MIN_CHAT_FONT_SIZE=11,MAX_CHAT_FONT_SIZE=20,DEFAULT_CHAT_FONT_SIZE=13;
const KEY='ai-web.chat-font-size';
const clamp=(value:number)=>Math.min(MAX_CHAT_FONT_SIZE,Math.max(MIN_CHAT_FONT_SIZE,Math.round(value)||DEFAULT_CHAT_FONT_SIZE));
export const readChatFontSize=()=>{try{return clamp(Number(localStorage.getItem(KEY)??DEFAULT_CHAT_FONT_SIZE));}catch{return DEFAULT_CHAT_FONT_SIZE;}};
export function applyChatFontSize(size:number){document.documentElement.style.setProperty('--chat-zoom',String(clamp(size)/DEFAULT_CHAT_FONT_SIZE));}
export function saveChatFontSize(size:number){const next=clamp(size);try{localStorage.setItem(KEY,String(next));}catch{/* Applies for this window only. */}applyChatFontSize(next);document.dispatchEvent(new CustomEvent('chat-font-size',{detail:next}));return next;}

export type DockPosition='bottom'|'right';
const POSITION_KEY='ai-web.terminal-dock-position';
export const readDockPosition=():DockPosition=>{try{return localStorage.getItem(POSITION_KEY)==='right'?'right':'bottom';}catch{return 'bottom';}};
export function saveDockPosition(position:DockPosition){try{localStorage.setItem(POSITION_KEY,position);}catch{/* Applies for this window only. */}document.dispatchEvent(new CustomEvent('dock-position',{detail:position}));}

export function setupChatSettings(){
 applyChatFontSize(readChatFontSize());
 const footnote=document.querySelector<HTMLElement>('.settings-footnote');
 if(footnote){
  const native=document.createElement('div');native.className='setting-row';
  native.innerHTML='<div><strong>Native chat</strong><small>On: Claude sessions open as a chat view in place of the terminal. Off: they run the Claude CLI in a terminal tab. Applies to sessions you start next.</small></div><input type="checkbox" aria-label="Use native chat">';
  const toggle=native.querySelector<HTMLInputElement>('input')!;toggle.checked=readClaudeMode()==='chat';toggle.onchange=()=>saveClaudeMode(toggle.checked?'chat':'terminal');
  const size=document.createElement('div');size.className='setting-row';
  size.innerHTML=`<div><strong>Chat text size</strong><small>Size of chat text in pixels, ${MIN_CHAT_FONT_SIZE} to ${MAX_CHAT_FONT_SIZE}. Ctrl + plus, minus or 0 inside a chat also changes it.</small></div><input type="number" min="${MIN_CHAT_FONT_SIZE}" max="${MAX_CHAT_FONT_SIZE}" step="1" inputmode="numeric" aria-label="Chat text size">`;
  const input=size.querySelector<HTMLInputElement>('input')!;input.value=String(readChatFontSize());
  input.onchange=()=>{input.value=String(saveChatFontSize(Number(input.value)));};
  document.addEventListener('chat-font-size',event=>{input.value=String((event as CustomEvent<number>).detail);});
  const place=document.createElement('div');place.className='setting-row';
  place.innerHTML='<div><strong>Terminal dock position</strong><small>Below the chat gives the terminal the full width; on the right keeps it beside the chat.</small></div><select aria-label="Terminal dock position"><option value="bottom">Bottom</option><option value="right">Right</option></select>';
  const pick=place.querySelector<HTMLSelectElement>('select')!;pick.value=readDockPosition();pick.onchange=()=>saveDockPosition(pick.value as DockPosition);
  footnote.before(native,size,place);
 }
 // Ctrl/Cmd + plus, minus or 0 while focus is inside a chat.
 document.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.altKey||!(event.target instanceof Element)||!event.target.closest('.chat-pane'))return;
  const step=event.key==='+'||event.key==='='?1:event.key==='-'||event.key==='_'?-1:event.key==='0'?0:null;
  if(step===null)return;
  event.preventDefault();saveChatFontSize(step===0?DEFAULT_CHAT_FONT_SIZE:readChatFontSize()+step);
 },true);
}
