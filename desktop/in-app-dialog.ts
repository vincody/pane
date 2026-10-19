import {dialog,ipcMain,type BrowserWindow,type MessageBoxOptions} from 'electron';
import {randomUUID} from 'node:crypto';

export interface AppDialogRequest {id:string;type:string;message:string;detail:string;buttons:string[];defaultId:number;cancelId:number}

const CANCEL_LABEL=/^(cancel|no)$/i;
const clip=(value:unknown,limit:number)=>typeof value==='string'?value.slice(0,limit):'';

/** The index Electron's native dialog would report for Escape: the button labelled Cancel/No, else the first. */
export function dialogCancelId(buttons:readonly string[],cancelId?:number){
 if(typeof cancelId==='number'&&cancelId>=0&&cancelId<buttons.length)return cancelId;
 const index=buttons.findIndex(label=>CANCEL_LABEL.test(label.trim()));
 return index>=0?index:0;
}

export function buildDialogRequest(options:Pick<MessageBoxOptions,'type'|'message'|'detail'|'buttons'|'defaultId'|'cancelId'>,id=randomUUID()):AppDialogRequest{
 const buttons=(options.buttons?.length?options.buttons:['OK']).slice(0,4).map(label=>clip(label,60)||'OK');
 const defaultId=typeof options.defaultId==='number'&&options.defaultId>=0&&options.defaultId<buttons.length?options.defaultId:0;
 return {id,type:clip(options.type,16)||'info',message:clip(options.message,300),detail:clip(options.detail,2000),buttons,defaultId,cancelId:dialogCancelId(buttons,options.cancelId)};
}

/**
 * Shows message boxes for the main window inside the app, in its own design, instead of the system dialog.
 * It replaces dialog.showMessageBox so call sites (and tests that stub it) stay unchanged; the system dialog
 * remains the fallback while the page is not loaded, such as after a renderer crash.
 */
export function installInAppDialogs(window:BrowserWindow,reveal:()=>void){
 const contents=window.webContents,native=dialog.showMessageBox.bind(dialog) as (...args:unknown[])=>Promise<Electron.MessageBoxReturnValue>;
 const pending=new Map<string,{resolve:(value:number)=>void;cancelId:number}>();
 let ready=false;
 const abandon=()=>{ready=false;for(const [id,item] of pending){pending.delete(id);item.resolve(item.cancelId);}};
 contents.on('did-finish-load',()=>{ready=true;});
 contents.on('render-process-gone',abandon);
 contents.on('destroyed',abandon);
 ipcMain.on('pane:dialog-result',(event,value:unknown)=>{
  if(event.sender!==contents||event.senderFrame!==contents.mainFrame||!value||typeof value!=='object')return;
  const {id,response}=value as Record<string,unknown>;
  const item=typeof id==='string'?pending.get(id):undefined;if(!item||typeof response!=='number')return;
  pending.delete(id as string);item.resolve(Number.isInteger(response)?response:item.cancelId);
 });
 dialog.showMessageBox=((first:unknown,second?:unknown)=>{
  const options=(second??first) as MessageBoxOptions;
  if(first!==window||!ready||contents.isDestroyed())return second===undefined?native(first):native(first,second);
  const request=buildDialogRequest(options);
  return new Promise<Electron.MessageBoxReturnValue>(resolve=>{
   pending.set(request.id,{cancelId:request.cancelId,resolve:response=>resolve({response:response>=0&&response<request.buttons.length?response:request.cancelId,checkboxChecked:false})});
   reveal();contents.send('pane:dialog',request);
  });
 }) as typeof dialog.showMessageBox;
}
