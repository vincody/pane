import type {OpenDocument} from './documents.ts';
import {liveMarkdownReason} from './markdown-modes.ts';
import './live-markdown.css';

export function createLiveMarkdownSurface(element:HTMLElement,{save,loadImage,fallback}:{save:(doc:OpenDocument)=>void;loadImage:(doc:OpenDocument,source:string)=>Promise<Blob>;fallback:(reason:string)=>void}){
 element.classList.add('live-markdown');element.hidden=true;
 let generation=0,dispose:(()=>void)|undefined,active:OpenDocument|null=null;
 function hide(){++generation;dispose?.();dispose=undefined;active=null;element.hidden=true;element.replaceChildren();}
 async function show(doc:OpenDocument){
  if(active===doc&&!element.hidden)return;
  hide();element.hidden=false;active=doc;const request=++generation,model=doc.model;
  if(!model)return;
  const reason=liveMarkdownReason(doc.path,model.getValue());if(reason){fallback(reason);return;}
  element.textContent='Loading Live Editor…';
  try{
   const {createRichMarkdownEditor}=await import('./rich-markdown-editor.ts');if(request!==generation||model.isDisposed())return;
   element.replaceChildren();let applying=false;
   const rich=createRichMarkdownEditor({element,source:model.getValue(),save:()=>save(doc),loadImage:source=>loadImage(doc,source),onChange:value=>{
    if(model.isDisposed()||model.getValue()===value)return;applying=true;try{model.pushEditOperations(null,[{range:model.getFullModelRange(),text:value}],()=>null);}finally{applying=false;}
   }});
   model.pushStackElement();
   const subscription=model.onDidChangeContent(()=>{if(applying||model.isDisposed())return;const reason=liveMarkdownReason(doc.path,model.getValue());if(reason){fallback(reason);return;}try{rich.setSource(model.getValue());}catch(error){fallback(error instanceof Error?error.message:'Continue editing in Source.');}});
   dispose=()=>{subscription.dispose();if(!model.isDisposed())model.pushStackElement();rich.destroy();};rich.focus();
  }catch(error){if(request===generation)fallback(error instanceof Error?error.message:'Could not open Live Editor. Your source is unchanged.');}
 }
 return {show,hide,dispose:hide};
}
