const ESCAPES=/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ADDRESS=/https?:\/\/[^\s<>"'`\x00-\x1f\x7f]+/g;
const PRIVATE=/^(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
export function isLocalHost(hostname:string){
 const host=hostname.replace(/^\[|\]$/g,'').toLowerCase();
 return host==='localhost'||host.endsWith('.localhost')||host==='0.0.0.0'||host==='::1'||/^127\.\d+\.\d+\.\d+$/.test(host)||PRIVATE.test(host);
}
/** An http(s) address on this machine or its local network, tidied up, or null. */
export function normalizeLocalAddress(raw:string){
 try{
  const url=new URL(raw.replace(/[),.;:!?\]}>]+$/,''));
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!isLocalHost(url.hostname))return null;
  if(url.hostname==='0.0.0.0')url.hostname='localhost';
  url.hash='';return url.href;
 }catch{return null;}
}
export function stripTerminalEscapes(text:string){return text.replace(ESCAPES,'');}
const serverKey=(url:string)=>{const parsed=new URL(url);return `${parsed.protocol}${parsed.port||(parsed.protocol==='https:'?'443':'80')}`;};
/**
 * Finds local web addresses in terminal output once per server (protocol and port), however the output is chunked.
 * An address is only reported once something follows it, so a URL split across two chunks is never reported half-way.
 */
export function createAddressDetector(){
 let tail='';const seen=new Set<string>();
 return {
  push(data:string){
   const text=tail+stripTerminalEscapes(data);tail=text.slice(-1024);
   const found:string[]=[];
   for(const match of text.matchAll(ADDRESS)){
    if(match.index+match[0].length>=text.length)continue;
    const address=normalizeLocalAddress(match[0]);if(!address)continue;
    const key=serverKey(address);if(seen.has(key))continue;
    seen.add(key);if(seen.size>64)seen.delete(seen.values().next().value!);found.push(address);
   }
   return found;
  },
 };
}
