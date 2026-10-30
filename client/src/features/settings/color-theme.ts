export function setupColorTheme(){
 const row=document.createElement('div');row.className='setting-row';
 row.innerHTML='<div><strong>Color theme</strong><small>Light or dark glass surfaces with blue accents</small></div><select aria-label="Color theme"><option value="light">Light</option><option value="dark">Dark</option></select>';
 document.querySelector('.settings-footnote')!.before(row);
 const control=row.querySelector<HTMLSelectElement>('select')!;
 control.value=document.documentElement.dataset.theme==='dark'?'dark':'light';
 function apply(theme:string){
  const chosen=theme==='dark'?'dark':'light';
  document.documentElement.dataset.theme=chosen;control.value=chosen;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',chosen);
 }
 apply(control.value);
 control.onchange=()=>{apply(control.value);try{localStorage.setItem('ai-web.theme',control.value);}catch{}};
}
