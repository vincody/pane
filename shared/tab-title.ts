/**
 * A short, stable tab name from a first prompt, as Orca derives it: first clause, links and markdown dropped,
 * leading filler such as "can you please" removed, capitalised, cut at a word boundary. Empty when nothing usable is left.
 */
const TITLE_MAX=40,TITLE_SCAN=512;
const FILLER=[/^(?:can|could|would)\s+you(?:\s+please)?\s+/i,/^please(?:\s+|$)/i,/^i\s+(?:want|need)\s+(?:you\s+)?to\s+/i,/^help\s+me(?:\s+to)?\s+/i,/^help\s+/i,/^let'?s\s+/i,/^we\s+need\s+to\s+/i,/^need\s+to\s+/i];
/**
 * A short, stable tab name from the first prompt, as Orca derives it: first clause, links and markdown dropped,
 * leading filler such as "can you please" removed, capitalised, cut at a word boundary.
 */
export function deriveTabTitle(text:string){
 const clause=text.slice(0,TITLE_SCAN).trim()
  .replace(/https?:\/\/\S+/gi,' ')
  .replace(/[`*_~#>[\]{}()]/g,' ')
  .replace(/^(?:issue|task|bug|feature|pr)\s*(?:#?\d+)?\s*[:-]\s*/i,'')
  .split(/[.!?;\n\r\u2028\u2029]/u)[0]?.trim();
 if(!clause)return '';
 let candidate=clause;
 for(let pass=0;pass<3;pass++){const before=candidate;for(const pattern of FILLER)candidate=candidate.replace(pattern,'');candidate=candidate.trim();if(candidate===before.trim())break;}
 candidate=candidate.replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
 if(!candidate)return '';
 candidate=candidate.replace(/\p{L}/u,letter=>letter.toLocaleUpperCase());
 if(candidate.length<=TITLE_MAX)return candidate;
 const slice=candidate.slice(0,TITLE_MAX).trim(),space=slice.lastIndexOf(' ');
 return space>=Math.floor(TITLE_MAX*.55)?slice.slice(0,space).trim():slice;
}
