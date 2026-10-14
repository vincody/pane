import type {editor,IDisposable} from 'monaco-editor';
export type FileView='editor'|'preview';
export interface DocumentBase {
 key:string;project:string;path:string;name:string;dirty:boolean;saving?:boolean;
 model?:editor.ITextModel|null;subscription?:IDisposable;imageUrl?:string;diffModels?:[editor.ITextModel,editor.ITextModel];
 viewState?:editor.ICodeEditorViewState|null;secondaryViewState?:editor.ICodeEditorViewState|null;version?:string;bom?:boolean;savedContent?:string;size?:number;baseline?:string|null;
}
export type OpenDocument=DocumentBase&({kind:'text';content:string}|{kind:'image'}|{kind:'diff';diffModels:[editor.ITextModel,editor.ITextModel]});
