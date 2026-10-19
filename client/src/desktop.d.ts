import type {DesktopUpdateState} from '../../shared/desktop-updates.ts';
import type {AppNotification,NotificationDelivery} from '../../shared/desktop-notifications.ts';
import type {ClipboardPaste} from '../../shared/desktop-clipboard.ts';
interface DesktopUpdates {
 updates:(action:'state'|'check'|'download'|'install'|'update'|'automatic',value?:boolean)=>Promise<DesktopUpdateState>;
 onUpdateState:(callback:(state:DesktopUpdateState)=>void)=>(()=>void);
}
declare global {
 interface Window {paneDesktop?:DesktopUpdates&{platform:string;backendId:string;readClipboard:()=>Promise<ClipboardPaste>;writeClipboardText:(text:string)=>Promise<void>;notificationVersion?:number;updateFlowVersion?:number;browserVersion?:number;onDialog?:(callback:(request:{id:string;type:string;message:string;detail:string;buttons:string[];defaultId:number;cancelId:number})=>Promise<number>)=>void;onBrowserOpen?:(callback:(url:string)=>void)=>void;windowControl:(action:'minimize'|'maximize'|'close'|'menu'|'state')=>Promise<unknown>;onWindowState:(callback:(state:{maximized:boolean;fullscreen:boolean;focused:boolean})=>void)=>(()=>void);onCheckpoint:(callback:()=>{dirty:number;terminals:number;busy:boolean;saved:boolean})=>void;notify:(value:AppNotification)=>Promise<NotificationDelivery>;onNotificationClick:(callback:(id:string)=>void)=>void}}
}
