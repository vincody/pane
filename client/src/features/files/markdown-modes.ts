import {marked,type TokensList,type Token} from 'marked';
import {decodeHTML} from 'entities';
import type {OpenDocument,FileView} from './documents.ts';
import {isLargeModel} from './large-file.ts';

export const isMarkdown=(path:string)=>/\.(md|markdown)$/i.test(path);
export function splitMarkdownSource(source:string){
 const match=/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source);
 return {frontmatter:match?.[0]||'',body:source.slice(match?.[0].length||0),eol:source.includes('\r\n')?'\r\n':'\n',trailing:source.endsWith('\n')};
}
export function liveMarkdownReason(path:string,source:string):string|null{
 if(!isMarkdown(path))return 'Live Editor is available for Markdown files.';
 if(new TextEncoder().encode(source).length>256*1024)return 'This file is too large for Live Editor. Use Source to keep editing.';
 const {body}=splitMarkdownSource(source),tokens=marked.lexer(body);
 if(Object.keys(tokens.links).length)return 'Use Source for reference links and footnotes to preserve their definitions.';
 let reason:string|null=null;
 marked.walkTokens(tokens,token=>{if(token.type==='html')reason='Use Source to preserve embedded HTML or JSX.';if((token.type==='text'||token.type==='paragraph')&&/(?:^|\n)\s*(?:\[\^|\$\$|\+\+\+)/.test(token.raw))reason='Use Source to preserve footnotes, math or custom front matter.';});
 return reason;
}
// Compare parsed meaning rather than formatting (e.g. list marker or emphasis style).
export function markdownMeaning(source:string):string{
 // Inline marks are a set: **[label](url)** and [**label**](url) render identically.
 function inline(values:Token[],marks:string[]=[]):unknown[]{
  const result:{text?:string;marks?:string[];node?:unknown}[]=[];
  function visit(values:Token[],active:string[]){for(const value of values){
   const token=value as unknown as Record<string,unknown>;
   if(['strong','em','del','link'].includes(value.type)){
    const mark=JSON.stringify([value.type,token.href??null,token.title??null]);visit(token.tokens as Token[],[...active,mark].sort());continue;
   }
   if(value.type==='text'&&Array.isArray(token.tokens)){visit(token.tokens as Token[],active);continue;}
   if(value.type==='text'||value.type==='escape'){
    const text=(value.type==='escape'?String(token.text):decodeHTML(String(token.text))).replace(/\r?\n/g,' '),last=result.at(-1);
    if(last?.text!==undefined&&JSON.stringify(last.marks)===JSON.stringify(active))last.text+=text;else result.push({text,marks:active});
   }else result.push({node:tokens([value]),marks:active});
  }}
  visit(values,marks);return result;
 }
 function tokens(values:Token[]|TokensList):unknown[]{
  const result:unknown[]=[];
  for(const value of values){
   if(value.type==='space')continue;
   const token=value as unknown as Record<string,unknown>,children=Array.isArray(token.tokens)?token.tokens as Token[]:undefined;
   const item:Record<string,unknown>={type:value.type==='text'&&children?'paragraph':value.type};
   for(const key of ['depth','href','title','lang','ordered','start','task','checked','align'])if(token[key]!==undefined&&token[key]!==null&&token[key]!==false&&token[key]!=='')item[key]=token[key];
   if(children)item.tokens=inline(children);else if(typeof token.text==='string')item.text=token.text;
   if(value.type==='blockquote'||value.type==='list_item')if(children)item.tokens=tokens(children);
   if(Array.isArray(token.items))item.items=tokens(token.items as Token[]);
   if(value.type==='table'){const table=value as import('marked').Tokens.Table;item.header=table.header.map(cell=>inline(cell.tokens));item.rows=table.rows.map(row=>row.map(cell=>inline(cell.tokens)));}
   result.push(item);
  }
  return result;
 }
 return JSON.stringify(tokens(marked.lexer(source)));
}
export function chooseFileView(doc:OpenDocument|null,requested:string):FileView{
 if(doc?.kind==='image')return 'preview';
 // Preview and Live Editor would render the whole file, which freezes the tab.
 if(doc?.model&&isLargeModel(doc.model))return 'editor';
 const content=doc?.kind==='text'&&doc.model?doc.model.getValue():null;
 const compatible=content!==null&&!doc?.liveError&&!liveMarkdownReason(doc!.path,content)&&eligibility.get(content)?.reason===null;
 if(requested==='preview')return compatible?'live':'preview';
 return requested==='live'&&content!==null&&!doc?.liveError&&!liveMarkdownReason(doc!.path,content)&&eligibility.get(content)?.reason==null?'live':'editor';
}
const eligibility=new Map<string,{reason?:string|null;pending?:Promise<void>}>();
const checks=new WeakMap<HTMLElement,object>();
function richEligibility(source:string){
 let entry=eligibility.get(source);if(entry)return entry;
 entry={};eligibility.set(source,entry);if(eligibility.size>20)eligibility.delete(eligibility.keys().next().value!);
 const result=entry;result.pending=import('./rich-markdown-editor.ts').then(module=>{result.reason=module.richMarkdownReason(source);}).catch(()=>{result.reason='Live Editor could not load. Reopen this file to try again.';});return result;
}
export function syncFileModeButtons(container:HTMLElement,doc:OpenDocument|null,view:FileView,choose:(view:FileView)=>void,attribute='view'){
 const selector=`button[data-${attribute}]`,source=container.querySelector<HTMLButtonElement>(`button[data-${attribute}=editor]`)!;
 const markdown=Boolean(doc&&isMarkdown(doc.path));source.textContent=markdown?'Source':'Editor';
 const largeFile=Boolean(doc?.model&&isLargeModel(doc.model));
 const content=doc?.kind==='text'&&doc.model&&!largeFile?doc.model.getValue():null;
 let reason=doc?.liveError||(largeFile?'Large file.':content!==null?liveMarkdownReason(doc!.path,content):'Choose a text file.');
 const check=markdown&&!reason&&content!==null?richEligibility(content):undefined,pending=Boolean(check&&check.reason===undefined);reason=reason||check?.reason||null;
 const ticket={};checks.set(container,ticket);
 if(pending)void check!.pending!.then(()=>{if(checks.get(container)===ticket&&container.isConnected&&doc?.model?.getValue()===content){if(view==='preview'&&check!.reason===null)choose('live');else syncFileModeButtons(container,doc,view,choose,attribute);}});
 const preview=container.querySelector<HTMLButtonElement>(`button[data-${attribute}=preview]`);if(preview)preview.hidden=largeFile||Boolean(markdown&&!reason&&!pending);
 source.title=markdown&&reason?reason:'';
 let live=container.querySelector<HTMLButtonElement>(`button[data-${attribute}=live]`);
 if(markdown&&!reason){if(!live){live=document.createElement('button');live.type='button';live.dataset[attribute]='live';live.textContent='Live Editor';source.after(live);}}
 else live?.remove();
 if(live){live.disabled=pending;live.title=pending?'Checking Markdown compatibility…':'';}
 for(const button of container.querySelectorAll<HTMLButtonElement>(selector)){const selected=button.dataset[attribute]===view;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));button.onclick=()=>choose(button.dataset[attribute] as FileView);}
}
