// Extract display-only activity from known tool records. Never evaluate tool input.
function literal(value) {
 try { return JSON.parse(value); } catch {}
 if(value.startsWith("'"))return value.slice(1,-1).replace(/\\'/g,"'").replace(/\\n/g,'\n').replace(/\\r/g,'\r');
 return null;
}
function patchActions(patch) {
 return [...String(patch).matchAll(/^\*\*\* (Add|Update|Delete) File:\s*(.+)$/gm)].map(match=>({action:match[1]==='Add'?'write':match[1]==='Delete'?'delete':'edit',target:match[2].trim()}));
}
export function toolActions(name, input) {
 const tool=String(name || '').split(/[.:]/).pop().toLowerCase();let data=input;
 if(typeof input==='string'){try{data=JSON.parse(input);}catch{}}
 if(['exec_command','shell_command','bash','shell'].includes(tool)) {
  const command=data?.cmd || data?.command;
  return typeof command==='string'?[{action:'run',target:command}]:[];
 }
 if(['edit','multiedit','write','read'].includes(tool)) {
  const file=data?.file_path || data?.path;
  return typeof file==='string'?[{action:tool==='write'?'write':tool==='read'?'read':'edit',target:file}]:[];
 }
 if(tool==='apply_patch')return patchActions(typeof input==='string'?input:data?.patch || data?.input || '');
 if(tool==='exec'&&typeof input==='string') {
  const actions=[];
  for(const match of input.matchAll(/tools\.exec_command\(\{\s*cmd\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)) {
   const command=literal(match[1]);if(command!==null)actions.push({action:'run',target:command});
  }
  for(const match of input.matchAll(/tools\.apply_patch\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)) { const patch=literal(match[1]);if(patch!==null)actions.push(...patchActions(patch)); }
  return actions;
 }
 return [];
}
export function resultState(output) {
 const states=[];
 const visit=(value,depth=0)=>{
  if(depth>8 || value==null)return;
  if(typeof value==='string'){
   try{visit(JSON.parse(value),depth+1);return;}catch{}
   if(/Process exited with code [1-9]|"exit_code"\s*:\s*[1-9]/.test(value))states.push('failed');
   if(/Script running|"session_id"\s*:\s*\d+/.test(value)&&!/"exit_code"\s*:\s*\d+/.test(value))states.push('running');
   return;
  }
  if(typeof value==='object'){
   if(value.isError===true||value.is_error===true)states.push('failed');
   if(Number.isInteger(value.exit_code))states.push(value.exit_code===0?'done':'failed');
   else if(value.session_id)states.push('running');
   for(const child of Object.values(value))visit(child,depth+1);
  }
 };
 visit(output);return states.includes('failed')?'failed':states.includes('running')?'running':'done';
}

export function executionHandles(value) {
 const found=new Set();const walk=(item,depth=0)=>{
  if(depth>8||item==null)return;
  if(typeof item==='string'){
   try{walk(JSON.parse(item),depth+1);}catch{}
   for(const match of item.matchAll(/(?:session_id|cell_id)["']?\s*:\s*["']?([a-zA-Z0-9_-]+)/g))found.add(match[1]);
   for(const match of item.matchAll(/Script running with cell ID\s+([a-zA-Z0-9_-]+)/g))found.add(match[1]);
  }else if(typeof item==='object'){
   for(const key of ['session_id','cell_id'])if(item[key])found.add(String(item[key]));
   for(const child of Object.values(item))walk(child,depth+1);
  }
 };walk(value);return [...found];
}


// Only correlate real orchestration calls, never tool examples inside shell strings.
export function polledExecutions(name,input){
 const tool=String(name || '').split(/[.:]/).pop();if(['wait','write_stdin'].includes(tool))return executionHandles(input);
 if(tool!=='exec'||typeof input!=='string')return [];
 const handles=new Set();
 const skipString=start=>{const quote=input[start];let end=start+1;for(;end<input.length;end++){if(input[end]==='\\'){end++;continue;}if(input[end]===quote)return end+1;}return end;};
 for(let index=0;index<input.length;){
  if(['"',"'",'`'].includes(input[index])){index=skipString(index);continue;}
  if(input.startsWith('//',index)){const end=input.indexOf('\n',index+2);index=end<0?input.length:end+1;continue;}
  if(input.startsWith('/*',index)){const end=input.indexOf('*/',index+2);index=end<0?input.length:end+2;continue;}
  const match=input.slice(index).match(/^tools\.(?:write_stdin|wait)\s*\(/);
  if(!match){index++;continue;}
  const start=index+match[0].length;let end=start,depth=1;
  for(;end<input.length&&depth;end++){if(['"',"'",'`'].includes(input[end])){end=skipString(end)-1;continue;}if(input[end]==='(')depth++;else if(input[end]===')')depth--;}
  for(const handle of executionHandles(input.slice(start,end-1)))handles.add(handle);index=end;
 }
 return [...handles];
}


export function commandOutput(value){
 const parts=[];let available=false;
 function visit(item,depth=0){if(depth>8||item==null)return;
  if(typeof item==='string'){try{visit(JSON.parse(item),depth+1);return;}catch{}
   const marker=item.indexOf('\nOutput:\n');if(marker>=0)item=item.slice(marker+9);else if(/^(?:Chunk ID:|Script running with cell ID|Script completed|Wall time:)/.test(item.trim()))return;
   available=true;parts.push(item);return;
  }
  if(Array.isArray(item)){for(const child of item)visit(child,depth+1);return;}
  if(typeof item==='object'){
   for(const key of ['output','stdout','stderr','aggregatedOutput'])if(typeof item[key]==='string'){available=true;parts.push(item[key]);}
   if(['text','input_text','output_text'].includes(item.type)&&typeof item.text==='string')visit(item.text,depth+1);
   if(item.content!=null)visit(item.content,depth+1);
  }
 }
 visit(value);const text=parts.filter(part=>part.length).join('\n').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');return {available,text:text.slice(-16000),truncated:text.length>16000};
}
export function appendCommandOutput(action,result,scope='command',separator='\n'){
 if(action.action!=='run'||!result.available)return;
 const text=(action.output || '')+(action.output&&result.text?separator:'')+result.text;action.output=text.slice(-16000);action.outputTruncated=Boolean(action.outputTruncated||result.truncated||text.length>16000);action.outputScope=scope;
}
