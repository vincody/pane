export type NotificationSoundMode='app'|'system'|'off';
export function readNotificationSoundMode(stored:Record<string,unknown>):NotificationSoundMode{
 if(['app','system','off'].includes(String(stored.soundMode)))return stored.soundMode as NotificationSoundMode;
 return stored.sound===false?'off':'app';
}

// One player prevents overlapping sounds during bursts of agent events.
export function createNotificationSoundPlayer(){
 let audio:HTMLAudioElement|undefined,sequence=0;
 function stop(){++sequence;if(audio){audio.pause();audio.currentTime=0;}}
 async function play(kind:'done'|'blocked'|'error'){
  stop();const request=sequence;
  try{
   audio??=new Audio();audio.preload='auto';audio.src=`/sounds/${kind==='done'?'done':'request'}.mp3`;
   await audio.play();return true;
  }catch{return request!==sequence;}
 }
 return {play,stop};
}
