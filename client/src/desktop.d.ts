import type {DesktopUpdateState} from '../../shared/desktop-updates.ts';
import type {AppNotification,NotificationDelivery} from '../../shared/desktop-notifications.ts';
interface DesktopUpdates {
 updates:(action:'state'|'check'|'download'|'install'|'automatic',value?:boolean)=>Promise<DesktopUpdateState>;
 onUpdateState:(callback:(state:DesktopUpdateState)=>void)=>(()=>void);
}
declare global {
 interface Window {paneDesktop?:DesktopUpdates&{platform:string;backendId:string;notificationVersion?:number;windowControl:(action:'minimize'|'maximize'|'close'|'menu'|'state')=>Promise<unknown>;onWindowState:(callback:(state:{maximized:boolean;fullscreen:boolean;focused:boolean})=>void)=>(()=>void);onCheckpoint:(callback:()=>{dirty:number;terminals:number;busy:boolean;saved:boolean})=>void;notify:(value:AppNotification)=>Promise<NotificationDelivery>;onNotificationClick:(callback:(id:string)=>void)=>void}}
}
