export function attachBranchSuggestions(input:HTMLInputElement){
 const wrapper=document.createElement('div');wrapper.className='composer-source-field';input.replaceWith(wrapper);wrapper.append(input);
 const popup=document.createElement('div');popup.id='composer-branch-options';popup.className='composer-branch-options';popup.role='listbox';popup.setAttribute('aria-label','Available branches');popup.hidden=true;wrapper.append(popup);
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',popup.id);input.setAttribute('aria-expanded','false');
 let branches:string[]=[],filtered:string[]=[],active=-1;
 const label=(ref:string)=>ref.replace(/^refs\/remotes\//,'');
 function close(){popup.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
 function highlight(){
  const options=popup.querySelectorAll<HTMLElement>('[role=option]');
  options.forEach((option,index)=>option.setAttribute('aria-selected',String(index===active)));
  if(active>=0){input.setAttribute('aria-activedescendant',options[active]!.id);options[active]!.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
 }
 function choose(index:number){input.value=label(filtered[index]!);input.dispatchEvent(new Event('input',{bubbles:true}));close();input.focus();}
 function render(){
  if(branches.some(ref=>label(ref)===input.value.trim())){close();return;}
  filtered=branches.filter(ref=>label(ref).toLowerCase().includes(input.value.trim().toLowerCase()));active=-1;popup.replaceChildren();
  for(const remote of [false,true]){
   const rows=filtered.map((ref,index)=>({ref,index})).filter(({ref})=>ref.startsWith('refs/remotes/')===remote);if(!rows.length)continue;
   const heading=document.createElement('div');heading.className='composer-branch-group';heading.textContent=remote?'Remote branches':'Local branches';heading.setAttribute('role','presentation');popup.append(heading);
   for(const {ref,index} of rows){
    const option=document.createElement('div');option.role='option';option.id=`composer-branch-${index}`;option.className='composer-branch-option';option.setAttribute('aria-selected','false');
    const name=document.createElement('span');name.textContent=label(ref);const badge=document.createElement('small');badge.textContent=remote?'Remote':'Local';option.append(name,badge);
    option.onpointerdown=event=>event.preventDefault();option.onclick=()=>choose(index);popup.append(option);
   }
  }
  popup.hidden=!filtered.length;input.setAttribute('aria-expanded',String(!popup.hidden));input.removeAttribute('aria-activedescendant');
 }
 let blurTimer:ReturnType<typeof setTimeout>|undefined;
 input.addEventListener('focus',()=>{clearTimeout(blurTimer);render();});input.addEventListener('input',render);
 // Let the click finish before collapsing the suggestion rows below the input.
 input.addEventListener('blur',()=>{blurTimer=setTimeout(close,150);});
 input.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();if(popup.hidden)render();if(!filtered.length)return;
   active=event.key==='ArrowDown'?(active+1)%filtered.length:active<=0?filtered.length-1:active-1;highlight();
  }else if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey&&!popup.hidden&&active>=0){event.preventDefault();choose(active);}
  else if(event.key==='Escape'&&!popup.hidden){event.preventDefault();event.stopPropagation();close();}
 });
 return {setBranches(values:string[]){branches=values;if(document.activeElement===input)render();else close();}};
}
