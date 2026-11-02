import './command-palette.css';
import {fuzzy} from './fuzzy.ts';
export interface PaletteCommand {id:string;group:string;title:string;keywords?:string;shortcut?:string[];enabled?:()=>boolean;run:()=>void|Promise<void>}
interface Row {command:PaletteCommand;head?:string;hits:number[]}
const GROUP_ORDER=['Session','Pane','View','Workspace','App'];
const RECENT_KEY='ai-web.palette-recent';
function readRecent():string[]{try{const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.filter(item=>typeof item==='string'):[];}catch{return [];}}
export function createCommandPalette({getCommands}:{getCommands:()=>PaletteCommand[]}){
  const root=document.createElement('div');root.id='command-palette';root.hidden=true;
  root.innerHTML='<div class="palette-panel" role="dialog" aria-modal="true" aria-label="Command palette"><input class="palette-input" type="text" placeholder="Type a command…" aria-label="Command" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palette-list"><div class="palette-list" id="palette-list" role="listbox"></div></div>';
  document.body.append(root);
  const input=root.querySelector<HTMLInputElement>('.palette-input')!,list=root.querySelector<HTMLElement>('.palette-list')!;
  let rows:Row[]=[],at=0,returnFocus:HTMLElement|null=null,recent=readRecent();
  function build():Row[]{
    const all=getCommands().filter(command=>command.enabled?.()!==false);const query=input.value.trim().toLowerCase();
    if(!query){
      const latest=recent.map(id=>all.find(command=>command.id===id)).filter((command):command is PaletteCommand=>Boolean(command)).slice(0,5);
      const groups=[...GROUP_ORDER,...new Set(all.map(command=>command.group).filter(group=>!GROUP_ORDER.includes(group)))];
      const rest=groups.flatMap(group=>all.filter(command=>command.group===group&&!latest.includes(command)).map(command=>({command,head:group,hits:[] as number[]})));
      const ordered=[...latest.map(command=>({command,head:'Recent',hits:[] as number[]})),...rest];
      return ordered.map((row,index)=>({...row,head:ordered[index-1]?.head===row.head?undefined:row.head}));
    }
    const rank=(command:PaletteCommand)=>{const index=recent.indexOf(command.id);return index<0?99:index;};
    return all.map(command=>{const title=fuzzy(query,command.title),more=fuzzy(query,`${command.group} ${command.title} ${command.keywords||''}`),best=title||(more&&{score:more.score-4,hits:[] as number[]});return best&&{command,score:best.score,hits:best.hits};})
      .filter((item):item is {command:PaletteCommand;score:number;hits:number[]}=>Boolean(item)).sort((a,b)=>b.score-a.score||rank(a.command)-rank(b.command)).map(item=>({command:item.command,hits:item.hits}));
  }
  function titleNode(row:Row){
    const node=document.createElement('span');node.className='palette-title';const hits=new Set(row.hits);
    [...row.command.title].forEach((char,index)=>{if(hits.has(index)){const mark=document.createElement('b');mark.textContent=char;node.append(mark);}else node.append(char);});return node;
  }
  function render(){
    rows=build();at=Math.min(at,Math.max(0,rows.length-1));list.replaceChildren();
    if(!rows.length){const empty=document.createElement('p');empty.className='palette-empty';empty.textContent='No matching command';list.append(empty);input.removeAttribute('aria-activedescendant');return;}
    rows.forEach((row,index)=>{
      if(row.head){const head=document.createElement('div');head.className='palette-group';head.setAttribute('role','presentation');head.textContent=row.head;list.append(head);}
      const item=document.createElement('div');item.className='palette-row';item.id=`palette-row-${index}`;item.setAttribute('role','option');item.setAttribute('aria-selected',String(index===at));item.append(titleNode(row));
      if(row.command.shortcut?.length){const keys=document.createElement('span');keys.className='palette-keys';const parts=row.command.shortcut.slice(-3);parts.forEach((key,position)=>{const kbd=document.createElement('kbd');kbd.textContent=key;kbd.style.gridColumn=String(3-parts.length+position+1);keys.append(kbd);});item.append(keys);}
      item.onmousemove=()=>{if(at!==index){at=index;mark();}};item.onclick=()=>void run(row.command);list.append(item);
    });
    mark();
  }
  function mark(){
    list.querySelectorAll('.palette-row').forEach((node,index)=>node.setAttribute('aria-selected',String(index===at)));
    const active=list.querySelector<HTMLElement>(`#palette-row-${at}`);if(active){input.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});}
  }
  function close(){if(root.hidden)return;root.hidden=true;const target=returnFocus;returnFocus=null;if(target?.isConnected)target.focus();}
  async function run(command:PaletteCommand){
    recent=[command.id,...recent.filter(id=>id!==command.id)].slice(0,20);try{localStorage.setItem(RECENT_KEY,JSON.stringify(recent));}catch{}
    close();await command.run();
  }
  function open(query=''){
    if(!root.hidden)return;returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    input.value=query;at=0;root.hidden=false;render();input.focus();
  }
  input.addEventListener('input',()=>{at=0;render();});
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(rows.length){at=(at+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;mark();}}
    else if(event.key==='Enter'&&!event.isComposing){event.preventDefault();const row=rows[at];if(row)void run(row.command);}
  });
  root.addEventListener('pointerdown',event=>{if(event.target===root)close();});
  return {open,close,toggle(){if(root.hidden)open();else close();},get isOpen(){return !root.hidden;}};
}
