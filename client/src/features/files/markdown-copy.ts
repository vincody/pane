export function addCodeCopyButtons(target:HTMLElement) {
  for(const code of target.querySelectorAll<HTMLElement>('pre > code')){
    const pre=code.parentElement!;pre.classList.add('markdown-code-block');
    const button=document.createElement('button');button.type='button';button.className='code-copy-button';button.textContent='Copy';button.setAttribute('aria-label','Copy code');
    let timer:ReturnType<typeof setTimeout>|undefined;
    button.onclick=async()=>{
      // Markdown code blocks end with a newline; copying it would run a pasted command in a terminal.
      try{await navigator.clipboard.writeText((code.textContent||'').replace(/\r?\n+$/,''));clearTimeout(timer);button.textContent='Copied';button.setAttribute('aria-label','Code copied');}
      catch{button.textContent='Copy failed';button.setAttribute('aria-label','Copy failed. Select the code to copy manually.');}
      timer=setTimeout(()=>{button.textContent='Copy';button.setAttribute('aria-label','Copy code');},1800);
    };
    pre.append(button);
  }
}
