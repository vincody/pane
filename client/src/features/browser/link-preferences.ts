export type LinkTarget='ask'|'app'|'system';
export interface LinkPreferences {open:LinkTarget;detect:boolean}
const STORAGE_KEY='ai-web.links';
const DEFAULTS:LinkPreferences={open:'ask',detect:true};
export function parseLinkPreferences(raw:string|null):LinkPreferences{
 const result={...DEFAULTS};
 try{
  const stored:unknown=JSON.parse(raw||'{}');
  if(stored&&typeof stored==='object'){const value=stored as Record<string,unknown>;if(value.open==='ask'||value.open==='app'||value.open==='system')result.open=value.open;if(typeof value.detect==='boolean')result.detect=value.detect;}
 }catch{}
 return result;
}
/** Where web links open (ask, in Pane or in the system browser) and whether local servers in terminal output are announced. */
export function createLinkPreferences(){
 let current=DEFAULTS;
 try{current=parseLinkPreferences(localStorage.getItem(STORAGE_KEY));}catch{}
 const listeners=new Set<(value:LinkPreferences)=>void>();
 return {
  get:()=>current,
  set(patch:Partial<LinkPreferences>){
   current={...current,...patch};
   try{localStorage.setItem(STORAGE_KEY,JSON.stringify(current));}catch{}
   for(const listener of listeners)listener(current);
  },
  subscribe(listener:(value:LinkPreferences)=>void){listeners.add(listener);return ()=>listeners.delete(listener);},
 };
}
export type LinkPreferenceStore=ReturnType<typeof createLinkPreferences>;
