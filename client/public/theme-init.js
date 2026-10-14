// Apply the saved theme before the app renders, avoiding a light flash.
try {
  const theme = localStorage.getItem('ai-web.theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
} catch {
  document.documentElement.dataset.theme = 'light';
}

// Restore panel geometry before first paint, rather than after app startup.
const layoutRoot=document.documentElement;
layoutRoot.dataset.layoutReady='false';
layoutRoot.dataset.workspacesHidden=String(matchMedia('(max-width: 700px)').matches);
let filesOpen=true;
try {
  filesOpen=localStorage.getItem('ai-web.files-open')!=='false';
  for(const side of ['left','right']){
    const width=Number(localStorage.getItem(`ai-web.${side}-panel-width`));
    if(width>=220&&width<=420)layoutRoot.style.setProperty(`--${side}-panel-width`,`${width}px`);
  }
} catch {}
layoutRoot.dataset.filesHidden=String(!filesOpen||matchMedia('(max-width: 900px)').matches);
