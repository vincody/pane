/** Default keys, following Herdr's global keymap. A key string maps to a command id. */
export const DEFAULT_KEYS:Record<string,string>={
  'ctrl-shift-p':'app.palette','ctrl-shift-t':'tab.new','ctrl-shift-w':'tab.close','f2':'tab.rename',
  'ctrl-tab':'tab.next','ctrl-shift-tab':'tab.prev','ctrl-pagedown':'tab.next','ctrl-pageup':'tab.prev',
  'ctrl-1':'tab.select:1','ctrl-2':'tab.select:2','ctrl-3':'tab.select:3','ctrl-4':'tab.select:4','ctrl-5':'tab.select:5','ctrl-6':'tab.select:6','ctrl-7':'tab.select:7','ctrl-8':'tab.select:8','ctrl-9':'tab.select:9',
  'ctrl-shift-o':'pane.split:right','ctrl-shift-e':'pane.split:down',
  'alt-left':'pane.go:left','alt-right':'pane.go:right','alt-up':'pane.go:up','alt-down':'pane.go:down',
  'ctrl-,':'app.settings','ctrl-shift-b':'view.sidebar',
  // Pane's own keys that Herdr does not use.
  'ctrl-b':'view.sidebar','ctrl-shift-f':'view.files','ctrl-o':'space.new','ctrl-shift-j':'session.attention',
};
interface Chord {ctrl:boolean;shift:boolean;alt:boolean;key:string}
function parse(spec:string):Chord{
  const key=spec.endsWith('--')?'-':spec.slice(spec.lastIndexOf('-',spec.length-2)+1);
  const mods=spec.slice(0,spec.length-key.length).split('-').filter(Boolean);
  return {ctrl:mods.includes('ctrl'),shift:mods.includes('shift'),alt:mods.includes('alt'),key};
}
const NAMED:Record<string,string>={pagedown:'pagedown',pageup:'pageup',arrowleft:'left',arrowright:'right',arrowup:'up',arrowdown:'down',tab:'tab'};
/** Layout-independent key name: letters and digits by physical key, so Alt on a Mac still reads as the letter. */
function keyOf(event:KeyboardEvent){
  if(/^Key[A-Z]$/.test(event.code))return event.code.slice(3).toLowerCase();
  if(/^Digit\d$/.test(event.code))return event.code.slice(5);
  if(event.code==='Slash'&&event.shiftKey)return '?';
  const lower=event.key.toLowerCase();return NAMED[lower]||lower;
}
const chords=Object.entries(DEFAULT_KEYS).map(([spec,command])=>({command,chord:parse(spec),spec}));
const isMac=typeof navigator!=='undefined'&&navigator.platform.includes('Mac');
/** The command a key press runs, or null. Ctrl also reads as Cmd on a Mac. */
export function commandFor(event:KeyboardEvent){
  if(event.isComposing)return null;
  const key=keyOf(event),ctrl=event.ctrlKey||event.metaKey;
  for(const item of chords){const {chord}=item;if(chord.ctrl===ctrl&&chord.shift===event.shiftKey&&chord.alt===event.altKey&&chord.key===key)return item.command;}
  return null;
}
const LABEL:Record<string,string>={pagedown:'PgDn',pageup:'PgUp',left:'←',right:'→',up:'↑',down:'↓',tab:'Tab'};
/** Display parts of the first key bound to a command, such as ["Ctrl","Shift","T"]. */
export function shortcutFor(command:string){
  const found=chords.find(item=>item.command===command);if(!found)return undefined;
  const {chord}=found,key=LABEL[chord.key]||(chord.key.length===1?chord.key.toUpperCase():chord.key.toUpperCase());
  return [...(chord.ctrl?[isMac?'⌘':'Ctrl']:[]),...(chord.alt?[isMac?'⌥':'Alt']:[]),...(chord.shift?[isMac?'⇧':'Shift']:[]),key];
}
