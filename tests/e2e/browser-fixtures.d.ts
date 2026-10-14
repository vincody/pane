export {};
declare global {
 interface Window {
  __oldMessage:Element|null;
  __workflow:Element|null;
  __action:Element|null;
  __final:Element|null;
  __tones:number;
  bad?:boolean;
 }
}
