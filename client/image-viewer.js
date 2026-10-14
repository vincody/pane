const viewers=new WeakMap();
export function showImage(host,doc){
  viewers.get(host)?.disconnect();
  const viewer=document.createElement('div');viewer.className='image-viewer';
  const toolbar=document.createElement('div');toolbar.className='image-zoom-controls';toolbar.setAttribute('aria-label','Image zoom');
  const viewport=document.createElement('div');viewport.className='image-zoom-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label','Image preview. Control and scroll to zoom.');
  const stage=document.createElement('div');stage.className='image-zoom-stage';
  const img=document.createElement('img');img.src=doc.imageUrl;img.alt=doc.name;img.draggable=false;stage.append(img);viewport.append(stage);
  let scale=1,fitMode=true;
  const value=document.createElement('span');value.className='image-zoom-value';value.setAttribute('aria-live','polite');
  const draw=()=>{if(!img.naturalWidth)return;img.style.width=`${img.naturalWidth*scale}px`;img.style.height=`${img.naturalHeight*scale}px`;value.textContent=`${Math.round(scale*100)}%`;};
  const fit=()=>{fitMode=true;scale=Math.min(1,Math.max(.01,(viewport.clientWidth-32)/img.naturalWidth),Math.max(.01,(viewport.clientHeight-32)/img.naturalHeight));draw();};
  const zoom=next=>{fitMode=false;const old=scale;scale=Math.max(.1,Math.min(8,next));draw();const ratio=scale/old;viewport.scrollLeft=(viewport.scrollLeft+viewport.clientWidth/2)*ratio-viewport.clientWidth/2;viewport.scrollTop=(viewport.scrollTop+viewport.clientHeight/2)*ratio-viewport.clientHeight/2;};
  for(const [label,text,action] of [['Zoom out','−',()=>zoom(scale/1.25)],['Zoom in','+',()=>zoom(scale*1.25)],['Actual size','100%',()=>zoom(1)],['Fit image','Fit',fit]]){
    const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',label);button.title=label;button.onclick=action;toolbar.append(button);
  }
  toolbar.insertBefore(value,toolbar.children[1]);viewer.append(toolbar,viewport);host.replaceChildren(viewer);
  img.onload=fit;
  viewport.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();zoom(scale*(event.deltaY<0?1.12:1/1.12));},{passive:false});
  viewport.onkeydown=event=>{if(['+','=','-','0'].includes(event.key)){event.preventDefault();if(event.key==='0')fit();else zoom(scale*(event.key==='-'?1/1.25:1.25));}};
  let drag;
  viewport.onpointerdown=event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(event.pointerId);viewport.classList.add('panning');};
  viewport.onpointermove=event=>{if(drag){viewport.scrollLeft=drag.left+drag.x-event.clientX;viewport.scrollTop=drag.top+drag.y-event.clientY;}};
  viewport.onpointerup=viewport.onpointercancel=()=>{drag=null;viewport.classList.remove('panning');};
  const observer=new ResizeObserver(()=>{if(fitMode&&img.naturalWidth)fit();});observer.observe(viewport);viewers.set(host,observer);
}
