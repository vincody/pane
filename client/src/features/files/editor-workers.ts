import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';

export function setupEditorWorkers(){
self.MonacoEnvironment = { getWorker(_, label) {
  if (label === 'json') return new JsonWorker();
  if (label === 'typescript' || label === 'javascript') return new TsWorker();
  if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
  if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
  return new EditorWorker();
} };
}
