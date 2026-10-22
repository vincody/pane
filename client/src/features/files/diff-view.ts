import type {editor} from 'monaco-editor';
import type {NativeIcon} from '../../components/contracts.ts';
export interface DiffStat {added:number|null;removed:number|null}
interface Preferences {unified:boolean;hideUnchanged:boolean}
interface DiffDocument {path:string;name:string;baseline?:string|null;stat?:DiffStat}
const STORAGE_KEY='ai-web.diff-view',SIDE_BY_SIDE_MIN_WIDTH=680;
const unchanged=(enabled:boolean)=>({enabled,contextLineCount:3,minimumLineCount:4,revealLineCount:20});
function readPreferences():Preferences{
 const preferences:Preferences={unified:false,hideUnchanged:true};
 try{const stored:unknown=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');if(stored&&typeof stored==='object')for(const key of ['unified','hideUnchanged'] as const){const value=(stored as Record<string,unknown>)[key];if(typeof value==='boolean')preferences[key]=value;}}catch{}
 return preferences;
}
const writePreferences=(preferences:Preferences)=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(preferences));}catch{}};
/** Minimal, review-oriented Monaco diff options: only changed regions with a little context, no overview ruler. */
export function diffEditorOptions():editor.IDiffEditorConstructionOptions{
 const preferences=readPreferences();
 return {renderSideBySide:!preferences.unified,hideUnchangedRegions:unchanged(preferences.hideUnchanged),renderOverviewRuler:false,enableSplitViewResizing:false,useInlineViewWhenSpaceIsLimited:false,renderIndicators:true,glyphMargin:false,folding:false,lineNumbersMinChars:4,padding:{top:8,bottom:8}};
}
export function updateDiffStat(root:ParentNode|undefined,stat:DiffStat|undefined){
 const node=root?.querySelector<HTMLElement>('.diff-stat');if(!node)return;
 node.replaceChildren();
 for(const [value,sign,className] of [[stat?.added,'+','diff-added'],[stat?.removed,'−','diff-removed']] as const){if(!value)continue;const part=document.createElement('span');part.className=className;part.textContent=`${sign}${value}`;node.append(part);}
 node.hidden=!node.childElementCount;
}
function control(label:string,iconName:string,icon:NativeIcon){
 const button=document.createElement('button');button.type='button';button.className='diff-control';button.setAttribute('aria-label',label);button.title=label;button.append(icon(iconName));return button;
}
/** Replaces the pane title with filename and folder, then adds the stat and view controls before `anchor`. */
export function setupDiffHeader({header,anchor,diff,doc,icon}:{header:HTMLElement;anchor:HTMLElement;diff:editor.IStandaloneDiffEditor;doc:DiffDocument;icon:NativeIcon}){
 const preferences=readPreferences(),parts=doc.path.split('/'),file=parts.pop()||doc.path,title=header.querySelector<HTMLElement>('.terminal-pane-title')!;
 const name=document.createElement('span');name.className='diff-file';name.textContent=file;title.replaceChildren(name);
 if(parts.length){const folder=document.createElement('span');folder.className='diff-folder';folder.textContent=parts.join('/');title.append(folder);}
 const revision=doc.name.includes(' · ')?doc.name.split(' · ').pop()!:'';
 if(revision&&revision!=='Diff'){const chip=document.createElement('span');chip.className='diff-revision';chip.textContent=revision;title.append(chip);}
 title.title=`${doc.path}${doc.baseline===undefined?'':doc.baseline?' · HEAD compared with the file on disk':' · New file compared with an empty Git baseline'}`;
 const controls=document.createElement('div');controls.className='diff-controls';
 const stat=document.createElement('span');stat.className='diff-stat';stat.hidden=true;
 const layout=control('Unified view','diff-unified',icon),fold=control('Hide unchanged regions','diff-fold',icon),previous=control('Previous change','chevron-up',icon),next=control('Next change','chevron-down',icon);
 controls.append(stat,previous,next,fold,layout);header.insertBefore(controls,anchor);updateDiffStat(header,doc.stat);
 let width=0,applied:boolean|undefined;
 const sideBySide=()=>!preferences.unified&&width>=SIDE_BY_SIDE_MIN_WIDTH;
 function render(){
  const label=(button:HTMLButtonElement,text:string)=>{button.title=text;button.setAttribute('aria-label',text);};
  layout.setAttribute('aria-pressed',String(preferences.unified));label(layout,preferences.unified?'Split view':'Unified view');
  fold.setAttribute('aria-pressed',String(preferences.hideUnchanged));label(fold,preferences.hideUnchanged?'Show all lines':'Hide unchanged regions');
  applied=width===0?!preferences.unified:sideBySide();
  diff.updateOptions({renderSideBySide:applied,hideUnchangedRegions:unchanged(preferences.hideUnchanged)});
 }
 layout.onclick=()=>{preferences.unified=!preferences.unified;writePreferences(preferences);render();};
 fold.onclick=()=>{preferences.hideUnchanged=!preferences.hideUnchanged;writePreferences(preferences);render();};
 previous.onclick=()=>diff.goToDiff('previous');next.onclick=()=>diff.goToDiff('next');
 render();
 // Only a real change of mode is applied: re-setting it on every resize relayouts Monaco, which resizes the pane again and the view jitters.
 return {layout(next:number){width=next;const value=sideBySide();if(value!==applied){applied=value;diff.updateOptions({renderSideBySide:value});}}};
}
