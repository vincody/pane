/** Stable hue for a project's avatar, derived from its name. */
export const avatarHue=(name:string)=>[...name].reduce((hash,char)=>(hash*31+char.charCodeAt(0))%360,7);
export const avatarLetter=(name:string)=>name.trim().charAt(0).toUpperCase()||'?';
