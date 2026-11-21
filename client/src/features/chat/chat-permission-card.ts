/** The cards Claude's requests turn into: a permission ask, a multiple-choice question, and a plan to approve. */
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import type {ChatClientMessage,ChatPermissionMode} from '../../../../shared/contracts.ts';

export interface PermissionRow {id:string;tool:string;input:unknown;blockedPath?:string}
interface Deps {send:(message:ChatClientMessage)=>void;icon:(name:string)=>SVGElement}
interface Question {question:string;header?:string;multiSelect?:boolean;options:{label:string;description?:string}[]}

const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='')=>{const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
const str=(value:unknown)=>typeof value==='string'?value:'';
const PHRASES:Record<string,string>={Bash:'run a command',PowerShell:'run a command',Edit:'edit a file',MultiEdit:'edit a file',Write:'write a file',NotebookEdit:'edit a notebook',Read:'read a file',WebFetch:'fetch a web page',WebSearch:'search the web',Grep:'search your files',Glob:'search your files'};

export const isQuestionTool=(tool:string)=>tool==='AskUserQuestion';
export const isPlanTool=(tool:string)=>tool==='ExitPlanMode';

function button(label:string,onClick:()=>void,kind:''|'primary'=''){const node=el('button',`chat-permission-button${kind?` ${kind}`:''}`,label);node.type='button';node.onclick=onClick;return node;}
function lock(card:HTMLElement){for(const control of card.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input'))control.disabled=true;card.classList.add('answered');}

function approvalCard(row:PermissionRow,{send,icon}:Deps){
 const card=el('div','chat-row chat-permission');card.setAttribute('role','group');
 const input=record(row.input),detail=str(input.command)||str(input.file_path)||str(input.path)||str(input.url)||str(input.pattern)||(row.input===undefined?'':JSON.stringify(row.input,null,2));
 const head=el('div','chat-permission-head');head.append(icon('shield'),el('strong','',`Claude wants to ${PHRASES[row.tool]||`use ${row.tool}`}`));
 card.append(head);
 const body=[detail,row.blockedPath?`Outside the workspace: ${row.blockedPath}`:''].filter(Boolean).join('\n');
 if(body){const pre=el('pre','chat-permission-detail');pre.textContent=body;card.append(pre);}
 const actions=el('div','chat-permission-actions');
 const answer=(decision:'allow'|'always'|'deny')=>()=>{send({type:'answer-permission',id:row.id,decision});lock(card);};
 actions.append(button('Deny',answer('deny')),button('Always allow',answer('always')),button('Allow',answer('allow'),'primary'));
 card.append(actions);return card;
}

function questionCard(row:PermissionRow,{send,icon}:Deps){
 const raw=record(row.input).questions;
 const questions=(Array.isArray(raw)?raw:[]).map(record).filter(item=>str(item.question)&&Array.isArray(item.options)) as unknown as Question[];
 const card=el('div','chat-row chat-permission chat-question');card.setAttribute('role','group');
 const head=el('div','chat-permission-head');head.append(icon('help'),el('strong','',questions.length>1?'Claude has a few questions':'Claude has a question'));card.append(head);
 const picked=questions.map(()=>new Set<string>()),others=questions.map(()=>'');
 const submit=button('Send answers',()=>{
  const answers:Record<string,string>={};
  questions.forEach((question,index)=>{const values=[...picked[index],...(others[index].trim()?[others[index].trim()]:[])];answers[question.question]=question.multiSelect?values.join(', '):others[index].trim()||values[0]||'';});
  send({type:'answer-permission',id:row.id,decision:'allow',answers});lock(card);
 },'primary');
 const refresh=()=>{submit.disabled=!questions.every((_,index)=>picked[index].size>0||others[index].trim().length>0);};
 questions.forEach((question,index)=>{
  const block=el('div','chat-question-block');
  if(question.header)block.append(el('span','chat-question-chip',question.header));
  block.append(el('div','chat-question-text',question.question));
  const list=el('div','chat-question-options');list.setAttribute('role',question.multiSelect?'group':'radiogroup');
  const rows:{label:string;node:HTMLButtonElement}[]=[];
  const other=el('input','chat-question-other');other.type='text';other.placeholder='Other…';other.setAttribute('aria-label',`Other answer for ${question.question}`);
  const paint=()=>{for(const item of rows)item.node.setAttribute('aria-pressed',String(picked[index].has(item.label)));};
  for(const option of question.options){
   const node=el('button','chat-question-option');node.type='button';node.setAttribute('role',question.multiSelect?'checkbox':'radio');
   const mark=el('span','chat-question-mark');mark.dataset.kind=question.multiSelect?'box':'dot';
   const words=el('span','chat-question-words');words.append(el('span','chat-question-label',option.label));if(option.description)words.append(el('span','chat-question-note',option.description));
   node.append(mark,words);rows.push({label:option.label,node});
   node.onclick=()=>{
    const set=picked[index];
    if(question.multiSelect){if(set.has(option.label))set.delete(option.label);else set.add(option.label);}
    else{set.clear();set.add(option.label);others[index]='';other.value='';}
    paint();refresh();
   };
   list.append(node);
  }
  other.oninput=()=>{others[index]=other.value;if(!question.multiSelect&&other.value.trim()){picked[index].clear();paint();}refresh();};
  other.onkeydown=event=>{if(event.key==='Enter'&&!submit.disabled){event.preventDefault();submit.click();}};
  list.append(other);block.append(list);card.append(block);paint();
 });
 const actions=el('div','chat-permission-actions');actions.append(button('Skip',()=>{send({type:'answer-permission',id:row.id,decision:'deny'});lock(card);}),submit);card.append(actions);refresh();
 return card;
}

function planCard(row:PermissionRow,{send,icon}:Deps){
 const card=el('div','chat-row chat-permission chat-plan');card.setAttribute('role','group');
 const head=el('div','chat-permission-head');head.append(icon('check'),el('strong','',"Claude's plan"));card.append(head);
 const plan=str(record(row.input).plan);
 if(plan){const body=el('div','chat-md chat-plan-body');body.innerHTML=DOMPurify.sanitize(marked.parse(plan,{async:false}) as string);card.append(body);}
 const approve=(mode:ChatPermissionMode)=>()=>{send({type:'answer-permission',id:row.id,decision:'allow'});send({type:'set-permission-mode',mode});lock(card);};
 const actions=el('div','chat-permission-actions');
 actions.append(button('Keep planning',()=>{send({type:'answer-permission',id:row.id,decision:'deny'});lock(card);}),button('Approve, ask before edits',approve('default')),button('Approve and auto-accept edits',approve('acceptEdits'),'primary'));
 card.append(actions);return card;
}

export function buildPermissionCard(row:PermissionRow,deps:Deps):HTMLElement{
 return isQuestionTool(row.tool)?questionCard(row,deps):isPlanTool(row.tool)?planCard(row,deps):approvalCard(row,deps);
}
