import type {TerminalAgent} from '../../components/contracts.ts';
import {layoutAgents,summarize,statusLabel,zoneOf,DESK_SLOTS,type LoungeAgent,type Slot,type Bubble} from './lounge-layout.ts';

/**
 * A small, calm pixel office. Every agent has a desk with a monitor that shows what it is up to: code scrolling while it
 * works, a red screen and a "needs you" sign when it is waiting for you, OK when it has finished. Agents with nothing to
 * do get up and live a little: pour a coffee, fetch water, scroll their phone on the sofa, nap, stretch, wander, or stand
 * together and chat. A cat strolls through.
 *
 * The scene has a fixed logical size (W x H) and is scaled by a whole number so the pixels stay crisp. The same scene
 * is drawn on the sidebar canvas and, enlarged, in a dialog in the middle of the window. Everything is painted back to
 * front by its floor position, so people pass behind and in front of furniture correctly.
 */
const W=192,H=108,LANE=100,WALK=28,FRAME_MS=50,DONE_CHEER=1600;
const AGENT_COLORS:Record<string,string>={claude:'#d97757',codex:'#6b7cff',opencode:'#2fb5a4',agy:'#4a90e2',gemini:'#8e6bd8'};
/** Tiny pixel versions of each agent's logo, drawn in white straight onto the shirt (5 wide, up to 5 tall). */
const EMBLEMS:Record<string,string[]>={
 claude:['XXXXX','X.X.X','XXXXX','.X.X.'],
 codex:['X....','.X...','X.XXX'],
 opencode:['XXXXX','X...X','X...X','XXXXX'],
 agy:['.XXX.','X...X','XXXXX','X...X']
};
const SKIN='#f0c8a0',EYE='#2a2326';
const HAIRS=['#3b2f2f','#1d1b1f','#9a5a2c','#d9b45a','#6b3a1e'];
const hairOf=(id:string)=>{let hash=0;for(const letter of id)hash=(hash*31+letter.charCodeAt(0))>>>0;return HAIRS[hash%HAIRS.length];};

interface Pt {x:number;y:number}
/** A place to stand or sit. `door` leads from the spot out to the walking lane, ending on it. */
interface Spot extends Pt {kind:'desk'|'sofa'|'pantry'|'chat'|'lane';door:Pt[];sort:number}
type Item='coffee'|'water';
type Kind='drink'|'sofa'|'nap'|'rest'|'chat'|'stretch'|'wander';
interface Act {kind:Kind;spot:Spot;item?:Item;start:number;until:number;partner?:string}
interface Char {
 id:string;agent:string;name:string;status:string;project:string;x:number;y:number;
 path:Pt[];dest:Spot|null;spot:Spot|null;pending:Spot|null;act:Act|null;nextAt:number;
 leaving:boolean;arrivedAt:number;cheerUntil:number;bubble:Bubble;phase:number;moving:boolean;face:number;hair:string;up:boolean;wasDesk:boolean
}
interface View {canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;scale:number}
interface Options {host:HTMLElement}

// ---- floor plan: two rows of desks on the left, a small break corner on the right ----
const DESK_W=19;
const deskGeometry=(slot:number)=>{const row=slot%2,col=slot>>1,x0=3+col*25,top=row?72:26;return {x0,top,cx:x0+9,fy:top+19,gap:x0+22};};
const DESKS:Spot[]=Array.from({length:DESK_SLOTS},(_,slot)=>{const g=deskGeometry(slot);return {kind:'desk',x:g.cx,y:g.fy,door:[{x:g.gap,y:g.fy},{x:g.gap,y:LANE}],sort:g.top+8};});
const SOFA_SEATS:Spot[]=[138,146,154].map(x=>({kind:'sofa',x,y:81,door:[{x,y:LANE}],sort:76}));
const PANTRY:{spot:Spot;item:Item}[]=([[127,'coffee'],[144,'water']] as const).map(([x,item])=>({item,spot:{kind:'pantry',x,y:48,door:[{x:110,y:48},{x:110,y:LANE}],sort:48}}));
const CHAT:[Spot,Spot]=[{kind:'chat',x:113,y:66,door:[{x:113,y:LANE}],sort:66},{kind:'chat',x:123,y:66,door:[{x:123,y:LANE}],sort:66}];
const EXIT:Spot={kind:'lane',x:-10,y:LANE,door:[],sort:LANE};

const GLYPHS:Record<'z',string[]>={z:['111','010','111']};
const ITEM_COLOR:Record<Item,string>={coffee:'#7a4a2a',water:'#8ec9f5'};
/** A 3x5 pixel font, just enough for the monitor and the "needs you" sign. */
const FONT:Record<string,string[]>={
 N:['1001','1101','1011','1001','1001'],E:['111','100','110','100','111'],D:['110','101','101','101','110'],S:['011','100','010','001','110'],
 Y:['101','101','010','010','010'],O:['010','101','101','101','010'],U:['101','101','101','101','111'],K:['101','101','110','101','101']
};
const BANG=['00100','00100','00100','00000','00100'],CROSS=['10001','01010','00100','01010','10001'];

