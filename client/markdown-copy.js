export function addCodeCopyButtons(target) {
  for(const code of target.querySelectorAll('pre > code')){
    const pre=code.parentElement;pre.classList.add('markdown-code-block');
    const button=document.createElement('button');button.type='button';button.className='code-copy-button';button.textContent='Copy';button.setAttribute('aria-label','Copy code');
    let timer;
    button.onclick=async()=>{
      try{await navigator.clipboard.writeText(code.textContent);clearTimeout(timer);button.textContent='Copied';button.setAttribute('aria-label','Code copied');}
      catch{button.textContent='Copy failed';button.setAttribute('aria-label','Copy failed. Select the code to copy manually.');}
      timer=setTimeout(()=>{button.textContent='Copy';button.setAttribute('aria-label','Copy code');},1800);
    };
    pre.append(button);
  }
}
