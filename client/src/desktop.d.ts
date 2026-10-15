import type {DesktopUpdateState} from '../../shared/desktop-updates.ts';
interface DesktopUpdates {
 updates:(action:'state'|'check'|'download'|'install'|'automatic',value?:boolean)=>Promise<DesktopUpdateState>;
 onUpdateState:(callback:(state:DesktopUpdateState)=>void)=>(()=>void);
}
declare global {
 interface Window {paneDesktop?:DesktopUpdates&{platform:string;backendId:string;windowControl:(action:'minimize'|'maximize'|'close'|'menu'|'state')=>Promise<unknown>;onWindowState:(callback:(state:{maximized:boolean;fullscreen:boolean;focused:boolean})=>void)=>(()=>void);onCheckpoint:(callback:()=>{dirty:number;terminals:number;busy:boolean;saved:boolean})=>void;notify:(value:{id:string;title:string;body:string})=>void;onNotificationClick:(callback:(id:string)=>void)=>void}}
}
