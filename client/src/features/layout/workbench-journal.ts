import type {FileView} from '../files/documents.ts';
export type SavedPaneTree={id:string}|{direction:'right'|'down';ratio:number;first:SavedPaneTree;second:SavedPaneTree};
export interface SavedLayout {groups:{project:string;tree:SavedPaneTree;manual:boolean}[];selected:Record<string,string>;maximized?:string}
export interface SavedFile {project:string;path:string;pane:boolean;view:FileView;draft?:string;version?:string}
export interface SavedWorkspaceView {project:string;kind:'git'|'pane'|'file'|'empty';file:string|null;pane?:string;mode:string;secondary:string|null;secondaryMode:FileView;classes:string[];order:string[]}
export interface WorkbenchJournal {version:1;files:SavedFile[];views:SavedWorkspaceView[];layout:SavedLayout;git:string[];positions:[string,number][];selected:string|null}
const key='pane.workbench.v1';
let lastWritten='';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const strings=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&item.length<=8192).slice(0,256):[];
export function parseWorkbenchJournal(value:unknown):WorkbenchJournal|null{
 const data=object(value);if(data.version!==1)return null;
 let nodes=0;
 function tree(value:unknown,depth=0):SavedPaneTree|null{
  if(depth>16||++nodes>256)return null;const node=object(value);
  if(typeof node.id==='string'&&node.id.length<=8192)return {id:node.id};
  if(!['right','down'].includes(String(node.direction))||typeof node.ratio!=='number'||!Number.isFinite(node.ratio))return null;
  const first=tree(node.first,depth+1),second=tree(node.second,depth+1);return first&&second?{direction:node.direction as 'right'|'down',ratio:Math.max(.15,Math.min(.85,node.ratio)),first,second}:null;
 }
 const files:SavedFile[]=Array.isArray(data.files)?data.files.slice(0,64).flatMap(value=>{const file=object(value);if(typeof file.project!=='string'||typeof file.path!=='string'||file.path.length>4096)return [];return [{project:file.project,path:file.path,pane:file.pane===true,view:file.view==='live'?'live' as const:file.view==='preview'?'preview' as const:'editor' as const,...(typeof file.draft==='string'&&file.draft.length<=2*1024*1024?{draft:file.draft}:{}),...(typeof file.version==='string'?{version:file.version}:{})}];}):[];
 const views:SavedWorkspaceView[]=Array.isArray(data.views)?data.views.slice(0,128).flatMap(value=>{const view=object(value);if(typeof view.project!=='string'||!['git','pane','file','empty'].includes(String(view.kind)))return [];return [{project:view.project,kind:view.kind as SavedWorkspaceView['kind'],file:typeof view.file==='string'?view.file:null,pane:typeof view.pane==='string'?view.pane:undefined,mode:view.mode==='live'?'live':view.mode==='preview'?'preview':'editor',secondary:typeof view.secondary==='string'?view.secondary:null,secondaryMode:view.secondaryMode==='live'?'live' as const:view.secondaryMode==='preview'?'preview' as const:'editor' as const,classes:strings(view.classes).filter(value=>['file-file-split','chat-file-split','split-vertical','split-ai-last','file-pane-first'].includes(value)),order:strings(view.order)}];}):[];
 const layout=object(data.layout),selected:Record<string,string>={};
 for(const [key,value] of Object.entries(object(layout.selected)).slice(0,128))if(typeof value==='string')selected[key]=value;
 const groups=Array.isArray(layout.groups)?layout.groups.slice(0,128).flatMap(value=>{const group=object(value),root=tree(group.tree);return typeof group.project==='string'&&root?[{project:group.project,tree:root,manual:group.manual===true}]:[];}):[];
 const positions:[string,number][]=Array.isArray(data.positions)?data.positions.slice(0,512).flatMap(value=>Array.isArray(value)&&typeof value[0]==='string'&&typeof value[1]==='number'&&Number.isFinite(value[1])?[[value[0],value[1]] as [string,number]]:[]):[];
 return {version:1,files,views,layout:{groups,selected,...(typeof layout.maximized==='string'?{maximized:layout.maximized}:{})},git:strings(data.git),positions,selected:typeof data.selected==='string'?data.selected:null};
}
export function readWorkbenchJournal():WorkbenchJournal|null{try{return parseWorkbenchJournal(JSON.parse(localStorage.getItem(key)||'null'));}catch{return null;}}
export function writeWorkbenchJournal(value:WorkbenchJournal):boolean{try{const text=JSON.stringify(value);if(text.length>3*1024*1024||value.files.length>64||value.files.some(file=>file.draft!==undefined&&file.draft.length>2*1024*1024))return false;if(text!==lastWritten){localStorage.setItem(key,text);lastWritten=text;}return true;}catch{return false;}}
