import type {NativeIcon} from '../../components/contracts.ts';
import {BROWSER_PARTITION} from '../../../../shared/browser.ts';
import {describeLoadError,sanitizeUrl} from './browser-url.ts';
interface NavigationEvent extends Event {url:string;isMainFrame?:boolean}
interface WebviewElement extends HTMLElement {
 src:string;loadURL(url:string):Promise<void>;goBack():void;goForward():void;reload():void;stop():void;
 canGoBack():boolean;canGoForward():boolean;getURL():string;isLoading():boolean;openDevTools():void;
}
export interface BrowserServer {url:string;label:string}
export interface BrowserState {url:string;title:string;favicon:string}
interface Options {
 host:HTMLElement;icon:NativeIcon;initialUrl:string;
 loadServers:()=>Promise<BrowserServer[]>;
 onState:(state:BrowserState)=>void;onFocus:()=>void;openExternal:(url:string)=>void;
}
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]','::1']);
/** True for Pane's own server, which the Browser tab refuses to open. */
export function isOwnServer(url:string,location:{protocol:string;port:string}){
 try{const target=new URL(url);return target.protocol===location.protocol&&target.port===location.port&&LOOPBACK.has(target.hostname);}catch{return false;}
}
function button(label:string,iconName:string,icon:NativeIcon,action:string){
 const element=document.createElement('button');element.type='button';element.className='browser-button';element.dataset.action=action;
 element.setAttribute('aria-label',label);element.title=label;element.append(icon(iconName));return element;
}
/**
 * Electron reloads a <webview> whenever it is moved in the DOM, and the workbench re-parents panes on every tab or layout change.
 * The webview therefore lives in one fixed layer that is never re-parented, and follows the position of its pane's viewport.
 */
