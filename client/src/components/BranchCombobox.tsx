import {useId,useRef,useState} from 'react';

/** Editable branch picker: keep arbitrary refs valid, as with the former datalist. */
export function BranchCombobox({value,options,disabled,onChange}:{value:string;options:string[];disabled?:boolean;onChange:(value:string)=>void}){
 const id=useId(),input=useRef<HTMLInputElement>(null);
 const [open,setOpen]=useState(false),[filter,setFilter]=useState(''),[active,setActive]=useState(0);
 const matches=[...new Set(options)].filter(option=>option.toLowerCase().includes(filter.toLowerCase()));
 const index=Math.min(active,Math.max(0,matches.length-1));
 const choose=(branch:string)=>{onChange(branch);setOpen(false);setFilter('');input.current?.focus();};
 return <div className="branch-combobox" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);setFilter('');}}}>
  <div className="branch-combobox-control">
   <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10c0 6-12 3-12 10"/></svg>
   <input ref={input} aria-label="PR base branch" role="combobox" aria-autocomplete="list" aria-expanded={open&&!disabled} aria-controls={`${id}-options`} aria-activedescendant={open&&matches.length?`${id}-${index}`:undefined} autoComplete="off" value={value} maxLength={200} required disabled={disabled}
    onClick={()=>{setOpen(true);setFilter('');}}
    onChange={event=>{onChange(event.target.value);setFilter(event.target.value);setActive(0);setOpen(true);}}
    onKeyDown={event=>{
     if(event.nativeEvent.isComposing)return;
     if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();setOpen(true);setActive(!open?(event.key==='ArrowDown'?0:matches.length-1):(index+(event.key==='ArrowDown'?1:-1)+matches.length)%Math.max(1,matches.length));
     }else if(event.key==='Enter'&&open){event.preventDefault();if(matches[index])choose(matches[index]);else setOpen(false);}
     else if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);setFilter('');}
     else if(event.key==='Tab')setOpen(false);
    }}/>
   <button type="button" aria-label="Choose base branch" aria-expanded={open&&!disabled} aria-controls={`${id}-options`} disabled={disabled} onClick={()=>{setOpen(!open);setFilter('');setActive(Math.max(0,options.indexOf(value)));input.current?.focus();}}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m6 8 4 4 4-4"/></svg></button>
  </div>
  {open&&!disabled&&<div className="branch-combobox-popup">
   <div className="branch-combobox-heading">Base branch <span>Type to filter</span></div>
   <div id={`${id}-options`} role="listbox" aria-label="Base branches" onMouseDown={event=>event.preventDefault()}>
    {matches.map((branch,i)=><div key={branch} id={`${id}-${i}`} role="option" aria-selected={branch===value} data-active={i===index} onMouseEnter={()=>setActive(i)} onClick={()=>choose(branch)}><span>{branch}</span>{branch===value&&<span aria-hidden="true">✓</span>}</div>)}
    {!matches.length&&<p role="status">No matching branches. You can enter a branch name.</p>}
   </div>
  </div>}
 </div>;
}