interface Palette {wall:string;trim:string;door:string;doorLight:string;floorA:string;floorB:string;seam:string;rug:string;rugEdge:string;desk:string;deskEdge:string;key:string;mon:string;chair:string;chairs:string[];steel:string;steelDark:string;sofa:string;sofaDark:string;dark:string;label:string;ink:string;paper:string;accent:string;success:string;warning:string;error:string;plant:string;pot:string;light:string;water:string}
const mix=(a:string,b:string,pct:number)=>`color-mix(in srgb, ${a} ${pct}%, ${b})`;
function readPalette(host:HTMLElement):Palette{
 const css=getComputedStyle(host),get=(name:string,fallback:string)=>css.getPropertyValue(name).trim()||fallback;
 const ink=get('--ink','#222'),bg=get('--sidebar','#f6f6f6'),accent=get('--accent','#2f6bff');
 return {wall:mix('#8fa3b8',bg,38),trim:mix('#5a4030',bg,75),door:mix('#8a5a3a',bg,80),doorLight:mix('#a87a52',bg,80),floorA:mix('#d9b07a',bg,50),floorB:mix('#cfa46e',bg,50),seam:mix('#9a7440',bg,42),rug:mix(accent,bg,7),rugEdge:mix(accent,bg,15),desk:mix('#ead9ae',bg,86),deskEdge:mix('#b99a63',bg,84),key:mix('#d4d8de',bg,80),mon:'#2b2f3a',chair:'#3c4252',chairs:['#3c4252','#4a5a8a','#8a3f3f','#3f6f5a','#6b5a8a','#8a6b3f','#3f6f8a','#6f3f6b'],steel:mix(ink,bg,30),steelDark:mix(ink,bg,48),sofa:mix(accent,bg,55),sofaDark:mix(accent,bg,38),dark:'#2a2f3a',label:mix(ink,bg,16),ink,paper:mix('#ffffff',bg,92),accent,success:get('--success','#2a9d55'),warning:get('--warning','#c98a00'),error:get('--error','#d33'),plant:mix('#3f9a52',bg,85),pot:mix('#b5603c',bg,85),light:mix('#ffffff',bg,70),water:mix('#6fb6ff',bg,85)};
}

const OFFICE_KEY='ai-web.office';
/** Whether the office is shown at all. Turning it off in Settings frees its canvases and stops its animation. */
export const officePreference=(()=>{
 let on=true;try{on=localStorage.getItem(OFFICE_KEY)!=='off';}catch{/* Default stays on. */}
 const listeners=new Set<()=>void>();
 return {get:()=>on,set(value:boolean){on=value;try{localStorage.setItem(OFFICE_KEY,value?'on':'off');}catch{/* Not remembered. */}for(const listener of listeners)listener();},subscribe(listener:()=>void){listeners.add(listener);}};
})();
/** Adds the toggle to the Settings dialog; call before the settings are assembled. */
export function setupOfficeSetting(){
 const row=document.createElement('div');row.className='setting-row';
 row.innerHTML='<div><strong>Show agent office</strong><small>A small pixel office in the sidebar where your agents work, chat and take breaks. Turn it off to free its memory.</small></div><input type="checkbox" aria-label="Show agent office">';
 const box=row.querySelector('input')!;box.checked=officePreference.get();box.onchange=()=>officePreference.set(box.checked);
 officePreference.subscribe(()=>{box.checked=officePreference.get();});
 document.querySelector('.settings-footnote')!.before(row);
}

const rand=(min:number,max:number)=>min+Math.random()*(max-min);
const pick=<T>(items:T[]):T=>items[Math.floor(Math.random()*items.length)];

