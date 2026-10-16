import CodeBlock from '@tiptap/extension-code-block';

// Same node as Tiptap's code block, with the Copy button the preview shows.
export const LiveCodeBlock=CodeBlock.extend({
 addNodeView(){
  return ({node})=>{
   let current=node;
   const dom=document.createElement('pre'),code=document.createElement('code'),button=document.createElement('button');
   dom.className='markdown-code-block';
   const language=(value:typeof node)=>{const name=String(value.attrs.language||'');code.className=name?`${this.options.languageClassPrefix}${name}`:'';};language(node);
   dom.append(code);
   button.type='button';button.className='code-copy-button';button.contentEditable='false';button.textContent='Copy';button.setAttribute('aria-label','Copy code');
   // Keep the caret where it is while the button is pressed.
   button.onmousedown=event=>event.preventDefault();
   let timer:ReturnType<typeof setTimeout>|undefined;
   button.onclick=async()=>{
    try{await navigator.clipboard.writeText(current.textContent);button.textContent='Copied';button.setAttribute('aria-label','Code copied');}
    catch{button.textContent='Copy failed';button.setAttribute('aria-label','Copy failed. Select the code to copy manually.');}
    clearTimeout(timer);timer=setTimeout(()=>{button.textContent='Copy';button.setAttribute('aria-label','Copy code');},1800);
   };
   dom.append(button);
   return {
    dom,contentDOM:code,
    // Changing the button label must not make ProseMirror redraw the block.
    ignoreMutation(mutation){return mutation.type!=='selection'&&!code.contains(mutation.target);},
    update(updated){if(updated.type!==current.type)return false;current=updated;language(updated);return true;},
    destroy(){clearTimeout(timer);},
   };
  };
 },
});
