import * as pdfjs from 'pdfjs-dist';
import {EventBus,PDFFindController,PDFLinkService,PDFViewer} from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;

const MIN_SCALE=.25,MAX_SCALE=5,STEP=1.25;
const disposers=new WeakMap<HTMLElement,()=>void>();

// Zoom and scroll position per PDF and host, so switching tabs reopens a PDF where it was left.
const positions=new WeakMap<Blob,WeakMap<HTMLElement,{scale:string;top:number;left:number}>>();
export function disposePdf(host:HTMLElement){const dispose=disposers.get(host);disposers.delete(host);dispose?.();}

// CJK character maps, the standard fonts and the WebAssembly decoders are copied to /pdfjs/ at build time (config/vite/pdfjs-assets.ts).
const documentOptions=(data:Uint8Array)=>({
 data,
 cMapUrl:new URL('pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,
 standardFontDataUrl:new URL('pdfjs/standard_fonts/',document.baseURI).href,
 wasmUrl:new URL('pdfjs/wasm/',document.baseURI).href,
});

function control(label:string,text:string,action:()=>void){
 const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',label);button.title=label;button.onclick=action;return button;
}

/** A PDF viewer built on pdf.js: continuous pages, zoom (buttons, Ctrl+wheel, keys), fit to width, page counter and text search. */
export function showPdf(host:HTMLElement,{blob,name}:{blob:Blob;name:string}){
 disposePdf(host);
 const viewer=document.createElement('div');viewer.className='image-viewer pdf-viewer';
 const toolbar=document.createElement('div');toolbar.className='image-zoom-controls pdf-controls';toolbar.setAttribute('aria-label','PDF controls');
 const body=document.createElement('div');body.className='pdf-viewer-body';
 const container=document.createElement('div');container.className='pdf-scroll';container.tabIndex=0;container.setAttribute('aria-label',`PDF preview of ${name}. Control and scroll to zoom.`);
 const pages=document.createElement('div');pages.className='pdfViewer';container.append(pages);
 const status=document.createElement('div');status.className='pdf-status';status.setAttribute('role','status');status.textContent='Loading PDF…';
 body.append(container,status);
 const zoomValue=document.createElement('span');zoomValue.className='image-zoom-value';zoomValue.setAttribute('aria-live','polite');
 const pageValue=document.createElement('span');pageValue.className='pdf-page-value';
 const find=document.createElement('input');find.type='search';find.className='pdf-find';find.placeholder='Find in PDF';find.setAttribute('aria-label','Find in PDF');find.disabled=true;
 const matches=document.createElement('span');matches.className='pdf-find-count';matches.setAttribute('aria-live','polite');
 viewer.append(toolbar,body);host.replaceChildren(viewer);

 let disposed=false,pdfViewer:PDFViewer|undefined,task:ReturnType<typeof pdfjs.getDocument>|undefined;
 const eventBus=new EventBus(),linkService=new PDFLinkService({eventBus}),findController=new PDFFindController({linkService,eventBus});
 const abort=new AbortController();
 const zoomBy=(factor:number)=>{if(pdfViewer)pdfViewer.currentScale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,pdfViewer.currentScale*factor));};
 const fit=()=>{if(pdfViewer)pdfViewer.currentScaleValue='page-width';};
 toolbar.append(control('Zoom out','−',()=>zoomBy(1/STEP)),zoomValue,control('Zoom in','+',()=>zoomBy(STEP)),control('Fit to width','Fit',fit),pageValue,find,control('Previous match','↑',()=>search(true)),control('Next match','↓',()=>search(false)),matches);
 const search=(previous:boolean)=>{
  if(!find.value)return;
  eventBus.dispatch('find',{source:find,type:previous?'again':'',query:find.value,caseSensitive:false,entireWord:false,highlightAll:true,findPrevious:previous,matchDiacritics:false});
 };
 find.addEventListener('input',()=>search(false));
 find.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search(event.shiftKey);}else if(event.key==='Escape'){find.value='';search(false);container.focus();}});
 eventBus.on('updatefindmatchescount',(event:{matchesCount:{current:number;total:number}})=>{matches.textContent=find.value?(event.matchesCount.total?`${event.matchesCount.current}/${event.matchesCount.total}`:'No matches'):'';});
 eventBus.on('updatefindcontrolstate',(event:{matchesCount:{current:number;total:number}})=>{if(find.value&&!event.matchesCount.total)matches.textContent='No matches';});
 eventBus.on('scalechanging',(event:{scale:number})=>{if(status.hidden)queueMicrotask(remember);zoomValue.textContent=`${Math.round(event.scale*100)}%`;});
 eventBus.on('pagechanging',(event:{pageNumber:number})=>{pageValue.textContent=`${event.pageNumber} / ${pdfViewer?.pagesCount??0}`;});
 container.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();zoomBy(event.deltaY<0?1.12:1/1.12);},{passive:false,signal:abort.signal});
 container.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){event.preventDefault();find.focus();find.select();return;}
  if(['+','=','-','0'].includes(event.key)&&!event.ctrlKey&&!event.metaKey){event.preventDefault();if(event.key==='0')fit();else zoomBy(event.key==='-'?1/STEP:STEP);}
 },{signal:abort.signal});

 const remember=()=>{if(!pdfViewer?.pagesCount||!container.scrollHeight)return;let saved=positions.get(blob);if(!saved)positions.set(blob,saved=new WeakMap());saved.set(host,{scale:String(pdfViewer.currentScaleValue),top:container.scrollTop/container.scrollHeight,left:container.scrollLeft/Math.max(1,container.scrollWidth)});};
 container.addEventListener('scroll',()=>{if(!disposed&&status.hidden)remember();},{passive:true,signal:abort.signal});
 const fail=(error:unknown)=>{status.hidden=false;status.textContent=error instanceof Error&&error.name==='PasswordException'?'This PDF is password-protected.':'This PDF could not be opened.';};
 // A pane that is not on screen (such as the inactive view of the same file) loads only once it is shown.
 const start=()=>{
 void blob.arrayBuffer().then(buffer=>{
  if(disposed)return;
  task=pdfjs.getDocument(documentOptions(new Uint8Array(buffer)));
  return task.promise;
 }).then(doc=>{
  if(!doc||disposed){void task?.destroy();return;}
  // abortSignal releases pdf.js's scroll listener and ResizeObserver, but its typings omit it.
  const options={container,viewer:pages,eventBus,linkService,findController,textLayerMode:1,removePageBorders:true,abortSignal:abort.signal};
  pdfViewer=new PDFViewer(options);
  linkService.setViewer(pdfViewer);pdfViewer.setDocument(doc);linkService.setDocument(doc);findController.setDocument(doc);
  eventBus.on('pagesinit',()=>{const saved=positions.get(blob)?.get(host);if(saved){pdfViewer!.currentScaleValue=saved.scale;container.scrollTop=saved.top*container.scrollHeight;container.scrollLeft=saved.left*container.scrollWidth;}else fit();status.hidden=true;find.disabled=false;pageValue.textContent=`1 / ${pdfViewer!.pagesCount}`;});
 }).catch(error=>{if(!disposed)fail(error);});
 };
 const visibility=new ResizeObserver(()=>{if(!disposed&&container.clientHeight>0){visibility.disconnect();start();}});visibility.observe(container);

 // A hidden pane cannot be measured; pdf.js re-fits when it shows again if it was still following the width.
 disposers.set(host,()=>{
  disposed=true;visibility.disconnect();abort.abort();
  try{pdfViewer?.setDocument(null as unknown as pdfjs.PDFDocumentProxy);}catch{}
  void task?.destroy().catch(()=>{});
 });
}