export function createAgentLounge({host}:Options){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const make=<K extends keyof HTMLElementTagNameMap>(tag:K,className='')=>{const node=document.createElement(tag);if(className)node.className=className;return node;};

 // Sidebar panel.
 const section=make('section','agent-lounge');section.id='agent-lounge';section.hidden=true;
 const bar=make('div','lounge-bar');
 const head=make('button','lounge-head');head.type='button';head.setAttribute('aria-controls','agent-lounge-body');head.setAttribute('aria-label','Agent lounge');
 head.innerHTML='<span class="lounge-summary"></span><svg class="lounge-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>';
 const summaryNode=head.querySelector<HTMLElement>('.lounge-summary')!;
 bar.append(head);
 const body=make('div','lounge-body');body.id='agent-lounge-body';
 const canvas=make('canvas','lounge-canvas');canvas.setAttribute('role','img');
 const overflow=make('span','lounge-overflow');overflow.hidden=true;
 body.append(canvas,overflow);section.append(bar,body);host.append(section);

 // Enlarged view: built when opened and thrown away when closed, so it costs nothing while the sidebar panel is all you use.
 interface Zoom {dialog:HTMLDialogElement;canvas:HTMLCanvasElement;view:View;roster:HTMLElement;summary:HTMLElement;close:HTMLButtonElement}
 let zoomUi:Zoom|null=null;
 const zoomOpen=()=>!!zoomUi?.dialog.open;
 function buildZoom():Zoom{
  const dialog=make('dialog','lounge-dialog');dialog.setAttribute('aria-label','Agent office');
  const top=make('div','lounge-dialog-head'),title=make('strong'),summary=make('span','lounge-dialog-summary');
  title.textContent='Agent office';
  const close=make('button','lounge-dialog-close');close.type='button';close.setAttribute('aria-label','Close');close.textContent='×';
  top.append(title,summary,close);
  const stage=make('div','lounge-stage'),bigCanvas=make('canvas','lounge-canvas lounge-big');bigCanvas.setAttribute('role','img');stage.append(bigCanvas);
  const roster=make('ul','lounge-roster');
  dialog.append(top,stage,roster);document.body.append(dialog);
  return {dialog,canvas:bigCanvas,view:{canvas:bigCanvas,ctx:bigCanvas.getContext('2d')!,scale:4},roster,summary,close};
 }

 let expanded=true;try{expanded=localStorage.getItem('ai-web.lounge')!=='closed';}catch{/* A blocked store keeps the default. */}
 const small:View={canvas,ctx:canvas.getContext('2d')!,scale:2};
 let ctx=small.ctx;
 let palette=readPalette(section);
 let agents:LoungeAgent[]=[],currentProject:string|null=null;
 let slots=new Map<string,Slot>();
 const chars=new Map<string,Char>();
 const taken=new Set<Spot>();
 let raf=0,lastDraw=0;

 // ---- movement ----
 /** Waypoints from where the agent rests now, out through its door to the lane, along it, and in through the destination's door. */
 function route(char:Char,dest:Spot):Pt[]{
  const out:Pt[]=[];
  if(char.spot)out.push(...char.spot.door);else if(Math.abs(char.y-LANE)>.5)out.push({x:char.x,y:LANE});
  out.push({x:dest.door.length?dest.door[dest.door.length-1].x:dest.x,y:LANE});
  for(let i=dest.door.length-2;i>=0;i--)out.push(dest.door[i]);
  out.push({x:dest.x,y:dest.y});
  return out.filter((point,index,all)=>index===0?Math.hypot(point.x-char.x,point.y-char.y)>.4:Math.hypot(point.x-all[index-1].x,point.y-all[index-1].y)>.4);
 }
 /** Sends an agent somewhere; if it is mid-walk it first finishes the leg that reaches the lane. */
 function go(char:Char,dest:Spot){
  if(char.path.length){
   const lane=char.path.findIndex(point=>point.y===LANE);
   if(lane>=0&&lane<char.path.length-1){char.path=char.path.slice(0,lane+1);char.dest={kind:'lane',x:char.path[lane].x,y:LANE,door:[],sort:LANE};}
   char.pending=dest;return;
  }
  char.dest=dest;char.path=route(char,dest);char.pending=null;
 }
 function release(char:Char){
  const act=char.act;if(!act)return;
  taken.delete(act.spot);
  if(act.partner){const other=chars.get(act.partner);if(other?.act?.partner===char.id){taken.delete(other.act.spot);other.act=null;other.nextAt=performance.now()+rand(600,1800);}}
  char.act=null;
 }

 const idle=(char:Char)=>!char.leaving&&zoneOf(char.status)==='lounge';
 function chooseActivity(char:Char,now:number){
  const choices:Kind[]=['drink','drink','drink','sofa','sofa','nap','rest','rest','stretch','wander','wander'];
  const partners=[...chars.values()].filter(other=>other!==char&&idle(other)&&!other.act&&!other.path.length&&!other.pending&&now>=other.nextAt);
  if(partners.length&&!taken.has(CHAT[0])&&!taken.has(CHAT[1]))choices.push('chat','chat','chat');
  const kind=pick(choices);
  const start=(act:Act,who:Char)=>{who.act=act;taken.add(act.spot);go(who,act.spot);};
  if(kind==='drink'){const free=PANTRY.filter(entry=>!taken.has(entry.spot));if(free.length){const entry=pick(free);start({kind,spot:entry.spot,item:entry.item,start:0,until:0},char);return;}}
  if(kind==='sofa'||kind==='nap'){const free=SOFA_SEATS.filter(seat=>!taken.has(seat));if(free.length){start({kind,spot:pick(free),start:0,until:0},char);return;}}
  if(kind==='rest'){
   const own=slots.get(char.id),desk=own?DESKS[own.slot]:undefined;
   if(desk){
    // An agent already at its desk dozes off right there; otherwise it walks back to doze at its own desk.
    char.act={kind,spot:desk,start:0,until:0};if(char.spot!==desk)go(char,desk);return;
   }
  }
  if(kind==='chat'){
   const partner=pick(partners),[a,b]=Math.random()<.5?CHAT:[CHAT[1],CHAT[0]];
   start({kind,spot:a,start:0,until:0,partner:partner.id},char);start({kind,spot:b,start:0,until:0,partner:char.id},partner);return;
  }
  if(kind==='stretch'){start({kind,spot:char.spot||{kind:'lane',x:char.x,y:char.y,door:[],sort:char.y},start:0,until:0},char);return;}
  const spot:Spot={kind:'lane',x:rand(10,112),y:LANE,door:[],sort:LANE};
  char.act={kind:'wander',spot,start:0,until:0};go(char,spot);
 }
 const durationOf=(kind:Kind)=>kind==='drink'?rand(7000,10000):kind==='sofa'?rand(8000,13000):kind==='nap'?rand(10000,16000):kind==='rest'?rand(12000,20000):kind==='chat'?rand(8000,12000):kind==='stretch'?2600:1400;

 function advance(dt:number,now:number){
  advanceCat(dt,now);
  for(const char of [...chars.values()]){
   char.moving=false;
   if(char.path.length){
    const target=char.path[0],dx=target.x-char.x,dy=target.y-char.y,dist=Math.hypot(dx,dy),step=WALK*dt;
    char.moving=true;char.face=0;if(Math.abs(dy)>.2)char.up=dy<0;
    if(dist<=step){char.x=target.x;char.y=target.y;char.path.shift();}else{char.x+=dx/dist*step;char.y+=dy/dist*step;}
    if(!char.path.length){
     if(char.dest===EXIT){chars.delete(char.id);continue;}
     char.spot=char.dest;char.arrivedAt=now;
     if(char.pending){const next=char.pending;char.pending=null;go(char,next);}
    }
    continue;
   }
   if(!idle(char))continue;
   const act=char.act;
   if(!act){if(now>=char.nextAt)chooseActivity(char,now);continue;}
   if(char.pending)continue;
   if(act.until===0){act.start=now;act.until=now+durationOf(act.kind);continue;}
   if(now>=act.until){release(char);char.nextAt=now+rand(700,2200);}
  }
 }

 // Static spots when motion is reduced: sit on the sofa first, then stand along the lane.
 function placeStill(){
  let rest=0;
  for(const char of chars.values()){
   const seat=zoneOf(char.status)==='desk'?char.dest:rest<SOFA_SEATS.length?SOFA_SEATS[rest++]:{kind:'lane',x:116+9*(rest++-SOFA_SEATS.length),y:LANE,door:[],sort:LANE} as Spot;
   if(seat){char.x=seat.x;char.y=seat.y;char.spot=seat;char.path=[];char.act=null;}
  }
 }

 function sync(){
  const {placed,hidden}=layoutAgents(agents,slots);
  slots=new Map(placed.map(row=>[row.id,{zone:row.zone,slot:row.slot}]));
  const byId=new Map(agents.map(agent=>[agent.id,agent]));
  const now=performance.now();
  for(const row of placed){
   const info=byId.get(row.id)!;let char=chars.get(row.id);
   if(!char){
    // A new agent walks in through the door on the left.
    char={id:row.id,agent:info.agent,name:info.name,status:info.status,project:info.project,x:-8,y:LANE,path:[],dest:null,spot:null,pending:null,act:null,nextAt:now+600,leaving:false,arrivedAt:now,cheerUntil:0,bubble:row.bubble,phase:Math.random()*10,moving:false,face:0,hair:hairOf(row.id),up:false,wasDesk:false};
    chars.set(row.id,char);
   }else{
    if(char.status==='working'&&info.status==='done')char.cheerUntil=now+DONE_CHEER;
    Object.assign(char,{agent:info.agent,name:info.name,status:info.status,project:info.project,leaving:false,bubble:row.bubble});
   }
   const desk=DESKS[row.slot];
   if(row.zone==='desk'){
    // Working or waiting on you: be at your desk.
    if(char.spot!==desk&&char.dest!==desk&&char.pending!==desk){release(char);go(char,desk);}
    if(reduced.matches)char.dest=desk;
   }else if(char.wasDesk){
    // Just finished: cheer where you sit, then you are free to roam or doze off.
    release(char);char.nextAt=now+(char.cheerUntil>now?DONE_CHEER:400);
   }
   char.wasDesk=row.zone==='desk';
  }
  for(const char of chars.values())if(!slots.has(char.id)&&!char.leaving){release(char);char.leaving=true;char.bubble=null;if(reduced.matches)chars.delete(char.id);else go(char,EXIT);}
  if(reduced.matches)placeStill();
  overflow.hidden=hidden===0;overflow.textContent=hidden?`+${hidden} more`:'';
  const text=summarize(agents);summaryNode.textContent=text;head.title=text;
  canvas.setAttribute('aria-label',text?`Agents: ${text}`:'No agents');
  renderZoomText();
 }
 function renderZoomText(){
  if(!zoomUi)return;
  const text=summarize(agents);zoomUi.summary.textContent=text;zoomUi.canvas.setAttribute('aria-label',text?`Agents: ${text}`:'No agents');
  zoomUi.roster.replaceChildren(...agents.map(agent=>{
   const row=make('li','lounge-roster-row');row.dataset.status=agent.status;
   const dot=make('span','lounge-roster-dot'),name=make('span','lounge-roster-name'),state=make('span','lounge-roster-state');
   name.textContent=agent.name;state.textContent=statusLabel(agent.status);row.append(dot,name,state);return row;
  }));
 }

 // ---- drawing ----
 const px=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
 function glyph(name:keyof typeof GLYPHS,x:number,y:number,color:string){GLYPHS[name].forEach((row,j)=>{for(let i=0;i<row.length;i++)if(row[i]==='1')px(x+i,y+j,1,1,color);});}
 function bits(rows:string[],x:number,y:number,color:string){rows.forEach((row,j)=>{for(let i=0;i<row.length;i++)if(row[i]==='1')px(x+i,y+j,1,1,color);});}
 const glyphWidth=(letter:string)=>letter===' '?2:(FONT[letter]?.[0].length??3)+1;
 const textWidth=(text:string)=>[...text].reduce((width,letter)=>width+glyphWidth(letter),0)-1;
 function pixelText(text:string,x:number,y:number,color:string){let at=x;for(const letter of text){const rows=FONT[letter];if(rows)bits(rows,at,y,color);at+=glyphWidth(letter);}}

 /** Room shell: wall, wood floor, rug. Nothing here ever hides a person. */
 function scene(){
  const p=palette;
  px(0,0,W,H,p.floorA);
  for(let y=15,row=0;y<H;y+=6,row++){
   px(0,y,W,1,p.seam);
   if(row%2===0)px(0,y+1,W,5,p.floorB);
   for(let x=(row*29)%44+6;x<W;x+=44)px(x,y+1,1,5,p.seam);
  }
  px(0,0,W,13,p.wall);px(0,13,W,2,p.trim);
  // Wall cabinets either side of the door, like a real office.
  for(const x of [24,146]){px(x,0,24,11,p.trim);px(x+1,1,10,9,p.door);px(x+13,1,10,9,p.door);px(x+10,5,1,3,p.light);px(x+13,5,1,3,p.light);}
  px(84,0,18,13,p.trim);px(85,1,16,12,p.door);px(86,2,6,11,p.doorLight);px(94,2,6,11,p.doorLight);px(92,8,1,2,p.light);px(93,8,1,2,p.light);
  // Rug under the break corner.
  px(116,60,74,40,p.rugEdge);px(117,61,72,38,p.rug);
 }

 /** The monitor screen says what the desk's owner is doing. */
 function screen(x:number,y:number,status:string|undefined,now:number){
  const p=palette;
  if(status==='working'||status==='connecting'){
   px(x,y,9,7,status==='working'?'#0f1a2e':'#12304f');
   if(status==='working'){
    const tick=reduced.matches?0:Math.floor(now/350);
    for(let i=0;i<3;i++){const length=3+((tick+i*2)%4);px(x+1,y+1+i*2,length,1,'#4ade80');}
    if(!reduced.matches&&Math.floor(now/500)%2)px(x+8,y+5,1,1,'#4ade80');
   }else for(let i=0;i<3;i++)px(x+2+i*2,y+3,1,1,'#7ab8ff');
  }
  else if(status==='done'){px(x,y,9,7,'#14532d');pixelText('OK',x+1,y+1,'#ffffff');}
  else if(status==='blocked'){px(x,y,9,7,'#7f1d1d');bits(BANG,x+2,y+1,'#ffffff');}
  else if(status==='error'||status==='failed'){px(x,y,9,7,'#7f1d1d');bits(CROSS,x+2,y+1,'#ffffff');}
  else{px(x,y,9,7,'#1c1f26');px(x+1,y+1,3,1,'#2c313c');px(x+1,y+3,5,1,'#242831');}
  void p;
 }
 /** A small amber "!" tag over the monitor of an agent that is waiting for you; it blinks gently. */
 function needsYou(centre:number,y:number,now:number){
  if(!reduced.matches&&Math.floor(now/500)%2)return;
  const p=palette;
  px(centre-3,y,7,9,p.warning);px(centre-2,y+1,5,7,p.paper);
  px(centre,y+2,1,3,p.warning);px(centre,y+6,1,1,p.warning);
  px(centre,y+9,1,1,p.warning);
 }

 const wall:Array<{y:number;fn:()=>void}>=[];
 /** The agent that owns a desk, wherever it is right now. */
 const ownerOf=(slot:number)=>[...chars.values()].find(char=>!char.leaving&&slots.get(char.id)?.slot===slot);
 // Furniture that does not move; each item is painted at its own floor line.
 function buildFurniture(){
  wall.length=0;
  const add=(y:number,fn:()=>void)=>wall.push({y,fn});
  for(let slot=0;slot<DESK_SLOTS;slot++){
   const g=deskGeometry(slot);
   // The desk: lamp, monitor showing its owner's state, keyboard, mug, plant and a PC tower underneath.
   add(g.top+7,()=>{
    const p=palette,x=g.x0,t=g.top,owner=ownerOf(slot),shade=[p.warning,p.accent,p.error,p.success][slot%4];
    if(owner?.status==='blocked')needsYou(x+9,t-21,performance.now());
    px(x+1,t-3,1,3,p.steel);px(x,t-5,4,2,shade);
    px(x+4,t-10,11,9,p.mon);screen(x+5,t-9,owner?.status,performance.now());px(x+8,t-1,3,1,p.steel);
    px(x,t,DESK_W,7,p.desk);px(x,t+7,DESK_W,1,p.deskEdge);
    px(x+5,t+3,8,2,p.key);px(x+14,t+3,1,1,p.key);
    px(x+16,t+1,2,2,p.paper);px(x+16,t+1,2,1,'#c0563f');px(x+16,t-3,2,3,p.plant);px(x+16,t,2,1,p.pot);
    px(x+1,t+8,1,6,p.deskEdge);px(x+13,t+8,5,8,p.paper);px(x+14,t+10,3,1,p.steel);px(x+14,t+12,1,1,p.success);px(x+13,t+16,5,1,p.steelDark);
   });
   // The chair: tucked in behind whoever sits there, turned away to the side when the desk is empty.
   add(g.fy-1.5,()=>{
    const p=palette,seated=[...chars.values()].some(char=>char.spot===DESKS[slot]&&!char.moving);
    if(seated)return;
    const c=p.chairs[slot%p.chairs.length],x=g.cx+7,y=g.fy+5;
    px(x+2,y-10,2,9,c);px(x-3,y-3,7,2,c);px(x,y-1,1,2,p.steelDark);px(x-2,y+1,5,1,p.steelDark);
   });
  }
  // Break corner: sofa, plant, coffee machine and water cooler.
  add(74,()=>{const p=palette;px(132,62,28,12,p.sofaDark);});
  add(82,()=>{const p=palette;px(130,66,4,18,p.sofa);px(158,66,4,18,p.sofa);px(134,74,24,10,p.sofa);px(134,83,24,1,p.sofaDark);px(146,75,1,8,p.sofaDark);px(131,84,2,2,p.deskEdge);px(159,84,2,2,p.deskEdge);});
  add(92,()=>{const p=palette;px(167,76,8,3,p.plant);px(168,72,6,5,p.plant);px(170,69,2,4,p.plant);px(168,86,6,6,p.pot);});
  add(40,()=>{const p=palette;px(122,24,10,16,p.steel);px(123,25,8,4,p.dark);px(124,26,3,1,p.success);px(125,32,4,5,p.paper);px(126,35,2,2,ITEM_COLOR.coffee);px(122,40,10,1,p.steelDark);});
  add(40,()=>{const p=palette;px(140,16,9,9,p.water);px(141,17,2,7,p.paper);px(140,25,9,15,p.paper);px(143,31,3,2,p.steel);px(140,40,9,1,p.steelDark);});
 }
 buildFurniture();

 // A cat that strolls the aisle, sits, and sleeps.
 const cat={x:150,y:LANE+4,tx:150,until:0,dir:1,mode:'sit' as 'sit'|'walk'|'sleep'};
 function advanceCat(dt:number,now:number){
  if(cat.mode==='walk'){
   const dx=cat.tx-cat.x,step=14*dt;cat.dir=Math.sign(dx)||cat.dir;
   if(Math.abs(dx)<=step){cat.x=cat.tx;cat.mode='sit';cat.until=now+rand(3000,9000);}else cat.x+=Math.sign(dx)*step;
  }else if(now>=cat.until){
   const roll=Math.random();
   if(roll<.5){cat.tx=rand(10,182);cat.mode='walk';}else{cat.mode=roll<.75?'sleep':'sit';cat.until=now+rand(5000,12000);}
  }
 }
 function drawCat(now:number){
  const x=Math.round(cat.x),y=Math.round(cat.y),d=cat.dir,fur='#d8a15a',stripe='#b8793a',frame=Math.floor(now/180)%2;
  if(cat.mode==='sleep'){px(x-4,y-2,8,3,fur);px(x-4,y-2,8,1,stripe);px(x+(d>0?3:-5),y-2,2,2,fur);return;}
  px(x-3,y-3,6,3,fur);px(x-1,y-3,1,3,stripe);px(x+1,y-3,1,3,stripe);
  px(x+(d>0?3:-5),y-5,3,3,fur);px(x+(d>0?3:-5),y-6,1,1,fur);px(x+(d>0?5:-3),y-6,1,1,fur);
  px(x+(d>0?4:-4),y-4,1,1,EYE);
  px(x-(d>0?4:-3),y-(cat.mode==='walk'?4:2),1,cat.mode==='walk'?2:1,stripe);
  const step=cat.mode==='walk'&&frame;px(x-2,y,1,step?0:1,stripe);px(x+1,y,1,step?1:0,stripe);px(x-2,y,1,1,fur);px(x+2,y,1,1,fur);
 }

 function heldItem(item:Item,x:number,y:number){px(x,y,2,2,ITEM_COLOR[item]);}

 function character(char:Char,now:number){
  const p=palette;
  const t=(now/1000)+char.phase,beat=Math.floor(t*(char.moving?8:3))%2;
  const still=reduced.matches;
  const color=AGENT_COLORS[char.agent]||'#9aa0a6',dark=mix('#000000',color,22);
  const cx=Math.round(char.x),spot=char.spot,sitting=!char.moving&&!!spot&&(spot.kind==='desk'||spot.kind==='sofa');
  const atDesk=sitting&&spot!.kind==='desk',back=char.moving?char.up:atDesk;
  const act=!char.moving&&char.act&&char.act.until>0?char.act:null;
  const cheering=!still&&now<char.cheerUntil&&!char.moving;
  const stretching=!still&&act?.kind==='stretch';
  const fy=Math.round(char.y)-(char.moving&&beat&&!still?1:0)-((cheering||stretching)&&Math.floor(t*6)%2?1:0);
  const faded=currentProject!==null&&char.project!==currentProject;
  ctx.globalAlpha=faded?.55:1;
  const working=char.status==='working'||char.status==='connecting',typing=atDesk&&working&&!still;
  const asleep=!still&&(act?.kind==='nap'||act?.kind==='rest')&&now-act.start>2500;
  const partner=act?.kind==='chat'&&act.partner?chars.get(act.partner):undefined;
  const face=partner&&!partner.moving?Math.sign(partner.x-char.x):0;
  const speaking=!!partner&&!partner.moving&&(char.id<partner.id)===(Math.floor(now/1600)%2===0);
  // legs (a desk chair hides them)
  if(sitting&&spot!.kind==='sofa'){/* The legs come out over the cushion; see sofaLegs. */}
  else if(!atDesk){const l=char.moving&&beat?3:4,r=char.moving&&!beat?3:4;px(cx-2,fy-l,2,l,dark);px(cx+1,fy-r,2,r,dark);}
  // arms; seen from behind there are no hands to show
  const armY=fy-9;
  const reach=(side:number,len:number,up=false)=>{const x=cx+side*3;if(up){px(x,fy-14,1,5,color);px(x,fy-15,1,1,back?color:SKIN);}else{px(x,armY,1,len,color);if(!back)px(x,armY+len,1,1,SKIN);}};
  const cup=act?.kind==='drink'?act:null;
  if(cheering||stretching){reach(-1,0,true);reach(1,0,true);}
  else if(cup){
   const phase=((now-cup.start)%3400)/3400,raised=!still&&phase>.55&&phase<.82;
   reach(-1,4);
   if(raised){px(cx+3,fy-12,1,3,color);px(cx+3,fy-13,1,1,SKIN);heldItem(cup.item!,cx+4,fy-14);if(cup.item==='coffee'){ctx.globalAlpha=(faded?.55:1)*.7;px(cx+4,fy-16-(beat?0:1),1,1,'#ffffff');ctx.globalAlpha=faded?.55:1;}}
   else{reach(1,4);heldItem(cup.item!,cx+4,fy-6);}
  }
  else if(act?.kind==='sofa'){reach(-1,3);reach(1,3);px(cx-1,fy-8,2,3,'#222');px(cx,fy-8,1,1,'#9ad0ff');}
  else if(partner&&speaking&&beat===0){reach(-1,4);reach(1,0,true);}
  else if(partner&&speaking){reach(-1,4);reach(1,3);}
  else if(typing){reach(-1,beat?3:4);reach(1,beat?4:3);}
  else if(char.moving&&!still){reach(-1,beat?4:3);reach(1,beat?3:4);}
  else{reach(-1,4);reach(1,4);}
  // torso with the agent's logo on it, then the head
  px(cx-2,fy-10,5,6,color);px(cx-2,fy-5,5,1,dark);
  (EMBLEMS[char.agent]||['.XXX.','XXXXX','.XXX.']).forEach((row,j)=>{for(let i=0;i<5;i++)if(row[i]==='X')px(cx-2+i,fy-9+j,1,1,'#ffffff');});
  const nod=asleep&&atDesk?1:!still&&partner&&!speaking&&Math.floor(now/900)%2?1:0;
  if(back){px(cx-2,fy-15+nod,5,5,char.hair);px(cx-3,fy-13+nod,1,2,SKIN);px(cx+3,fy-13+nod,1,2,SKIN);}
  else{
   px(cx-2,fy-15+nod,5,5,SKIN);px(cx-2,fy-15+nod,5,2,char.hair);px(cx-3,fy-14+nod,1,2,char.hair);px(cx+3,fy-14+nod,1,2,char.hair);
   const blink=Math.floor(now/1000+char.phase*3)%5===0&&now%1000<130;
   const eyeX=cx-1+(face>0?1:face<0?-1:0);
   if(asleep||blink){px(eyeX,fy-11+nod,1,1,EYE);px(eyeX+2,fy-11+nod,1,1,EYE);}
   else{px(eyeX,fy-12+nod,1,2,EYE);px(eyeX+2,fy-12+nod,1,2,EYE);}
   if(char.status==='error'||char.status==='failed')px(cx,fy-10+nod,1,1,EYE);
   else if(speaking&&Math.floor(now/180)%2)px(cx,fy-10+nod,1,2,mix(EYE,SKIN,60));
   else if(!asleep)px(cx,fy-10+nod,1,1,mix(char.hair,SKIN,40));
  }
  if(atDesk){
   // The chair behind the person, with its pole and five-star base showing underneath.
   px(cx-4,fy-5,9,6,p.chairs[Math.max(0,DESKS.indexOf(spot!))%p.chairs.length]);
   px(cx,fy+1,1,1,p.steelDark);px(cx-3,fy+2,7,1,p.steelDark);px(cx-3,fy+3,1,1,p.steelDark);px(cx+3,fy+3,1,1,p.steelDark);
  }
  const top=fy-15;
  if(speaking&&!still){
   const w=11,h=7,x=cx-5+face*3,y=top-h-2,tint=p.dark,lit=Math.floor(now/200)%3;
   px(x,y,w,h,p.paper);px(x,y,w,1,tint);px(x,y+h-1,w,1,tint);px(x,y,1,h,tint);px(x+w-1,y,1,h,tint);px(cx,y+h,1,1,tint);
   for(let i=0;i<3;i++)px(x+3+i*2,y+(i===lit?2:3),1,1,tint);
  }
  if(asleep){const drift=Math.floor(now/500)%3;glyph('z',cx+4,top-4-drift,p.ink);}
  ctx.globalAlpha=1;
 }

/** Someone on the sofa has knees and feet in front of the cushion, so they read as sitting on it, not inside it. */
 function sofaLegs(char:Char){
  const color=AGENT_COLORS[char.agent]||'#9aa0a6',dark=mix('#000000',color,22),cx=Math.round(char.x),fy=Math.round(char.y);
  ctx.globalAlpha=currentProject!==null&&char.project!==currentProject?.55:1;
  px(cx-2,fy-3,2,3,dark);px(cx+1,fy-3,2,3,dark);px(cx-2,fy,2,1,SKIN);px(cx+1,fy,2,1,SKIN);
  ctx.globalAlpha=1;
 }
 function draw(view:View,now=performance.now()){
  ctx=view.ctx;
  ctx.setTransform(view.scale,0,0,view.scale,0,0);ctx.imageSmoothingEnabled=false;
  ctx.clearRect(0,0,W,H);
  scene();
  const items=[...wall];
  for(const char of chars.values())items.push({y:charSort(char),fn:()=>character(char,now)});
  for(const char of chars.values())if(!char.moving&&char.spot?.kind==='sofa')items.push({y:83,fn:()=>sofaLegs(char)});
  items.push({y:cat.y,fn:()=>drawCat(now)});
  items.sort((a,b)=>a.y-b.y);
  for(const item of items)item.fn();
 }
 /** Seated people sit between their chair and desk; everyone else is ordered by where their feet are. */
 function charSort(char:Char){
  const spot=char.spot;
  return !char.moving&&spot&&(spot.kind==='desk'||spot.kind==='sofa')?spot.sort:char.y;
 }
 const drawAll=(now=performance.now())=>{if(!section.hidden&&expanded)draw(small,now);if(zoomUi?.dialog.open)draw(zoomUi.view,now);};

 // ---- sizing, loop, interaction ----
 /** Whole-number scales keep pixel art crisp: used for the enlarged view. */
 function fit(view:View,cssWidth:number,cssHeight:number){
  const dpr=window.devicePixelRatio||1;
  const device=Math.max(1,Math.floor(Math.min(cssWidth*dpr/W,cssHeight*dpr/H)));
  view.scale=device;view.canvas.width=W*device;view.canvas.height=H*device;
  view.canvas.style.width=`${W*device/dpr}px`;view.canvas.style.height=`${H*device/dpr}px`;
 }
 /** The sidebar view fills the panel width. It is drawn at a whole-number scale at or above that size and shrunk by the browser, which keeps it readable. */
 function resizeSmall(){
  const dpr=window.devicePixelRatio||1,css=Math.max(W,(body.clientWidth||W)-12);
  const device=Math.max(2,Math.ceil(css*dpr/W));
  small.scale=device;canvas.width=W*device;canvas.height=H*device;
  canvas.style.width=`${css}px`;canvas.style.height=`${Math.round(css*H/W)}px`;
  draw(small);
 }
 function resizeBig(){if(!zoomUi)return;fit(zoomUi.view,Math.min(innerWidth*.86,1280)-32,innerHeight*.66);draw(zoomUi.view);}
 const sizer=new ResizeObserver(()=>{if(expanded&&!section.hidden)resizeSmall();});
 sizer.observe(body);
 window.addEventListener('resize',()=>{if(zoomOpen())resizeBig();});
 new MutationObserver(()=>{palette=readPalette(section);drawAll();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

 const running=()=>!document.hidden&&!reduced.matches&&chars.size>0&&enabled&&((expanded&&!section.hidden)||zoomOpen());
 function frame(now:number){
  raf=0;if(!running())return;
  if(now-lastDraw>=FRAME_MS){const dt=Math.min(.1,(now-(lastDraw||now-FRAME_MS))/1000);lastDraw=now;advance(dt,now);drawAll(now);}
  raf=requestAnimationFrame(frame);
 }
 function kick(){if(running()){if(!raf){lastDraw=0;raf=requestAnimationFrame(frame);}}else if(raf){cancelAnimationFrame(raf);raf=0;}}
 document.addEventListener('visibilitychange',()=>{kick();drawAll();});
 reduced.addEventListener('change',()=>{sync();kick();drawAll();});

 const nameAt=(view:View,event:MouseEvent)=>{
  const box=view.canvas.getBoundingClientRect(),x=(event.clientX-box.left)/box.width*W,y=(event.clientY-box.top)/box.height*H;
  const hit=[...chars.values()].reverse().find(char=>x>=char.x-3&&x<=char.x+4&&y>=char.y-16&&y<=char.y+1);
  return hit?`${hit.name} — ${statusLabel(hit.status)}`:'';
 };
 canvas.addEventListener('mousemove',event=>{canvas.title=nameAt(small,event);});

 function setExpanded(value:boolean){
  expanded=value;head.setAttribute('aria-expanded',String(value));body.hidden=!value;section.classList.toggle('collapsed',!value);
  try{localStorage.setItem('ai-web.lounge',value?'open':'closed');}catch{/* The choice just is not remembered. */}
  if(value)requestAnimationFrame(resizeSmall);
  kick();
 }
 head.onclick=()=>setExpanded(!expanded);
 setExpanded(expanded);

 function openZoom(){
  if(zoomOpen()||section.hidden)return;
  const ui=buildZoom();zoomUi=ui;
  ui.canvas.addEventListener('mousemove',event=>{ui.canvas.title=nameAt(ui.view,event);});
  ui.close.onclick=()=>ui.dialog.close();
  ui.dialog.addEventListener('click',event=>{if(event.target===ui.dialog)ui.dialog.close();});
  ui.dialog.addEventListener('close',()=>{ui.canvas.width=ui.canvas.height=0;ui.dialog.remove();if(zoomUi===ui)zoomUi=null;kick();head.focus({preventScroll:true});});
  renderZoomText();ui.dialog.showModal();resizeBig();kick();ui.close.focus({preventScroll:true});
 }
 canvas.style.cursor='zoom-in';canvas.addEventListener('click',openZoom);

 // ---- on/off (Settings) ----
 let enabled=officePreference.get();
 function applyEnabled(){
  enabled=officePreference.get();
  if(!enabled){
   zoomUi?.dialog.close();chars.clear();taken.clear();slots=new Map();
   canvas.width=canvas.height=0;section.hidden=true;kick();return;
  }
  sync();section.hidden=agents.length===0;
  if(!section.hidden&&expanded)resizeSmall();
  kick();
 }
 officePreference.subscribe(applyEnabled);
 if(!enabled)section.hidden=true;

 return {
  update(rows:TerminalAgent[],projectId:string|null){
   // Only AI agents live in the office; plain shells and SSH terminals do not.
   agents=rows.filter(row=>row.agent&&row.agent!=='shell').map(row=>({id:row.id,agent:row.agent,name:row.name,status:row.status,project:row.project}));currentProject=projectId;
   if(!enabled)return;
   const wasHidden=section.hidden;section.hidden=agents.length===0;
   if(section.hidden)zoomUi?.dialog.close();
   sync();
   if(wasHidden&&!section.hidden&&expanded)resizeSmall();
   if(reduced.matches||!running())drawAll();
   kick();
  }
 };
}
