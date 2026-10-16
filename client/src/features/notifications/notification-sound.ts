export type NotificationSoundMode='app'|'system'|'off';
export type NotificationSoundKind='done'|'blocked'|'error';
export type NotificationSoundChoices=Record<NotificationSoundKind,string>;
export type NotificationSoundScope='all'|'each';
export const NO_SOUND='none';
export const NOTIFICATION_SOUNDS=[
 {id:'done',name:'Pane done',file:'done.mp3'},
 {id:'request',name:'Pane request',file:'request.mp3'},
 {id:'arcade',name:'Arcade',file:'arcade.mp3'},
 {id:'ping',name:'Ping',file:'ping.mp3'},
 {id:'quick-ping',name:'Quick ping',file:'quick-ping.mp3'},
 {id:'shamisen',name:'Shamisen',file:'shamisen.mp3'},
 {id:'doo-wap',name:'Doo-wap',file:'doo-wap.mp3'},
 {id:'agent-is-done',name:'Agent is done',file:'agent-is-done.mp3'},
 {id:'code-complete',name:'Code complete',file:'code-complete.mp3'},
 {id:'afrobeat',name:'Afrobeat',file:'afrobeat.mp3'},
 {id:'come-back',name:'Come back',file:'come-back.mp3'},
 {id:'shabalaba',name:'Shabalaba',file:'shabalaba.mp3'}
] as const;
export const DEFAULT_SOUND_CHOICES:NotificationSoundChoices={done:'done',blocked:'request',error:'request'};
export const DEFAULT_SOUND_VOLUME=100;

export function readNotificationSoundMode(stored:Record<string,unknown>):NotificationSoundMode{
 if(['app','system','off'].includes(String(stored.soundMode)))return stored.soundMode as NotificationSoundMode;
 return stored.sound===false?'off':'app';
}
export function readNotificationSoundChoices(stored:Record<string,unknown>):NotificationSoundChoices{
 const raw=stored.sounds&&typeof stored.sounds==='object'?stored.sounds as Record<string,unknown>:{};
 const choices={...DEFAULT_SOUND_CHOICES};
 for(const kind of ['done','blocked','error'] as const)if(validSoundId(raw[kind]))choices[kind]=raw[kind];
 return choices;
}
function validSoundId(value:unknown):value is string{return value===NO_SOUND||NOTIFICATION_SOUNDS.some(sound=>sound.id===value);}
export function readNotificationSoundScope(stored:Record<string,unknown>):NotificationSoundScope{return stored.soundScope==='all'?'all':'each';}
export function readNotificationSoundAll(stored:Record<string,unknown>):string{return validSoundId(stored.soundAll)?stored.soundAll:DEFAULT_SOUND_CHOICES.done;}
export function soundForKind(preferences:{soundScope:NotificationSoundScope;soundAll:string;sounds:NotificationSoundChoices},kind:NotificationSoundKind){
 return preferences.soundScope==='all'?preferences.soundAll:preferences.sounds[kind];
}
export function readNotificationVolume(stored:Record<string,unknown>):number{
 const volume=Number(stored.volume);
 return stored.volume!==undefined&&Number.isFinite(volume)?Math.min(100,Math.max(0,Math.round(volume))):DEFAULT_SOUND_VOLUME;
}

// One player prevents overlapping sounds during bursts of agent events.
export function createNotificationSoundPlayer(){
 let audio:HTMLAudioElement|undefined,sequence=0;
 function stop(){++sequence;if(audio){audio.pause();audio.currentTime=0;}}
 async function play(soundId:string,volume=DEFAULT_SOUND_VOLUME){
  stop();const request=sequence,sound=NOTIFICATION_SOUNDS.find(item=>item.id===soundId);
  if(!sound||volume<=0)return true;
  try{
   audio??=new Audio();audio.preload='auto';audio.src=`/sounds/${sound.file}`;audio.volume=Math.min(1,Math.max(0,volume/100));
   await audio.play();return true;
  }catch{return request!==sequence;}
 }
 return {play,stop};
}