function webviewLayer(){
 let layer=document.querySelector<HTMLElement>('#browser-layer');
 if(!layer){layer=document.createElement('div');layer.id='browser-layer';document.body.append(layer);}
 return layer;
}
/** An embedded browser (an Electron <webview> in its own session) with an address bar, navigation, error screen and local-server start page. */
export function setupBrowserPane({host,icon,initialUrl,loadServers,onState,onFocus,openExternal}:Options){
 host.classList.add('browser-host');
 const toolbar=document.createElement('div');toolbar.className='browser-toolbar';
 const back=button('Back','arrow-left',icon,'back'),forward=button('Forward','arrow-right',icon,'forward'),reload=button('Reload','refresh',icon,'reload');
 const form=document.createElement('form');form.className='browser-address';
 const address=document.createElement('input');address.type='text';address.spellcheck=false;address.autocomplete='off';address.setAttribute('aria-label','Address');address.placeholder='Search or enter address';form.append(address);
 const devtools=button('Open DevTools','code',icon,'devtools'),external=button('Open in system browser','arrow',icon,'external');
 toolbar.append(back,forward,reload,form,devtools,external);
 const progress=document.createElement('div');progress.className='browser-progress';progress.hidden=true;
 const viewport=document.createElement('div');viewport.className='browser-viewport';
 const start=document.createElement('div');start.className='browser-start';
 start.innerHTML='<h2>Open a page</h2><p>Enter an address above, or open one of the servers running in your workspaces.</p><ul class="browser-servers" aria-label="Local servers"></ul>';
 const list=start.querySelector<HTMLElement>('.browser-servers')!;
 const failure=document.createElement('div');failure.className='browser-error';failure.setAttribute('role','alert');failure.hidden=true;
 failure.innerHTML='<strong></strong><p></p><div class="browser-error-actions"><button type="button" data-action="retry">Try again</button><button type="button" data-action="system">Open in system browser</button></div>';
 viewport.append(start,failure);host.replaceChildren(toolbar,progress,viewport);
 let view:WebviewElement|undefined,ready=false,destroyed=false,frame=0,placed='',state:BrowserState={url:initialUrl,title:'',favicon:''};
 const publish=(patch:Partial<BrowserState>)=>{state={...state,...patch};onState(state);};
 function syncControls(){
  let canBack=false,canForward=false;
  if(view&&ready){try{canBack=view.canGoBack();canForward=view.canGoForward();}catch{}}
  back.disabled=!canBack;forward.disabled=!canForward;external.disabled=!state.url;devtools.disabled=!view;
 }
 function setLoading(loading:boolean){
  progress.hidden=!loading;reload.dataset.action=loading?'stop':'reload';reload.title=loading?'Stop':'Reload';reload.setAttribute('aria-label',reload.title);
  reload.replaceChildren(icon(loading?'close':'refresh'));
 }
 function showFailure(code:number,description:string,url:string){
  const detail=describeLoadError(code,description);
  failure.querySelector('strong')!.textContent=detail.title;failure.querySelector('p')!.textContent=`${detail.detail} (${url})`;failure.hidden=false;
 }
 function attach(url:string){
  const element=document.createElement('webview') as WebviewElement;
  element.setAttribute('partition',BROWSER_PARTITION);element.setAttribute('allowpopups','');element.className='browser-view';placed='';
  element.addEventListener('dom-ready',()=>{ready=true;syncControls();});
  element.addEventListener('did-start-loading',()=>{failure.hidden=true;setLoading(true);});
  element.addEventListener('did-stop-loading',()=>{setLoading(false);syncControls();});
  const navigated=(event:Event)=>{const {url:next,isMainFrame}=event as NavigationEvent;if(isMainFrame===false)return;address.value=next;publish({url:next});syncControls();};
  element.addEventListener('did-navigate',navigated);element.addEventListener('did-navigate-in-page',navigated);
  element.addEventListener('page-title-updated',event=>publish({title:(event as Event&{title:string}).title}));
  element.addEventListener('page-favicon-updated',event=>{const icons=(event as Event&{favicons:string[]}).favicons;publish({favicon:icons.find(value=>/^https?:/.test(value))||''});});
  element.addEventListener('did-fail-load',event=>{const failed=event as Event&{errorCode:number;errorDescription:string;validatedURL:string;isMainFrame:boolean};if(failed.errorCode===-3||!failed.isMainFrame)return;showFailure(failed.errorCode,failed.errorDescription,failed.validatedURL);});
  element.addEventListener('focus',onFocus);
  element.src=url;view=element;webviewLayer().append(element);start.hidden=true;
 }
 // Follows the viewport, and hides (without unloading) the page while its pane is not on screen or the error screen covers it.
 function place(){
  frame=requestAnimationFrame(place);
  if(!view)return;
  const rect=viewport.getBoundingClientRect(),shown=viewport.isConnected&&rect.width>0&&rect.height>0&&failure.hidden;
  const next=shown?`${rect.left}|${rect.top}|${rect.width}|${rect.height}`:'hidden';
  if(next===placed)return;placed=next;
  if(shown)Object.assign(view.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,visibility:'visible'});else view.style.visibility='hidden';
 }
 frame=requestAnimationFrame(place);
 function navigate(input:string){
  const url=sanitizeUrl(input);if(!url)return;
  address.value=url;failure.hidden=true;publish({url,title:'',favicon:''});
  if(isOwnServer(url,window.location)){showFailure(-20,'ERR_BLOCKED_BY_CLIENT',url);syncControls();return;}
  if(view){void view.loadURL(url).catch((error:unknown)=>{const message=String((error as Error)?.message||error),code=Number(/\((-\d+)\)/.exec(message)?.[1]);if(code&&code!==-3&&failure.hidden)showFailure(code,message,url);});}else attach(url);
  syncControls();
 }
 async function showServers(){
  let servers:BrowserServer[]=[];try{servers=await loadServers();}catch{}
  if(destroyed)return;
  list.replaceChildren(...servers.map(server=>{const item=document.createElement('li'),open=document.createElement('button');open.type='button';open.className='browser-server';open.textContent=server.label;open.title=server.url;open.onclick=()=>navigate(server.url);item.append(open);return item;}));
  list.hidden=!servers.length;
 }
 form.onsubmit=event=>{event.preventDefault();navigate(address.value);};
 address.onfocus=()=>address.select();
 toolbar.addEventListener('click',event=>{
  const action=(event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
  if(!action||!view)return;
  if(action==='back'&&ready&&view.canGoBack())view.goBack();
  else if(action==='forward'&&ready&&view.canGoForward())view.goForward();
  else if(action==='reload')view.reload();
  else if(action==='stop')view.stop();
  else if(action==='devtools'&&ready)view.openDevTools();
 });
 external.onclick=()=>{if(state.url)openExternal(state.url);};
 failure.addEventListener('click',event=>{
  const action=(event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
  if(action==='retry'&&view){failure.hidden=true;view.reload();}
  else if(action==='system'&&state.url)openExternal(state.url);
 });
 setLoading(false);syncControls();
 if(initialUrl)navigate(initialUrl);else void showServers();
 return {navigate,focusAddress(){address.focus();},destroy(){destroyed=true;cancelAnimationFrame(frame);view?.remove();view=undefined;}};
}
