export interface AppNotification {id:string;title:string;body:string;silent:boolean;allowFocused:boolean}
export interface NotificationDelivery {status:'sent'|'unavailable'|'suppressed'|'error';message?:string}
