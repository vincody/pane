import type {AppNotification,NotificationDelivery} from '../../../../shared/desktop-notifications.ts';

export function isNotificationWindowFocused(){
 const focused=document.documentElement.dataset.windowFocused;
 if(window.paneDesktop&&focused!==undefined)return focused==='true';
 return !document.hidden&&document.hasFocus();
}

const restartMessage='Quit Pane from the tray, then reopen it to enable native notifications. Reloading the window does not restart the app.';
export function createSystemNotifications(onClick:(id:string)=>void){
 let subscribed:typeof window.paneDesktop;
 function subscribe(){const desktop=window.paneDesktop;if(desktop?.notificationVersion===1&&subscribed!==desktop){desktop.onNotificationClick(onClick);subscribed=desktop;}}
 subscribe();
 async function send(value:AppNotification):Promise<NotificationDelivery>{
  const desktop=window.paneDesktop;
  if(!desktop)return {status:'unavailable',message:'System notifications are available in the Pane desktop app.'};
  if(desktop.notificationVersion!==1)return {status:'unavailable',message:restartMessage};
  try{
   subscribe();const result=await desktop.notify(value);
   return result||{status:'unavailable',message:restartMessage};
  }catch(error){
   if(error instanceof Error&&/No handler registered|pane:notify/i.test(error.message))return {status:'unavailable',message:restartMessage};
   return {status:'error',message:'Could not send the app notification. Check your system notification settings and try again.'};
  }
 }
 return {send};
}
