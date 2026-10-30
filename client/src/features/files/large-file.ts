import type * as Monaco from 'monaco-editor';

const LARGE_CHARS=400_000,LONG_LINE_CHARS=10_000,LARGE_LINES=20_000;
const large=new WeakSet<Monaco.editor.ITextModel>();

/** A file that is big, has very many lines or has one very long line (minified JSON) makes Monaco's per-token features freeze the tab. */
export function isLargeText(content:string){
 if(content.length>=LARGE_CHARS)return true;
 let lines=1,start=0;
 for(let end=content.indexOf('\n');;end=content.indexOf('\n',start)){
  const stop=end<0?content.length:end;
  if(stop-start>LONG_LINE_CHARS||++lines>LARGE_LINES)return true;
  if(end<0)return false;
  start=end+1;
 }
}

export const isLargeModel=(model:Monaco.editor.ITextModel)=>large.has(model);

export function markLargeModel(model:Monaco.editor.ITextModel){
 large.add(model);model.updateOptions({bracketColorizationOptions:{enabled:false,independentColorPoolPerBracketType:false}});
}

const heavy={folding:false,occurrencesHighlight:'off',selectionHighlight:false,matchBrackets:'never',links:false,colorDecorators:false,codeLens:false,renderLineHighlight:'none',wordBasedSuggestions:'off',quickSuggestions:false,hover:{enabled:'off'},stickyScroll:{enabled:false},guides:{indentation:false,bracketPairs:false}} as const;
const light={folding:true,occurrencesHighlight:'singleFile',selectionHighlight:true,matchBrackets:'always',links:true,colorDecorators:true,codeLens:true,renderLineHighlight:'line',wordBasedSuggestions:'matchingDocuments',quickSuggestions:true,hover:{enabled:'on'},stickyScroll:{enabled:true},guides:{indentation:true,bracketPairs:false}} as const;

/** Turns the expensive editor features off while a large model is shown, and back on for any other model. */
export function tuneEditorForSize(editor:Monaco.editor.IStandaloneCodeEditor){
 const apply=()=>{const model=editor.getModel();editor.updateOptions(model&&large.has(model)?heavy:light);};
 editor.onDidChangeModel(apply);apply();
}
