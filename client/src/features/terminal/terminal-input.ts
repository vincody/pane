export function trackPromptInput(data:string, draft = '') {
  let submitted=false;
  // Ignore navigation/control sequences, including Shift+Arrow. Keep pasted text.
  const text=data.replace(/\x1b\[200~|\x1b\[201~/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\x1b[^\[]/g,'');
  for(const char of text){
    if(char==='\r'||char==='\n'){const prompt=draft.trim();submitted ||= Boolean(prompt && !prompt.startsWith('/'));draft='';}
    else if(char==='\x7f'||char==='\b')draft=draft.slice(0,-1);
    else if(char==='\x03'||char==='\x15')draft='';
    else if(char>=' ')draft+=char;
  }
  return {draft,submitted};
}
