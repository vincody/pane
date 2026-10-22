import {setupEditorWorkers} from '../features/files/editor-workers.ts';
import {readWorkbenchJournal,writeWorkbenchJournal,type WorkbenchJournal} from '../features/layout/workbench-journal.ts';
import {captureTabPositions,restoreTabPositions} from '../features/layout/tab-position.ts';
import {worktreeSlug} from '../../../shared/worktree-composer.ts';
import {startWorkingAnimation} from '../features/notifications/working-animation.ts';
import {setupTitlebar} from '../features/layout/Titlebar.tsx';
import {setupHistory} from '../features/history/History.tsx';
import {setupChanges} from '../features/files/changes.ts';
import {createGitPanel} from '../features/git/GitPanel.tsx';
import {setupDevServers} from '../features/dev-servers/DevServers.tsx';
import {setupResources} from '../features/resources/Resources.tsx';
import {createFileGitDecorations} from '../features/files/file-git-status.ts';
import {createWorkspaceSidebar} from '../features/workspaces/WorkspaceSidebar.tsx';
import {createWorktreeDialog} from '../features/workspaces/worktree-dialog.ts';
import {createWorkspaceDiffs} from '../features/workspaces/workspace-diff.ts';
import {createAddWorkspaceDialog} from '../features/workspaces/add-workspace.ts';
import {createSessionAttention,nextAttention} from '../features/workspaces/session-attention.ts';
import {showImage} from '../features/files/image-viewer.ts';
import {disposePdf} from '../features/files/pdf-viewer.ts';
import {addCodeCopyButtons} from '../features/files/markdown-copy.ts';
import {positionTab, setupUnifiedTabOrder,forgetTabPosition} from '../features/layout/tab-position.ts';
import {createNotifications} from '../features/notifications/notifications.ts';
import {setupSettings} from '../features/settings/Settings.tsx';
import {setupColorTheme} from '../features/settings/color-theme.ts';
import {setupTabDrag} from '../features/layout/tab-drag.ts';
import {icon} from '../lib/icons.ts';
import {fileIcon} from '../features/files/file-icons.ts';
import {diffEditorOptions,setupDiffHeader,updateDiffStat} from '../features/files/diff-view.ts';
import {setupBrowserPane,type BrowserServer} from '../features/browser/browser-pane.ts';
import {createLinkPreferences} from '../features/browser/link-preferences.ts';
import {createLinkOpener} from '../features/browser/link-opener.ts';
import {setupLinkSettings} from '../features/browser/link-settings.ts';
import {kind,language} from '../features/files/file-language.ts';
import {createFileTree} from '../features/files/file-tree.ts';
import {setupFileActions} from '../features/files/file-actions.ts';
import {confirmDiscardFile} from '../features/files/discard-dialog.ts';
import {showAppDialog} from '../features/dialog/app-dialog.ts';
import {createLiveMarkdownSurface} from '../features/files/live-markdown.ts';
import {chooseFileView,syncFileModeButtons} from '../features/files/markdown-modes.ts';
import type {FileAction} from '../../../shared/file-actions.ts';
import {createUsagePanel} from '../features/usage/Usage.tsx';
import { createAgentView } from '../features/agents/agent-view.ts';
import { createTerminalView } from '../features/terminal/terminal-view.ts';
import { setupPanelResize } from '../features/layout/panel-resize.ts';
import * as monaco from 'monaco-editor';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import '../styles/styles.css';
import '../styles/design-theme.css';
import '../styles/git.css';
import '../styles/selects.css';
import '../styles/workspace-sidebar.css';
import '../styles/dividers.css';
import '../styles/browser.css';
import '../styles/links.css';
import '../styles/settings.css';

setupEditorWorkers();

import {uiQuery as $,eventElement,htmlChildren} from '../lib/dom.ts';
import {createApi,ApiError,pendingApiWrites} from '../lib/api.ts';
import {errorMessage} from '../components/contracts.ts';
import type {OpenDocument,FileView} from '../features/files/documents.ts';
import type {Workspace,SessionSnapshot,AgentSnapshot,TextFile,ImageFile,FileDiff,GitFileChange,DevServerSnapshot} from '../../../shared/contracts.ts';
import type {TerminalAgent} from '../components/contracts.ts';
import type {DraggedFile,DropZone} from '../features/layout/tab-drag.ts';
import type {ExternalFilePane} from '../features/terminal/terminal-view.ts';
type FilePane=ExternalFilePane&{preview:HTMLElement;editor:monaco.editor.IStandaloneCodeEditor|monaco.editor.IStandaloneDiffEditor|null;live?:ReturnType<typeof createLiveMarkdownSurface>;dispose?:()=>void};
const token = $('meta[name="ai-web-token"]').content;
const api=createApi(token);
$('#app').classList.toggle('sidebar-hidden',document.documentElement.dataset.workspacesHidden==='true');
$('#app').classList.toggle('files-hidden',document.documentElement.dataset.filesHidden==='true');
const fileGit=createFileGitDecorations($('#tree'));
const documents = new Map<string,OpenDocument>();
let notifications:ReturnType<typeof createNotifications>|undefined;
let titlebar:ReturnType<typeof setupTitlebar>|undefined;
let workspaceSidebar:ReturnType<typeof createWorkspaceSidebar>|undefined;
const workspaceDiffs=createWorkspaceDiffs(api,()=>renderProjects());
let changesView:ReturnType<typeof setupChanges>|undefined;
let gitView:ReturnType<typeof createGitPanel>|undefined;
let devServers:ReturnType<typeof setupDevServers>|undefined;
let terminalAgents:TerminalAgent[] = [];
const sessionAttention=createSessionAttention();
let lastAttentionId:string|undefined;
function openTerminalAgent(id:string){
 const agent=terminalAgents.find(item=>item.id===id);if(!agent)return;
 const project=projects.find(item=>item.id===agent.project);if(project&&currentProject?.id!==project.id)void selectProject(project);
 if($('#app').classList.contains('sidebar-hidden'))toggleSidebar();
 agentView.close();terminalView.select(id);lastAttentionId=id;
}
function jumpToAttention(){const next=nextAttention(terminalAgents,lastAttentionId||terminalAgents.find(agent=>agent.selected)?.id);if(next)openTerminalAgent(next.id);else toast('No sessions need attention.');}
let sessionData:SessionSnapshot = {agents:[],sessions:[]};
let tabOrder:string[]=[],tabDrag:ReturnType<typeof setupTabDrag>|undefined,secondaryDocument:OpenDocument|null=null,secondaryEditor:monaco.editor.IStandaloneCodeEditor|undefined,secondarySaveBound=false;
let defaultFileView:FileView='editor',secondaryMode:FileView='editor';
let activeFileKey:string|null=null;
interface WorkspaceTabState {kind:'git'|'pane'|'file'|'agent'|'empty';file:string|null;pane:string|undefined;mode:string;secondary:string|null;secondaryMode:FileView;classes:string[];order:string[];agent:AgentSnapshot|null;agentVisible:boolean}
const workspaceTabStates=new Map<string,WorkspaceTabState>();
let workbenchReady=false,restoringWorkbench=false,recoveryWarning=false;

let openingSplit=false;
const filePanes=new Map<string,FilePane>();
function focusSecondaryFile(){
  if(!secondaryDocument)return;
  activeFileKey=secondaryDocument.key;$('#app').dataset.fileFocused='true';terminalView.setFocused(false);
  requestAnimationFrame(()=>{
    if(!secondaryDocument)return;
    if(secondaryMode==='preview'){secondaryPreview.tabIndex=-1;secondaryPreview.focus();}
    else if(secondaryDocument.kind==='image')secondaryPane.querySelector<HTMLElement>('.image-zoom-viewport')!?.focus();
    else secondaryEditor?.focus();
  });
  renderTabs();
}
try{if(localStorage.getItem('ai-web.default-file-view')==='preview')defaultFileView='preview';}catch{}
const previewRequests=new WeakMap<HTMLElement,number>();
// Each preview remembers which document it shows and how far each document was scrolled, so switching tabs restores the position.
const previewShown=new WeakMap<HTMLElement,OpenDocument>(),previewScrolls=new WeakMap<OpenDocument,WeakMap<HTMLElement,number>>();
function rememberPreviewScroll(target:HTMLElement){const doc=previewShown.get(target);if(!doc||!target.childElementCount)return;let scrolls=previewScrolls.get(doc);if(!scrolls)previewScrolls.set(doc,scrolls=new WeakMap());scrolls.set(target,target.scrollTop);}
const pendingPreviews=new Set<OpenDocument>();
const expanded = new Set<string>();
let projects:Workspace[]=[],currentProject:Workspace|null=null,currentDocument:OpenDocument|null=null,mode:string='editor',previewGeneration=0,previewTimer:ReturnType<typeof setTimeout>|undefined,toastTimer:ReturnType<typeof setTimeout>|undefined;
function status(message:string, error = false) { if (error) toast(message); }
function toast(message:string,duration=6500) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), duration);
}
const fileUrl = (route:string, doc:Pick<OpenDocument,'project'|'path'> = currentDocument!) => `/api/${route}?${new URLSearchParams({ project: doc.project, path: doc.path })}`;
async function loadLiveImage(doc:OpenDocument,source:string){
 if(/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(source))throw new Error('External images are not loaded.');
 const parts=doc.path.split('/');parts.pop();for(const part of decodeURIComponent(source).split('/')){if(part==='..'){if(!parts.length)throw new Error('Image is outside this workspace.');parts.pop();}else if(part&&part!=='.')parts.push(part);}
 return api(fileUrl('image',{project:doc.project,path:parts.join('/')}),{image:true});
}
const mainLiveElement=document.createElement('div');$('#editor-pane').append(mainLiveElement);
const mainLive=createLiveMarkdownSurface(mainLiveElement,{save:doc=>{void saveFile(doc);},loadImage:loadLiveImage,fallback:reason=>{if(currentDocument)currentDocument.liveError=reason;setView('editor');toast(reason);}});

monaco.editor.defineTheme('ai-web', {
  base: 'vs-dark', inherit: true,
  rules: [{ token: 'comment', foreground: '9B9183', fontStyle: 'italic' }, { token: 'keyword', foreground: 'E8875F' }, { token: 'string', foreground: 'A8C17C' }, { token: 'number', foreground: 'D6A0C9' }, { token: 'type', foreground: '6CB8D6' }, { token: 'delimiter', foreground: '8F859D' }],
  colors: { 'editor.background': '#1F1E1B', 'editor.foreground': '#E9E5DC', 'editorLineNumber.foreground': '#61594F', 'editorLineNumber.activeForeground': '#E9E5DC', 'editor.lineHighlightBackground': '#FFFFFF04', 'editor.selectionBackground': '#D9775722', 'editorCursor.foreground': '#D97757', 'editorIndentGuide.background1': '#FFFFFF08', 'editorIndentGuide.activeBackground1': '#D9775722', 'editorWidget.background': '#2B2925', 'editorWidget.border': '#49443C', 'diffEditor.insertedLineBackground': '#7FB77E14', 'diffEditor.removedLineBackground': '#E5736B14', 'diffEditor.insertedTextBackground': '#7FB77E2E', 'diffEditor.removedTextBackground': '#E5736B2E', 'diffEditorGutter.insertedLineBackground': '#7FB77E22', 'diffEditorGutter.removedLineBackground': '#E5736B22', 'diffEditor.diagonalFill': '#00000000', 'diffEditor.border': '#00000000', 'diffEditor.unchangedRegionBackground': '#26241F', 'diffEditor.unchangedRegionForeground': '#9B9183', 'diffEditor.unchangedRegionShadow': '#00000000' },
});
const editor = monaco.editor.create($('#editor'), {
  theme: 'ai-web', model: null, automaticLayout: true, fontSize: 13, lineHeight: 23,
  fontFamily: '"JetBrains Mono", Consolas, monospace', minimap: { enabled: false }, padding: { top: 22, bottom: 22 },
  scrollBeyondLastLine: false, renderLineHighlight: 'line', smoothScrolling: false, tabSize: 2,
  glyphMargin: false, folding: true, lineNumbersMinChars: 4, overviewRulerLanes: 0, hideCursorInOverviewRuler: true,
  editContext: false,
  wordWrap: 'off', bracketPairColorization: { enabled: true }, scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 },
});
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveFile());

let draggedProject:string|null=null,lastProjectDrag=0,reorderingProjects=false;
const clearProjectDrop=()=>{for(const group of document.querySelectorAll<HTMLElement>('.workspace-group'))group.classList.remove('drop-before','drop-after');};
async function reorderProjects(id:string,target:string,after=false){
 if(reorderingProjects||id===target)return;const ordered=projects.map(project=>project.id);const from=ordered.indexOf(id);if(from<0||!ordered.includes(target))return;ordered.splice(from,1);ordered.splice(ordered.indexOf(target)+(after?1:0),0,id);if(ordered.every((item,index)=>item===projects[index].id))return;
 reorderingProjects=true;const before=new Map([...document.querySelectorAll<HTMLElement>('.workspace-group')].map(group=>[group.dataset.project,group.getBoundingClientRect().top]));
 try{const result=await api<{projects:Workspace[]}>('/api/project-order',{method:'POST',body:JSON.stringify({ids:ordered})});const existing=new Map(projects.map(project=>[project.id,project]));projects=result.projects.map(project=>Object.assign(existing.get(project.id)||{},project));renderProjects();
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches)for(const group of document.querySelectorAll<HTMLElement>('.workspace-group')){const delta=(before.get(group.dataset.project) ?? group.getBoundingClientRect().top)-group.getBoundingClientRect().top;if(delta)group.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});}
 document.querySelector<HTMLElement>(`.workspace-group[data-project="${CSS.escape(id)}"] .project-button`)?.focus();status('Project order saved');
 }catch(failure){toast(errorMessage(failure,'Operation failed.'));await refreshSessions();}finally{reorderingProjects=false;}
}
function setupProjectDrag(project:Workspace,button:HTMLButtonElement,group:HTMLElement){
 button.draggable=true;button.title=project.root+' · Drag to reorder · Alt+↑/↓';
 button.addEventListener('keydown',event=>{if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const index=projects.filter(item=>!item.parentId).findIndex(item=>item.id===project.id),next=projects.filter(item=>!item.parentId)[index+(event.key==='ArrowUp'?-1:1)];if(next)void reorderProjects(project.id,next.id,event.key==='ArrowDown');}});
 button.ondragstart=event=>{if(reorderingProjects){event.preventDefault();return;}draggedProject=project.id;event.dataTransfer!.effectAllowed='move';event.dataTransfer!.setData('text/plain',project.id);group.classList.add('project-dragging');};
 button.ondragend=()=>{draggedProject=null;lastProjectDrag=Date.now();group.classList.remove('project-dragging');clearProjectDrop();};
 group.ondragover=event=>{if(!draggedProject||draggedProject===project.id)return;event.preventDefault();event.dataTransfer!.dropEffect='move';clearProjectDrop();const bounds=group.getBoundingClientRect();group.classList.add(event.clientY>bounds.top+bounds.height/2?'drop-after':'drop-before');};
 group.ondragleave=event=>{if(!group.contains(event.relatedTarget instanceof Node?event.relatedTarget:null))group.classList.remove('drop-before','drop-after');};
 group.ondrop=event=>{if(!draggedProject)return;event.preventDefault();const id=draggedProject,after=group.classList.contains('drop-after');draggedProject=null;lastProjectDrag=Date.now();clearProjectDrop();void reorderProjects(id,project.id,after);};
}
function renderProjects() {
  workspaceSidebar?.render({projects:[...projects],currentProjectId:currentProject?.id||null,agents:[...terminalAgents],diffs:workspaceDiffs.stats()});
  workspaceDiffs.refresh(projects.map(project=>project.id));
  titlebar?.refresh();
}
function captureWorkspaceState():WorkspaceTabState{return {kind:gitView?.activeProject===currentProject?.id?'git':agentView.visible?'agent':terminalView.visible?'pane':currentDocument?'file':'empty',file:currentDocument&&currentDocument.project===currentProject?.id?currentDocument.key:null,pane:terminalView.focusedProjectId===currentProject?.id?terminalView.activePaneId:undefined,mode,secondary:secondaryDocument?.key||null,secondaryMode,classes:['file-file-split','chat-file-split','split-vertical','split-ai-last','file-pane-first'].filter(name=>$('#app').classList.contains(name)),order:[...tabOrder],agent:agentView.selected||null,agentVisible:agentView.visible};}
function checkpointWorkbench(){
 const dirty=[...documents.values()].filter(doc=>doc.dirty).length,terminals=terminalView.runningCount,busy=Boolean(gitView?.busy)||pendingApiWrites()>0||[...documents.values()].some(doc=>doc.saving);
 if(!workbenchReady)return {dirty,terminals,busy,saved:false};
 const views=new Map(workspaceTabStates);if(currentProject)views.set(currentProject.id,captureWorkspaceState());
 const value:WorkbenchJournal={version:1,selected:currentProject?.id||null,files:[...documents.values()].filter(doc=>doc.kind!=='diff').map(doc=>({project:doc.project,path:doc.path,pane:filePanes.has(doc.key),view:chooseFileView(doc,filePanes.get(doc.key)?.element.dataset.fileView||doc.view||'editor'),...(doc.dirty&&doc.model?{draft:doc.model.getValue(),version:doc.version}:{})})),views:[...views].map(([project,view])=>({...view,project,kind:view.kind==='agent'?'empty':view.kind})),layout:terminalView.captureLayout(),git:gitView?.openProjects||[],positions:captureTabPositions()};
 return {dirty,terminals,busy,saved:terminalView.checkpoint()&&writeWorkbenchJournal(value)};
}
async function selectProject(project:Workspace|null,initial=false) {
  if(!initial&&project&&project.id===currentProject?.id){currentProject=project;changesView?.projectChanged();gitView?.projectChanged();devServers?.projectChanged();renderTabs();renderProjects();await refreshTree();return;}
  if(currentProject){
    workspaceTabStates.set(currentProject.id,captureWorkspaceState());
  }
  if (terminalView?.visible) terminalView.toggle();
  agentView?.close();gitView?.deactivate();
  closeWorkspaceMenu(false);
  if(currentDocument?.model)currentDocument.viewState=editor.saveViewState();
  endFileSplit();$('#app').classList.remove('chat-file-split','split-vertical','split-ai-last');
  currentProject=project;
  const remembered=project?workspaceTabStates.get(project.id):undefined;tabOrder=remembered?.order||[];
  if (!project) {currentDocument=null;activeFileKey=null;editor.setModel(null);$('#preview-content').replaceChildren();$('#image-editor').hidden=true;terminalView?.setProject(null);try{localStorage.removeItem('ai-web.selected-workspace');}catch{}changesView?.projectChanged();gitView?.projectChanged();devServers?.projectChanged();$('#empty').hidden=false;renderTabs();renderProjects();$('#tree').replaceChildren();return;}
  try{localStorage.setItem('ai-web.selected-workspace',project.id);}catch{}
  changesView?.projectChanged();gitView?.projectChanged();devServers?.projectChanged();titlebar?.refresh();$('#empty').hidden=true;expanded.clear();$('#filter').value='';
  if(currentDocument?.project!==project.id){currentDocument=null;activeFileKey=null;editor.setModel(null);$('#preview-content').replaceChildren();$('#image-editor').hidden=true;$('#empty').hidden=false;}
  terminalView?.setProject(project);
  const rememberedFile=remembered?.file?documents.get(remembered.file):undefined;
  if(remembered?.kind==='file'&&rememberedFile){selectDocument(rememberedFile);setView(remembered.mode);}
  else if(remembered?.kind==='pane'&&remembered.pane)terminalView.select(remembered.pane);
  else if(!terminalView.visible){const doc=rememberedFile||[...documents.values()].filter(doc=>doc.project===project.id).at(-1);if(doc)selectDocument(doc);}
  if(remembered?.agent){if(terminalView.visible&&remembered.agentVisible)terminalView.toggle();agentView.open(remembered.agent);if(!remembered.agentVisible)agentView.suspend();}
  if(remembered?.secondary){const secondary=documents.get(remembered.secondary);if(secondary&&secondary.project===project.id){showSecondary(secondary);setSecondaryView(remembered.secondaryMode);for(const name of remembered.classes)$('#app').classList.add(name);}}
  if(remembered?.kind==='git')gitView?.restore(project.id);
  renderTabs();renderProjects();await refreshTree();
  if(currentProject?.id===project.id&&!currentDocument)status(project.root);
}

let menuOrigin:HTMLElement|null=null,renameProject:Workspace|null=null;
function closeWorkspaceMenu(restoreFocus = true) {
  const menu = $('#workspace-menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  if (restoreFocus && menuOrigin?.isConnected) menuOrigin.focus();
}
function showWorkspaceMenu(project:Workspace,x:number,y:number,origin:HTMLElement) {
  const menu = $('#workspace-menu'); menuOrigin = origin; menu.replaceChildren();
  const title = document.createElement('div'); title.className = 'context-title'; title.textContent = project.name; menu.append(title);
  const actions: [string,()=>void|Promise<void>][] = [
    ...(!project.parentId?[["New worktree",()=>{void subWorkspaceDialog.open(project);}]] as [string,()=>void][]:[]),
    ['Open workspace', async () => { await selectProject(project); setFilesOpen(true); }],
    ['Rename in web', () => { renameProject = project; $('#workspace-name').value = project.name; $('#rename-error').textContent = ''; $('#rename-dialog').showModal(); $('#workspace-name').select(); }],
    ['Copy folder path', async () => { await navigator.clipboard.writeText(project.root); toast('Folder path copied'); }],
    ['Refresh files', async () => { await selectProject(project); setFilesOpen(true); }],
    ['Move up',()=>{const roots=projects.filter(item=>!item.parentId),index=roots.findIndex(item=>item.id===project.id);if(index>0)return reorderProjects(project.id,roots[index-1].id);}],
    ['Move down',()=>{const roots=projects.filter(item=>!item.parentId),index=roots.findIndex(item=>item.id===project.id);if(index>=0&&index<roots.length-1)return reorderProjects(project.id,roots[index+1].id,true);}],
    ['Remove from web', () => removeProject(project)],
  ];
  for (const [label, action] of actions.filter(([label])=>!project.parentId||!['Move up','Move down'].includes(label))) {
    const item = document.createElement('button'); item.type = 'button'; item.setAttribute('role', 'menuitem'); item.textContent = label;
    if (label === 'Remove from web') item.className = 'danger-action';
    item.onclick = async () => { closeWorkspaceMenu(false); try { await action(); } catch (error) { toast(errorMessage(error,'Operation failed.')); } };
    menu.append(item);
  }
  const note = document.createElement('div'); note.className = 'context-note'; note.textContent = 'Files on disk are never deleted.'; menu.append(note);
  menu.hidden = false;
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
  menu.querySelector<HTMLButtonElement>('button')!.focus();
}
async function removeProject(project:Workspace) {
  const removedIds=new Set([project.id,...projects.filter(item=>item.parentId===project.id).map(item=>item.id)]);
  const tabs = [...documents.values()].filter(doc => removedIds.has(doc.project));
  if (tabs.some(doc => doc.saving)) { toast('A file is still saving. Try again when it finishes.'); return; }
  if (tabs.some(doc => doc.dirty) && !confirm(`Remove ${project.name} from Pane and discard its unsaved edits? Files on disk will not be deleted.`)) return;
  await api(`/api/projects?${new URLSearchParams({ project: project.id })}`, { method: 'DELETE' });
  for (const doc of tabs) { doc.dirty = false; closeDocument(doc); }
  projects = projects.filter(item => !removedIds.has(item.id));
  if (currentProject&&removedIds.has(currentProject.id)) await selectProject(projects.find(item => item.id === currentDocument?.project) || projects[0] || null); else renderProjects();
  await refreshSessions();
  status('Workspace removed from web'); toast('Removed from Pane. Your folder and sessions remain on disk. Use Open folder to add it again.');
}
$('#workspace-menu').onkeydown = event => {
  const items = [...$('#workspace-menu').querySelectorAll<HTMLButtonElement>('button')];
  const position = items.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); closeWorkspaceMenu(); }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (position + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }
};
document.addEventListener('pointerdown', event => { if (!eventElement(event)?.closest<HTMLElement>('#workspace-menu')) closeWorkspaceMenu(false); });
window.addEventListener('resize', () => closeWorkspaceMenu(false));
document.addEventListener('scroll', event => { if (!$('#workspace-menu').contains(event.target instanceof Node?event.target:null)) closeWorkspaceMenu(false); }, true);
$('#rename-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter instanceof HTMLButtonElement?event.submitter:$('#rename-form').querySelector<HTMLButtonElement>('[type=submit]')!;button.disabled = true;if(!renameProject){button.disabled=false;return;}
  try {
    const updated = await api<Workspace>(`/api/projects?${new URLSearchParams({ project: renameProject.id })}`, { method: 'PATCH', body: JSON.stringify({ name: $('#workspace-name').value.trim() }) });
    Object.assign(renameProject, updated); renderProjects();
    renderTabs(); $('#rename-dialog').close(); toast('Workspace renamed in Pane');
  } catch (error) { $('#rename-error').textContent = errorMessage(error,'Operation failed.'); }
  finally { button.disabled = false; }
};

const {treeDirectory,filterTree}=createFileTree({api,tree:$('#tree'),filter:$('#filter'),expanded,getDocument:()=>currentDocument,icon,decorate:button=>fileGit.decorate(button),openFile,toast});

async function refreshTree() {
  if (!currentProject) return;
  const project = currentProject;
  try {
    const list = await treeDirectory(project, '', 0);
    if (project.id === currentProject?.id) { $('#tree').replaceChildren(list); filterTree(); }
  } catch (error) { status(errorMessage(error,'Operation failed.'), true); }
}
function guardFileAction(project:string,path:string){
 const affected=[...documents.values()].filter(doc=>doc.project===project&&(doc.path===path||doc.path.startsWith(path+'/')));
 if(affected.some(doc=>doc.dirty||doc.saving))throw new Error('Save or close unsaved files in this item before renaming, duplicating or deleting it.');
}
async function fileActionChanged(project:string,action:FileAction,before:string,after:string){
 const affected=[...documents.values()].filter(doc=>doc.project===project&&(doc.path===before||doc.path.startsWith(before+'/')));
 if(action==='rename'||action==='trash'){
  const selected=affected.find(doc=>doc.key===activeFileKey),reopen=action==='rename'?affected.filter(doc=>doc.kind!=='diff').map(doc=>({path:after+doc.path.slice(before.length),active:doc===selected})):[];
  for(const doc of affected)closeDocument(doc);
  for(const directory of [...expanded])if(directory===before||directory.startsWith(before+'/')){expanded.delete(directory);if(action==='rename')expanded.add(after+directory.slice(before.length));}
  if(currentProject?.id===project){for(const item of reopen.filter(item=>!item.active))await openFile(project,item.path,{newTab:true});const active=reopen.find(item=>item.active);if(active)await openFile(project,active.path,{newTab:true});}
 }
 if(action==='create-file'||action==='create-folder'){const parent=after.includes('/')?after.slice(0,after.lastIndexOf('/')):'';if(currentProject?.id===project)expanded.add(parent);}
 if(currentProject?.id===project){await refreshTree();void changesView?.refresh();gitView?.projectChanged();if(action==='create-file')await openFile(project,after,{newTab:true});}
}
async function openFile(project:string, path:string, {newTab=false,recovery=undefined as {draft:string;version?:string}|undefined}={}) {
  const replacement=!newTab&&fileOpenMode==='replace'?currentDocument:null;
  const key = `${project}:${path}`;
  if (documents.has(key)) return selectDocument(documents.get(key)!);
  status('Opening file…');
  const doc:OpenDocument = { key, project, path, name: path.split('/').pop()!,dirty:false,...(await api<TextFile|ImageFile>(fileUrl('file', { project, path })).catch(error=>{if(!recovery||!(error instanceof ApiError)||error.status!==404)throw error;return {kind:'text' as const,content:'',version:recovery.version||'',bom:false,size:0};})) };
  if (documents.has(key)) return selectDocument(documents.get(key)!);
  doc.dirty = false;
  if (doc.kind === 'text') {
    doc.savedContent = doc.content;
    doc.model = monaco.editor.createModel(doc.content, language(path), monaco.Uri.parse(`ai-web://${project}/${path}`));
    doc.subscription = doc.model.onDidChangeContent(() => {
      doc.liveError=undefined;
      doc.dirty = doc.model!.getValue() !== doc.savedContent; renderTabs();
      if (currentDocument === doc) { updateToolbar(); status(doc.dirty ? 'Unsaved changes' : 'Ready'); }
      schedulePreview(doc);
    });
  } else if (doc.media === 'pdf') doc.pdfBlob = await api(fileUrl('image', doc), { image: true });
  else doc.imageUrl = URL.createObjectURL(await api(fileUrl('image', doc), { image: true }));
  if(documents.has(key)){doc.subscription?.dispose();doc.model?.dispose();if(doc.imageUrl)URL.revokeObjectURL(doc.imageUrl);return selectDocument(documents.get(key)!);}
  const replace=replacement&&replacement===currentDocument&&documents.get(replacement.key)===replacement&&!replacement.dirty&&!replacement.saving;
  if(replace){const entries=[...documents];documents.clear();for(const [entryKey,entry] of entries)if(entryKey===replacement.key)documents.set(key,doc);else documents.set(entryKey,entry);}else documents.set(key,doc);
  selectDocument(doc);if(replace){replacement.subscription?.dispose();replacement.model?.dispose();if(replacement.imageUrl)URL.revokeObjectURL(replacement.imageUrl);}

}
async function openDiff(project:Workspace,file:GitFileChange,revision?:string){
 const result=await api<FileDiff>(revision?`/api/git/commit-diff?${new URLSearchParams({project:project.id,hash:revision,path:file.path})}`:fileUrl('diff',{project:project.id,path:file.path})),key=revision?`diff:${project.id}:${revision}:${file.path}`:`diff:${project.id}:${file.path}`;
 gitView?.deactivate();
 let doc=documents.get(key);
 if(doc?.kind==='diff'){doc.diffModels[0].setValue(result.original);doc.diffModels[1].setValue(result.modified);doc.diffStat={added:file.added,removed:file.removed};updateDiffStat(filePanes.get(key)?.element,doc.diffStat);terminalView.select(`file:${key}`);return;}
 doc={key,project:project.id,path:file.path,name:`${file.path.split('/').pop()} · ${revision?revision.slice(0,8):'Diff'}`,kind:'diff',dirty:false,baseline:result.baseline,diffStat:{added:file.added,removed:file.removed},diffModels:[monaco.editor.createModel(result.original,language(file.path),monaco.Uri.parse(`git-base://${project.id}/${revision||'HEAD'}/${file.path}`)),monaco.editor.createModel(result.modified,language(file.path),monaco.Uri.parse(`git-current://${project.id}/${revision||'working'}/${file.path}`))]};
 documents.set(key,doc);mountFilePane(doc,null);renderTabs();
}
function selectDocument(doc:OpenDocument,{keepChat=false}={}) {
  gitView?.deactivate();
  if(openingSplit)return;
  if(terminalView.hasFilePane(`file:${doc.key}`)){terminalView.select(`file:${doc.key}`);return;}
  if(secondaryDocument===doc){focusSecondaryFile();return;}
  if(terminalView.visible&&secondaryDocument){showSecondary(doc);focusSecondaryFile();return;}
  if (terminalView?.visible) terminalView.toggle();
  if(!keepChat&&!$('#app').classList.contains('chat-file-split'))agentView?.suspend();
  if (currentDocument?.model) currentDocument.viewState = editor.saveViewState();
  currentDocument = doc;
  activeFileKey=doc.key;$('#app').dataset.fileFocused='true';
  $('#empty').hidden = true; $('#image-editor').hidden = doc.kind !== 'image'; $('#editor').hidden = doc.kind === 'image';
  editor.setModel(doc.model || null);
  if (doc.viewState) editor.restoreViewState(doc.viewState);
  disposePdf($('#image-editor'));$('#image-editor').replaceChildren();
  if (doc.kind === 'image') showImage($('#image-editor'),doc);
  renderTabs(); updateToolbar(); renderPreview();
  setView(doc.view||defaultFileView);
  for (const row of $('#tree').querySelectorAll<HTMLElement>('.file-row')) row.classList.toggle('active', row.dataset.project === doc.project && row.dataset.path === doc.path);
  status(doc.dirty ? 'Unsaved changes' : 'Ready'); if (doc.model&&!keepChat) editor.focus();
}
function renderTabs() {
  updateToolbar();
  $('#tabs').replaceChildren();$('#tabs').setAttribute('role','tablist');$('#tabs').setAttribute('aria-label','Open tabs');
  const selectedAgent=agentView?.selected,split=$('#app').classList.contains('chat-file-split'),gitActive=Boolean(gitView?.activeProject),chatActive=agentView?.visible&&!split&&!gitActive;
  if(selectedAgent){const tab=document.createElement('div');tab.dataset.tabKey='ai';tab.className=`file-tab ai-session-tab${chatActive?' active':''}`;tab.tabIndex=0;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(chatActive));const title=selectedAgent.display_agent || selectedAgent.name || selectedAgent.terminal_title_stripped || 'AI';tab.setAttribute('aria-label',`AI · ${title}`);const mark=document.createElement('span');mark.className='ai-tab-mark';if(['codex','claude','opencode','agy'].includes(selectedAgent.agent)){const image=document.createElement('img');image.src=`/agents/${selectedAgent.agent}.svg`;image.alt='';mark.append(image);}else mark.append(icon('code'));const indicator=document.createElement('span');indicator.className='ai-tab-indicator';mark.append(indicator);tab.append(mark);const label=document.createElement('span');label.className='ai-tab-name';label.textContent=title;tab.append(label);const close=document.createElement('button');close.className='tab-close';close.setAttribute('aria-label','Close AI tab');close.append(icon('close'));close.onclick=event=>{event.stopPropagation();agentView.close();};tab.append(close);tab.onclick=()=>{gitView?.deactivate();endFileSplit();if(!agentView.visible||split){$('#app').classList.remove('chat-file-split');agentView.resume();}};tab.onkeydown=event=>{if(event.target===tab&&['Enter',' '].includes(event.key)){event.preventDefault();tab.click();}};$('#tabs').append(tab);}
  for (const doc of documents.values()) {
    if(doc.project!==currentProject?.id)continue;
    const tab = document.createElement('div'); tab.dataset.tabKey=doc.key;tab.dataset.project=doc.project;tab.dataset.path=doc.path;tab.className = `file-tab${activeFileKey===doc.key&&!chatActive&&!gitActive ? ' active' : ''}`; tab.title = doc.kind==='browser'?(doc.url||'New tab'):`${projects.find(p => p.id === doc.project)?.name}/${doc.path}`; tab.tabIndex = 0; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(activeFileKey===doc.key&&!chatActive&&!gitActive));
    tab.append(doc.kind==='browser'?browserTabIcon(doc.favicon):fileIcon(doc.path)); const name = document.createElement('span'); name.className = 'tab-name'; name.textContent = doc.name; tab.append(name);
    if (doc.dirty) { const dot = document.createElement('span'); dot.className = 'tab-dirty'; dot.setAttribute('aria-label', 'Unsaved changes'); tab.append(dot); }
    const close = document.createElement('button'); close.className = 'tab-close'; close.append(icon('close')); close.setAttribute('aria-label', `Close ${doc.name}`); close.onclick = event => { event.stopPropagation(); closeDocument(doc); }; tab.append(close);
    tab.onclick = () => selectDocument(doc); tab.onkeydown = event => { if (event.target === tab && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); tab.click(); } }; $('#tabs').append(tab);
  }
  gitView?.appendTabs($('#tabs'));
  const present=htmlChildren($('#tabs')).map(tab=>tab.dataset.tabKey).filter((key):key is string=>Boolean(key));tabOrder=tabOrder.filter(key=>present.includes(key));for(const key of present)if(!tabOrder.includes(key))tabOrder.push(key);for(const key of tabOrder){const tab=htmlChildren($('#tabs')).find(tab=>tab.dataset.tabKey===key);if(tab)$('#tabs').append(tab);}tabDrag?.decorate();
  for (const tab of htmlChildren($('#tabs'))) positionTab(tab, `file:${tab.dataset.tabKey}`);
  if(secondaryDocument&&!documents.has(secondaryDocument.key))endFileSplit();
  if(!selectedAgent){$('#app').classList.remove('chat-file-split','split-ai-last');if(!secondaryDocument)$('#app').classList.remove('split-vertical');}
  if(secondaryEditor&&!secondarySaveBound){secondarySaveBound=true;secondaryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,()=>saveFile(secondaryDocument));}
  updateAITabStatus();
  terminalView?.refreshPaneControls();
  if(selectedAgent&&currentDocument){const button=document.createElement('button');button.id='split-chat-file';button.type='button';button.className='tab-layout-button';button.setAttribute('aria-label',split?'Return to tabs':'Split terminal and file');button.setAttribute('aria-pressed',String(split));button.append(icon('panel'),document.createTextNode(split?'Tabs':'Split'));button.onclick=()=>{endFileSplit();if(split){$('#app').classList.remove('chat-file-split');agentView.suspend();renderTabs();}else{agentView.resume();$('#app').classList.add('chat-file-split');setView('editor');renderTabs();}requestAnimationFrame(()=>editor.layout());};$('#tabs').append(button);}
}
function updateAITabStatus(agent=agentView?.snapshot){
 const tab=$('#tabs .ai-session-tab');if(!tab||!agent)return;
 const connection=agent.sessionConnection,raw=agent.externalWorking?'working':agent.agent_status || agent.status || 'unknown',state=raw==='working'?'working':connection==='starting'?'connecting':agent.sessionInUse?'occupied':agent.archived?'saved':raw;
 for(const card of document.querySelectorAll<HTMLElement>('.agent-card'))if(card.dataset.sessionKey===(agent.agent_session?.value || agent.pane_id || agent.id)){card.dataset.status=raw;const mark=card.querySelector<HTMLElement>('.agent-state')!;mark.setAttribute('aria-label',raw);if(raw!=='working')mark.replaceChildren();}
 const labels:Record<string,string>={working:'Working',idle:'Idle · Ready for a prompt',blocked:'Needs your input',connecting:'Connecting',occupied:'Open in another app',saved:'Saved session',error:'Connection error',unknown:'Status unavailable'};
 tab.dataset.status=state;tab.title=labels[state] || state;
 const indicator=tab.querySelector<HTMLElement>('.ai-tab-indicator')!;if(state==='working'){if(!/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(indicator.textContent))indicator.textContent='⠏';}else indicator.textContent=state==='blocked'?'!':state==='occupied'?'–':'';indicator.setAttribute('role','img');indicator.setAttribute('aria-label',labels[state] || state);
}
const pendingFileClose=new WeakSet<OpenDocument>();
async function closeDocument(doc:OpenDocument) {
  if(pendingFileClose.has(doc))return;
  if(doc.dirty){
    pendingFileClose.add(doc);
    try{if(!await confirmDiscardFile(doc.name))return;}finally{pendingFileClose.delete(doc);}
    if(documents.get(doc.key)!==doc)return;
  }
  const keepChat=agentView.visible&&!$('#app').classList.contains('chat-file-split');
  if(currentDocument===doc)mainLive.hide();
  if(filePanes.has(doc.key)){
    const pane=filePanes.get(doc.key)!;filePanes.delete(doc.key);
    documents.delete(doc.key);forgetTabPosition(`file:${doc.key}`);
    if(currentDocument===doc)currentDocument=null;
    terminalView.removeFilePane(`file:${doc.key}`);pane.dispose?.();pane.live?.dispose();pane.editor?.dispose();for(const model of doc.diffModels||[])model.dispose();
    previewRequests.set(pane.preview,(previewRequests.get(pane.preview)||0)+1);
    doc.subscription?.dispose();doc.model?.dispose();if(doc.imageUrl)URL.revokeObjectURL(doc.imageUrl);
    if(!terminalView.visible){const next=[...documents.values()].filter(doc=>doc.project===currentProject?.id).at(-1);if(next)selectDocument(next);}
    updateToolbar();renderTabs();return;
  }
  const closingSecondary=secondaryDocument===doc,keepTerminal=closingSecondary&&terminalView.visible;
  if(closingSecondary)endFileSplit();
  forgetTabPosition(`file:${doc.key}`);
  documents.delete(doc.key); doc.subscription?.dispose(); doc.model?.dispose(); if (doc.imageUrl) URL.revokeObjectURL(doc.imageUrl);
  if(keepTerminal){if(currentDocument===doc){currentDocument=null;editor.setModel(null);}activeFileKey=null;$('#app').dataset.fileFocused='false';terminalView.showMostRecent();updateToolbar();renderTabs();return;}
  if (currentDocument === doc) {
    currentDocument = null; const next = [...documents.values()].filter(doc=>doc!==secondaryDocument&&doc.project===currentProject?.id).at(-1);if(!next&&secondaryDocument){const remaining=secondaryDocument;endFileSplit();selectDocument(remaining);renderTabs();return;}
    if(terminalView.showMostRecent()){agentView?.close();$('#app').classList.remove('chat-file-split','split-ai-last');editor.setModel(null);$('#empty').hidden=false;$('#preview-content').replaceChildren();$('#image-editor').hidden=true;updateToolbar();renderTabs();return;}
    if (next) selectDocument(next,{keepChat});
    else { if(agentView.selected){if(!agentView.visible)agentView.resume();else $('#app').classList.remove('chat-file-split');}editor.setModel(null); $('#empty').hidden = false; $('#preview-content').replaceChildren(); $('#image-editor').hidden = true; updateToolbar(); }
  }
  renderTabs();
}
function updateToolbar() {
  const previewHandle=document.querySelector<HTMLElement>('.preview-heading')!;
  previewHandle.draggable=Boolean(currentDocument);
  previewHandle.classList.toggle('file-pane-drag-handle',Boolean(currentDocument));
  if(currentDocument){previewHandle.dataset.project=currentDocument.project;previewHandle.dataset.path=currentDocument.path;previewHandle.title='Drag to move or split file';}
  else{delete previewHandle.dataset.project;delete previewHandle.dataset.path;previewHandle.removeAttribute('title');}
  $('#save').hidden = currentDocument?.kind === 'image';
  $('#refresh-file').hidden = currentDocument?.kind !== 'text' && currentDocument?.kind !== 'image';
  $('.view-switch').hidden = currentDocument?.kind === 'image';
  syncFileModeButtons($('.view-switch'),currentDocument,chooseFileView(currentDocument,mode),setView);
  $('#save').disabled = !currentDocument?.dirty || Boolean(currentDocument.saving);
  $('.topbar').classList.toggle('has-document', Boolean(currentDocument));
  $('#workspace').classList.toggle('no-file',!currentDocument);
  if(!currentDocument){
    mainLive.hide();
    editor.setModel(null);
    const preview=$('#preview-content');previewRequests.set(preview,(previewRequests.get(preview)||0)+1);preview.replaceChildren();$('#preview-pane').classList.remove('pdf-only');$('#preview-kind').textContent='';
    disposePdf($('#image-editor'));$('#image-editor').replaceChildren();$('#image-editor').hidden=true;
    $('#empty').hidden=Boolean(currentProject);
    if(!secondaryDocument){activeFileKey=null;$('#app').dataset.fileFocused='false';}
  }
}
async function saveFile(target?:OpenDocument|Event|null) {
  const doc = target&&'key'in target ? target : currentDocument;
  if (!doc?.dirty || !doc.model || doc.saving) return;
  const content = doc.model.getValue(); doc.saving = true; updateToolbar(); status('Saving…');
  try {
    const result = await api<{version:string;size:number}>(fileUrl('file', doc), { method: 'PUT', body: JSON.stringify({ content, version: doc.version, bom: doc.bom }) });
    doc.version = result.version; doc.savedContent = content; doc.dirty = doc.model.getValue() !== content;
    status(doc.dirty ? 'Saved · newer edits are still unsaved' : 'Saved to disk');
    if(doc.project===currentProject?.id)void changesView?.refresh();
  } catch (error) { status(errorMessage(error,'Operation failed.'), true); toast(errorMessage(error,'Operation failed.')); }
  finally { doc.saving = false; renderTabs(); updateToolbar(); }
}
// Files are read once when opened; this pulls in changes made on disk (for example by an agent).
async function reloadFile(doc:OpenDocument|null|undefined=currentDocument) {
  if (!doc || (doc.kind !== 'text' && doc.kind !== 'image') || doc.saving) return;
  if (doc.dirty && !await confirmDiscardFile(doc.name, 'reload')) return;
  status('Reloading…');
  try {
    const fresh = await api<TextFile|ImageFile>(fileUrl('file', doc));
    if (documents.get(doc.key) !== doc) return;
    if (fresh.kind === 'text' && doc.kind === 'text' && doc.model) {
      doc.savedContent = fresh.content; doc.version = fresh.version; doc.bom = fresh.bom; doc.size = fresh.size; doc.liveError = undefined;
      if (doc.model.getValue() !== fresh.content) doc.model.setValue(fresh.content);
      doc.dirty = false;
    } else if (fresh.kind === 'image' && doc.kind === 'image') {
      if (fresh.media === 'pdf') doc.pdfBlob = await api(fileUrl('image', doc), { image: true });
      else { const old = doc.imageUrl; doc.imageUrl = URL.createObjectURL(await api(fileUrl('image', doc), { image: true })); if (old) URL.revokeObjectURL(old); }
      const pane = filePanes.get(doc.key); if (pane) showImage(pane.preview, doc);
      if (currentDocument === doc) selectDocument(doc);
    } else { toast('This file changed type on disk. Close the tab and open it again.'); status('Ready'); return; }
    renderTabs(); updateToolbar(); status('Reloaded from disk');
    if (doc.project === currentProject?.id) void changesView?.refresh();
  } catch (error) { status(errorMessage(error, 'Operation failed.'), true); toast(errorMessage(error, 'Could not reload the file.')); }
}
function setView(view:string) {
  view=chooseFileView(currentDocument,view);
  if(currentDocument)currentDocument.view=view as FileView;
  mode = view; $('#workspace').dataset.view = view;
  syncFileModeButtons($('.view-switch'),currentDocument,view as FileView,setView);
  $('#editor').hidden=view!=='editor'||currentDocument?.kind==='image';
  if(view==='live'&&currentDocument)void mainLive.show(currentDocument);else mainLive.hide();
  editor.layout(); renderPreview();
  if (view !== 'editor' && !matchMedia('(prefers-reduced-motion: reduce)').matches) $('#preview-pane').animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
}
function schedulePreview(doc:OpenDocument|null=currentDocument) {
  if(!doc)return;pendingPreviews.add(doc);clearTimeout(previewTimer);
  previewTimer=setTimeout(()=>{
    for(const document of pendingPreviews){
      if(documents.get(document.key)!==document)continue;
      if(currentDocument===document)void renderPreview();
      if(secondaryDocument===document&&!secondaryPreview.hidden)void renderPreview({doc:document,target:secondaryPreview,secondary:true,view:'preview'});
      const pane=filePanes.get(document.key);if(pane&&!pane.preview.hidden)void renderPreview({doc:document,target:pane.preview,secondary:true,view:'preview'});
    }
    pendingPreviews.clear();
  },200);
}
async function renderPreview({doc=currentDocument,target=$('#preview-content'),secondary=false,view=mode}={}) {
  const generation=(previewRequests.get(target)||0)+1;previewRequests.set(target,generation);
  if (!doc || view !== 'preview'&&view !=='split') return;
  if(!target.dataset.scrollMemory){target.dataset.scrollMemory='1';target.addEventListener('scroll',()=>rememberPreviewScroll(target),{passive:true});
    // Copy plain text so pasting elsewhere (such as Google Docs) does not bring the preview's colors and fonts along.
    target.addEventListener('copy',event=>{const text=getSelection()?.toString();if(!text||!event.clipboardData)return;event.preventDefault();event.clipboardData.setData('text/plain',text);});}
  const scrollTop=previewShown.get(target)===doc?target.scrollTop:previewScrolls.get(doc)?.get(target)||0;previewShown.delete(target);
  try{
  target.replaceChildren(); if(!secondary)$('#preview-pane').classList.toggle('pdf-only',Boolean(doc.pdfBlob)); if(!secondary)$('#preview-kind').textContent = doc.kind === 'image' ? (doc.pdfBlob ? 'PDF file' : 'Image file') : doc.dirty ? 'Unsaved edits' : 'Current file';
  if (doc.kind === 'image') { showImage(target,doc); return; }
  if(!doc.model)return;const model=doc.model;
  const content = model.getValue();
  if (kind(doc.path) === 'markdown') {
    const markup=await marked.parse(content);if(generation!==previewRequests.get(target))return;
    target.innerHTML = DOMPurify.sanitize(markup, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'], FORBID_ATTR: ['style'] });
    addCodeCopyButtons(target);
    for (const link of target.querySelectorAll<HTMLAnchorElement>('a')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; link.addEventListener('click',event=>{const written=link.getAttribute('href')||'';if(linkOpener.enabled&&/^https?:\/\//i.test(written)){event.preventDefault();void linkOpener.open(written,currentProject||undefined);}}); }
    for (const img of target.querySelectorAll<HTMLImageElement>('img')) {
      const source = img.getAttribute('src') || '';
      img.removeAttribute('src');
      if (/^(https?:|\/\/)/i.test(source)) { img.removeAttribute('src'); img.alt = `${img.alt || 'Image'} (external image)`; continue; }
      const segments = doc.path.split('/'); segments.pop();
      try {
        for (const part of decodeURIComponent(source).split('/')) { if (part === '..') segments.pop(); else if (part !== '.') segments.push(part); }
        const blob = await api(fileUrl('image', { project: doc.project, path: segments.join('/') }), { image: true });
        if (generation !== previewRequests.get(target)) return;
        const objectUrl = URL.createObjectURL(blob); img.src = objectUrl; img.onload = () => URL.revokeObjectURL(objectUrl);
      }
      catch { img.removeAttribute('src'); }
    }
  } else if (language(doc.path) === 'html') {
    const iframe = document.createElement('iframe'); iframe.className = 'html-preview'; iframe.title = `Preview ${doc.name}`; iframe.setAttribute('sandbox', '');
    iframe.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">` + content;
    target.append(iframe);
  } else {
    const pre = document.createElement('pre'); pre.className = 'code-preview';
    const highlighted = await monaco.editor.colorize(content, model.getLanguageId(), { tabSize: 2 });
    if (generation !== previewRequests.get(target)) return; pre.innerHTML = highlighted; target.append(pre);
  }
  if(generation===previewRequests.get(target)){target.scrollTop=scrollTop;previewShown.set(target,doc);}
  }catch(error){
    if(generation!==previewRequests.get(target))return;
    const message=document.createElement('p');message.className='preview-error';message.setAttribute('role','alert');message.textContent=errorMessage(error,'Could not render this preview.');target.replaceChildren(message);
  }
}

async function refreshSessions() {
  try {
    const [data, metadata] = await Promise.all([api<SessionSnapshot>('/api/local-sessions'), api<{projects:Workspace[];defaultProject:string}>('/api/projects')]);
    sessionData = { agents: data.agents || [], sessions: data.sessions || [] };usagePanel.setAgents([...sessionData.agents,...terminalAgents]);for(const agent of sessionData.agents)notifications?.observe(agent);
    if(!draggedProject&&!reorderingProjects){const ranks=new Map(metadata.projects.map((project,index)=>[project.id,index]));projects.sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));}
    for (const project of projects) { const latest = metadata.projects.find(item => item.id === project.id); if (latest) project.branch = latest.branch; }
    const selectedSession=agentView.selected;
    if(selectedSession?.local&&!data.sessions?.some(record=>record.id===selectedSession.saved_session_id))agentView.close();
    if(selectedSession?.archived&&data.sessions){const saved=data.sessions.find(record=>record.id===selectedSession.id);if(saved)agentView.syncSaved(saved);else agentView.close();}
    if(!draggedProject&&!reorderingProjects)renderProjects();const selected=agentView.selected;const fresh=sessionData.agents.find(agent=>agent.pane_id===selected?.pane_id);if(fresh)updateAITabStatus(fresh);
  } catch {}
}
function openFolderPathDialog() { $('#folder-error').textContent = ''; $('#folder-dialog').showModal(); $('#folder-path').focus(); }
const addWorkspaceDialog=createAddWorkspaceDialog({api,icon,onManual:openFolderPathDialog,onCreated:async project=>{if(!projects.some(item=>item.id===project.id))projects.push(project);await selectProject(project);void refreshSessions();}});
function openFolderDialog(){addWorkspaceDialog.open();}

const addFolderIcon=icon('folder');
const addFolderMark=document.createElementNS('http://www.w3.org/2000/svg','path');
addFolderMark.setAttribute('d','M12 11v6m-3-3h6');addFolderIcon.append(addFolderMark);
$('#open-folder').replaceChildren(addFolderIcon);
$('#open-folder').title='Add workspace';
$('#open-folder').onclick = openFolderDialog; $('#empty-open').onclick = openFolderDialog;
$('#browse-folder').onclick=async()=>{
 const button=$('#browse-folder');button.disabled=true;button.textContent='Choosing…';$('#folder-error').textContent='';
 try{const selected=await api<{path:string|null}>('/api/select-workspace-folder',{method:'POST'});if(selected.path&&$('#folder-dialog').open){$('#folder-path').value=selected.path;$('#folder-path').focus();}}
 catch(error){$('#folder-error').textContent=errorMessage(error,'Could not choose a folder.');}
 finally{button.disabled=false;button.textContent='Browse…';}
};
$('#folder-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter instanceof HTMLButtonElement?event.submitter:$('#folder-form').querySelector<HTMLButtonElement>('[type=submit]')!;button.disabled = true;$('#folder-error').textContent = '';
  try { const project = await api<Workspace>('/api/projects', { method: 'POST', body: JSON.stringify({ path: $('#folder-path').value.trim() }) }); if (!projects.some(p => p.id === project.id)) projects.push(project); $('#folder-dialog').close(); await selectProject(project); void refreshSessions(); }
  catch (error) { $('#folder-error').textContent = errorMessage(error,'Operation failed.'); }
  finally { button.disabled = false; }
};
for (const button of document.querySelectorAll<HTMLButtonElement>('.close-dialog')) button.onclick = () => button.closest<HTMLDialogElement>('dialog')?.close();
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-view]')) button.onclick = () => setView(button.dataset.view||'editor');
$('#refresh-file').onclick = () => { void reloadFile(); }; $('#save').onclick = saveFile; $('#refresh-files').onclick = refreshTree; $('#filter').oninput = filterTree;
$('#settings-icon').append(icon('settings')); $('#host-icon').append(icon('monitor'));
let fileOpenMode='new';try{if(localStorage.getItem('ai-web.file-open-mode')==='replace')fileOpenMode='replace';}catch{}
const fileOpenSetting=document.createElement('div');fileOpenSetting.className='setting-row';fileOpenSetting.innerHTML='<div><strong>Opening files</strong><small>Unsaved tabs are always kept</small></div><select aria-label="Opening files"><option value="new">Open a new tab</option><option value="replace">Replace selected file tab</option></select>';document.querySelector<HTMLElement>('.settings-footnote')!.before(fileOpenSetting);const fileOpenSelect=fileOpenSetting.querySelector<HTMLSelectElement>('select')!;fileOpenSelect.value=fileOpenMode;fileOpenSelect.onchange=()=>{fileOpenMode=fileOpenSelect.value;try{localStorage.setItem('ai-web.file-open-mode',fileOpenMode);}catch{}};
let appearance = { compact: false, fontSize: 13, wrap: false };
try { appearance = { ...appearance, ...JSON.parse(localStorage.getItem('ai-web.appearance') || '{}') }; } catch {}
function applyAppearance() {
  const fontSize = [12, 13, 14, 15, 16].includes(Number(appearance.fontSize)) ? Number(appearance.fontSize) : 13;
  $('#app').dataset.density = appearance.compact ? 'compact' : 'comfortable';
  editor.updateOptions({ fontSize, wordWrap: appearance.wrap ? 'on' : 'off' });secondaryEditor?.updateOptions({fontSize,wordWrap:appearance.wrap?'on':'off'});
  $('#compact-setting').checked = Boolean(appearance.compact); $('#wrap-setting').checked = Boolean(appearance.wrap); $('#font-setting').value = String(fontSize);
}
applyAppearance();
$('#settings').onclick = () => $('#settings-dialog').showModal();
for (const control of [$('#compact-setting'), $('#wrap-setting'), $('#font-setting')]) control.onchange = () => {
  appearance = { compact: $('#compact-setting').checked, wrap: $('#wrap-setting').checked, fontSize: Number($('#font-setting').value) };
  try { localStorage.setItem('ai-web.appearance', JSON.stringify(appearance)); } catch {}
  applyAppearance();
};
const toggleSidebar = () => {const hidden=$('#app').classList.toggle('sidebar-hidden');document.documentElement.dataset.workspacesHidden=String(hidden);$('#show-sidebar').setAttribute('aria-expanded',String(!hidden));editor.layout();};
function setFilesOpen(open:boolean, persist = true) {
  $('#app').classList.toggle('files-hidden', !open);
  document.documentElement.dataset.filesHidden=String(!open);
  $('#toggle-files').setAttribute('aria-expanded', String(open));
  if (persist) { try { localStorage.setItem('ai-web.files-open', String(open)); } catch {} }
  editor.layout();
}
function toggleFiles() { setFilesOpen($('#app').classList.contains('files-hidden')); }
$('#toggle-files').onclick = toggleFiles;
$('#close-files').onclick = () => setFilesOpen(false);
$('#files-toggle-icon').append(icon('panel-right'));
$('#toggle-files').querySelector<HTMLElement>('.files-toggle-label')!?.remove();
$('#toggle-files').title='Files (Ctrl+Shift+E)';
$('#show-sidebar').title='Workspaces (Ctrl+B)';
const narrowLayout = matchMedia('(max-width: 900px)');
narrowLayout.addEventListener('change', event => { if (event.matches) setFilesOpen(false, false); });
$('#collapse').append(icon('panel')); $('#show-sidebar').append(icon('panel')); $('#search-icon').append(icon('search'));
$('#collapse').onclick = toggleSidebar; $('#show-sidebar').onclick = toggleSidebar;
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.shiftKey&&!event.altKey&&event.key.toLowerCase()==='j'&&!event.isComposing&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopPropagation();jumpToAttention();}},true);
document.addEventListener('keydown', event => {
  if (eventElement(event)?.closest<HTMLElement>('#agent-panel')) return;
  if(eventElement(event)?.closest<HTMLElement>('#secondary-file')&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveFile(secondaryDocument);return;}
  const control = event.ctrlKey || event.metaKey;
  if (control && event.key.toLowerCase() === 's') { event.preventDefault(); if(!gitView?.activeProject)saveFile(); }
  if (control && event.key.toLowerCase() === 'o') { event.preventDefault(); if (!document.querySelector<HTMLElement>('dialog[open]')!) openFolderDialog(); }
  if (control && event.shiftKey && event.key.toLowerCase() === 'v'&&!gitView?.activeProject) { event.preventDefault(); setView(mode === 'editor' ? 'preview' : 'editor'); }
  if (control && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSidebar(); }
  if (control && event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); toggleFiles(); }
  if (!gitView?.activeProject && event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !eventElement(event)?.closest<HTMLElement>('input,textarea,[contenteditable=true],.monaco-editor,dialog')) {
    if(terminalView.inputMostRecent('/')) event.preventDefault();
  }
});
window.addEventListener('beforeunload', event => { if(window.paneDesktop)checkpointWorkbench();if (!window.paneDesktop&&[...documents.values()].some(doc => doc.dirty)) { event.preventDefault(); event.returnValue = ''; } });
async function start() {
  let rememberedFiles; try { rememberedFiles = localStorage.getItem('ai-web.files-open'); } catch {}
  setFilesOpen(!narrowLayout.matches && rememberedFiles !== 'false', false);
  const data = await api<{projects:Workspace[];defaultProject:string}>('/api/projects'); projects = data.projects;
  let remembered:string|null=null;try{remembered=localStorage.getItem('ai-web.selected-workspace');}catch{}
  const recovery=window.paneDesktop?readWorkbenchJournal():null;restoringWorkbench=Boolean(recovery);
  const requested = new URLSearchParams(location.search).get('project')||recovery?.selected||remembered;
  const selected=projects.find(p => p.id === requested) || projects.find(p => p.id === data.defaultProject) || projects[0];
  currentProject=selected||null;terminalView.setProject(currentProject);
  terminalView.restore(projects);
  if(recovery){
    let conflicts=0,missing=0;
    for(const saved of recovery.files){
      if(!projects.some(project=>project.id===saved.project))continue;
      try{
        await openFile(saved.project,saved.path,{newTab:true,...(saved.draft!==undefined?{recovery:{draft:saved.draft,version:saved.version}}:{})});const doc=documents.get(`${saved.project}:${saved.path}`);if(!doc)continue;
        if(saved.draft!==undefined&&doc.model){if(saved.version&&doc.version!==saved.version){doc.version=saved.version;conflicts++;}doc.model.setValue(saved.draft);}
        doc.view=chooseFileView(doc,saved.view);
        if(saved.pane){mountFilePane(doc,null);filePanes.get(doc.key)?.paneHeader.querySelector<HTMLButtonElement>(`[data-view=${saved.view}]`)?.click();}
      }catch{missing++;}
    }
    for(const id of recovery.git){const project=projects.find(project=>project.id===id);if(project)gitView?.prepare(project);}
    workspaceTabStates.clear();for(const view of recovery.views)if(projects.some(project=>project.id===view.project))workspaceTabStates.set(view.project,{...view,pane:view.pane,agent:null,agentVisible:false});
    terminalView.restoreLayout(recovery.layout);restoreTabPositions(recovery.positions);currentProject=null;
    if(conflicts||missing)toast(`${conflicts} recovered draft(s) have newer files on disk; saving is blocked to protect them. ${missing} file(s) could not be reopened.`);
  }
  restoringWorkbench=false;
  await selectProject(selected,true);workbenchReady=true;
  if(window.paneDesktop){
    window.paneDesktop.onCheckpoint(checkpointWorkbench);
    setInterval(()=>{if(document.hidden)return;const result=checkpointWorkbench();if(!result.saved&&!recoveryWarning){recoveryWarning=true;toast('Session recovery could not be saved. Save your files before quitting.');}},1000);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpointWorkbench();});
  }
  updateToolbar(); refreshSessions();
  setInterval(() => { refreshSessions(); }, 8000);
  $('#show-sidebar').setAttribute('aria-expanded',String(!$('#app').classList.contains('sidebar-hidden')));
}
const usagePanel=createUsagePanel({api});
 const agentView = createAgentView({api,icon,onStatus:agent=>{updateAITabStatus(agent);notifications?.observe(agent);},onSessionClosed:refreshSessions,onChange:()=>{if(agentView.visible){gitView?.deactivate();endFileSplit();}$('#app').classList.remove('chat-file-split');renderProjects();renderTabs();editor.layout();}});
$('.topbar').insertBefore($('#tabs'),$('.toolbar-actions'));
$('.topbar .toolbar-actions').append($('.view-switch'), $('#refresh-file'), $('#save'), $('#terminal-toggle'));
$('#terminal-toggle-icon').append(icon('terminal'));
const contentViews=document.createElement('div');contentViews.id='content-views';const editorStack=document.createElement('section');editorStack.id='editor-stack';editorStack.setAttribute('aria-label','File editor');contentViews.append($('#agent-panel'),editorStack);editorStack.append($('#workspace'));document.querySelector<HTMLElement>('main')!.append(contentViews);
const linkPreferences=createLinkPreferences(),linkOpener=createLinkOpener({preferences:linkPreferences,available:()=>window.paneDesktop?.browserVersion===1,openInApp:(url,project)=>{const target=project||currentProject;if(target)openBrowser(target,url);},openExternal:url=>{window.open(url,'_blank','noopener');}});
// Ctrl/Cmd+click on a web link in the source editor goes through the same choice.
monaco.editor.registerLinkOpener({open:resource=>{if(resource.scheme!=='http'&&resource.scheme!=='https')return false;void linkOpener.open(resource.toString(),currentProject||undefined);return true;}});
// Links in the Live Markdown editor open with Ctrl or Cmd held, as in most editors; only absolute web links, never relative paths.
document.addEventListener('click',event=>{
 if(!(event.ctrlKey||event.metaKey)||!(event.target instanceof Element))return;
 const link=event.target.closest<HTMLAnchorElement>('.live-markdown-content a[href]'),written=link?.getAttribute('href')||'';
 if(link&&/^https?:\/\//i.test(written)){event.preventDefault();void linkOpener.open(written,currentProject||undefined);}
},true);
const terminalView=createTerminalView({token,icon,onOpenBrowser:project=>openBrowser(project),onNotice:(message,duration)=>toast(message,duration),onOpenLink:(url,project)=>void linkOpener.open(url,project),onLocalAddress:(url,project)=>{if(linkPreferences.get().detect)linkOpener.announce(url,project);},onSelect:()=>{if(restoringWorkbench)return;const context=projects.find(project=>project.id===terminalView.focusedProjectId);if(context&&context.id!==currentProject?.id)void selectProject(context);else gitView?.deactivate();activeFileKey=null;document.querySelector<HTMLElement>("#app")!.dataset.fileFocused="false";agentView.close();},onSessionsChange:agents=>{for(const old of terminalAgents)if(!agents.some(agent=>agent.id===old.id))notifications?.remove(old.id);terminalAgents=sessionAttention.update(agents,!document.hidden&&document.hasFocus());for(const agent of agents)notifications?.observe({...agent,terminalSession:true});usagePanel.setAgents([...sessionData.agents,...terminalAgents]);if(!draggedProject&&!reorderingProjects)renderProjects();},onClose:visible=>{ $('#terminal-toggle').setAttribute('aria-pressed',String(visible)); $('.topbar').classList.toggle('terminal-active',visible); }});editorStack.append(terminalView.element);$('#terminal-toggle').title='New terminal';$('#terminal-toggle').setAttribute('aria-label','New terminal');$('#terminal-toggle').onclick=()=>{agentView.close();endFileSplit();terminalView.newSession(currentProject);};
new ResizeObserver(()=>editor.layout()).observe(editorStack);
const secondaryPane=document.createElement('section');secondaryPane.id='secondary-file';secondaryPane.hidden=true;secondaryPane.setAttribute('aria-label','Second file editor');secondaryPane.innerHTML='<header><span class="secondary-file-title"></span><button type="button" class="icon-button" aria-label="Merge split panes" title="Merge split panes"></button></header><div class="secondary-code"></div><div class="secondary-image" hidden></div>';contentViews.append(secondaryPane);secondaryPane.querySelector<HTMLButtonElement>('button')!.append(icon('close'));secondaryPane.querySelector<HTMLButtonElement>('button')!.onclick=()=>{if(secondaryDocument)closeDocument(secondaryDocument);};
const secondaryLiveElement=document.createElement('div');secondaryPane.append(secondaryLiveElement);
const secondaryLive=createLiveMarkdownSurface(secondaryLiveElement,{save:doc=>{void saveFile(doc);},loadImage:loadLiveImage,fallback:reason=>{if(secondaryDocument)secondaryDocument.liveError=reason;setSecondaryView('editor');toast(reason);}});
const secondarySwitch=document.createElement('div');secondarySwitch.className='pane-file-view';secondarySwitch.innerHTML='<button type="button" data-secondary-view="editor">Editor</button><button type="button" data-secondary-view="preview">Preview</button>';secondaryPane.querySelector<HTMLElement>('header')!.insertBefore(secondarySwitch,secondaryPane.querySelector<HTMLButtonElement>('header button')!);
const secondaryPreview=document.createElement('div');secondaryPreview.className='secondary-preview preview-content';secondaryPreview.hidden=true;secondaryPane.append(secondaryPreview);
secondaryPane.querySelector<HTMLElement>('header')!.draggable=true;secondaryPane.querySelector<HTMLElement>('header')!.classList.add('file-pane-drag-handle');
secondaryPane.querySelector<HTMLButtonElement>('header > button')!.setAttribute('aria-label','Close file pane');secondaryPane.querySelector<HTMLButtonElement>('header > button')!.title='Close file pane';
secondaryPane.addEventListener('pointerdown',()=>{if(secondaryDocument&&activeFileKey!==secondaryDocument.key)focusSecondaryFile();});
const fileZoom=document.createElement('button');fileZoom.type='button';fileZoom.className='terminal-pane-zoom';fileZoom.setAttribute('aria-label','Maximize file pane');fileZoom.title='Maximize file pane';fileZoom.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M6 2H2v4M10 2h4v4M2 10v4h4M14 10v4h-4"/></svg>';secondaryPane.querySelector<HTMLElement>('header')!.insertBefore(fileZoom,secondaryPane.querySelector<HTMLButtonElement>('header > button')!);
let fileZoomAnimation:Animation|undefined;
fileZoom.onclick=()=>{
 fileZoomAnimation?.cancel();const before=secondaryPane.getBoundingClientRect();
 const zoomed=$('#app').classList.toggle('file-pane-maximized');
 fileZoom.setAttribute('aria-label',zoomed?'Restore file pane':'Maximize file pane');fileZoom.title=zoomed?'Restore file pane':'Maximize file pane';fileZoom.setAttribute('aria-pressed',String(zoomed));
 const after=secondaryPane.getBoundingClientRect();
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches && before.width && after.width)fileZoomAnimation=secondaryPane.animate([{transform:`translate(${before.left-after.left}px,${before.top-after.top}px) scale(${before.width/after.width},${before.height/after.height})`,transformOrigin:'top left'},{transform:'none',transformOrigin:'top left'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
 requestAnimationFrame(()=>secondaryEditor?.layout());
};
function setSecondaryView(view:FileView){
 view=chooseFileView(secondaryDocument,view);
 secondarySwitch.hidden=secondaryDocument?.kind==='image';secondaryMode=view;
 secondaryPane.querySelector<HTMLElement>('.secondary-code')!.hidden=view!=='editor'||secondaryDocument?.kind==='image';
 secondaryPane.querySelector<HTMLElement>('.secondary-image')!.hidden=view!=='editor'||secondaryDocument?.kind!=='image';
 secondaryPreview.hidden=view!=='preview';
 syncFileModeButtons(secondarySwitch,secondaryDocument,view,setSecondaryView,'secondaryView');
 if(view==='live'&&secondaryDocument)void secondaryLive.show(secondaryDocument);else secondaryLive.hide();
 if(secondaryDocument)void renderPreview({doc:secondaryDocument,target:secondaryPreview,secondary:true,view});
 requestAnimationFrame(()=>secondaryEditor?.layout());
}
for(const button of htmlChildren(secondarySwitch))button.onclick=()=>setSecondaryView(button.dataset.secondaryView==='preview'?'preview':'editor');
const defaultViewRow=document.createElement('div');defaultViewRow.className='setting-row';defaultViewRow.innerHTML='<div><strong>Default file view</strong><small>Choose Editor or Preview whenever a file is opened</small></div><select aria-label="Default file view"><option value="editor">Editor</option><option value="preview">Preview</option></select>';document.querySelector<HTMLElement>('.settings-footnote')!.before(defaultViewRow);const defaultViewSelect=defaultViewRow.querySelector<HTMLSelectElement>('select')!;defaultViewSelect.value=defaultFileView;defaultViewSelect.onchange=()=>{defaultFileView=defaultViewSelect.value==='preview'?'preview':'editor';try{localStorage.setItem('ai-web.default-file-view',defaultFileView);}catch{}};
function endFileSplit(){secondaryLive.hide();fileZoomAnimation?.cancel();$('#app').classList.remove('file-pane-maximized','file-pane-first');fileZoom.setAttribute('aria-label','Maximize file pane');fileZoom.setAttribute('aria-pressed','false');if(secondaryDocument&&secondaryEditor)secondaryDocument.secondaryViewState=secondaryEditor.saveViewState();secondaryDocument=null;secondaryEditor?.setModel(null);$('#secondary-file')?.setAttribute('hidden','');$('#app').classList.remove('file-file-split');}
function showSecondary(doc:OpenDocument){if(secondaryDocument&&secondaryEditor)secondaryDocument.secondaryViewState=secondaryEditor.saveViewState();secondaryDocument=doc;const handle=secondaryPane.querySelector<HTMLElement>("header")!;handle.dataset.project=doc.project;handle.dataset.path=doc.path;secondaryPane.hidden=false;secondaryPane.querySelector<HTMLElement>('.secondary-file-title')!.textContent=doc.name;const code=secondaryPane.querySelector<HTMLElement>('.secondary-code')!,image=secondaryPane.querySelector<HTMLElement>('.secondary-image')!;code.hidden=doc.kind==='image';image.hidden=doc.kind!=='image';if(!secondaryEditor)secondaryEditor=monaco.editor.create(code,{model:null,theme:'ai-web',fontFamily:'"JetBrains Mono", Consolas, monospace',fontSize:appearance.fontSize,wordWrap:appearance.wrap?'on':'off',minimap:{enabled:false},automaticLayout:true,scrollBeyondLastLine:false});secondaryEditor.setModel(doc.model || null);if(doc.secondaryViewState)secondaryEditor.restoreViewState(doc.secondaryViewState);image.replaceChildren();if(doc.kind==='image')showImage(image,doc);setSecondaryView(defaultFileView);requestAnimationFrame(()=>secondaryEditor?.layout());}
function dropTab(key:string,zone:DropZone){
 const droppedKind=documents.get(key)?.kind;if(droppedKind==='diff'||droppedKind==='browser'){const doc=documents.get(key)!;mountFilePane(doc,typeof zone==='object'?zone.id:terminalView.activePaneId,typeof zone==='object'?zone.direction:zone==='bottom'?'down':'right');return;}
 if(key!=='ai'&&(typeof zone==='object'||zone==='right'||zone==='bottom')){const doc=documents.get(key);if(doc)void dropFile({project:doc.project,path:doc.path},zone);return;}
 const doc=documents.get(key),isAI=key==='ai',edge=zone==='right'||zone==='bottom',app=$('#app');
 if(isAI&&app.classList.contains('file-file-split'))endFileSplit();
 if(edge&&!isAI&&doc&&doc===currentDocument&&secondaryDocument){const other=secondaryDocument;endFileSplit();if(other)selectDocument(other);showSecondary(doc);app.classList.add('file-file-split');app.classList.toggle('split-vertical',zone==='bottom');renderTabs();return;}
 if(!edge&&doc&&app.classList.contains('file-file-split')){if(zone==='secondary-file'){if(doc===currentDocument){const other=secondaryDocument;endFileSplit();if(other)selectDocument(other);showSecondary(doc);app.classList.add('file-file-split');}else showSecondary(doc);}else if(doc!==secondaryDocument)selectDocument(doc);else{const other=currentDocument;endFileSplit();selectDocument(doc);if(other)showSecondary(other);app.classList.add('file-file-split');}renderTabs();return;}
 if(doc&&!isAI&&!agentView.visible&&!app.classList.contains('chat-file-split')&&doc!==currentDocument){const primary=currentDocument;endFileSplit();if(!primary)return;agentView.suspend();showSecondary(doc);app.classList.add('file-file-split');app.classList.toggle('split-vertical',zone==='bottom');renderTabs();return;}
 endFileSplit();if(!agentView.selected)return;
 if(doc)selectDocument(doc,{keepChat:true});if(!currentDocument)return;if(!agentView.visible)agentView.resume();
 app.classList.add('chat-file-split');if(edge){app.classList.toggle('split-vertical',zone==='bottom');app.classList.toggle('split-ai-last',isAI);}else app.classList.toggle('split-ai-last',isAI?zone==='editor-stack':zone==='agent-panel');setView('editor');renderTabs();requestAnimationFrame(()=>editor.layout());
}
async function dropFile(file:DraggedFile,zone:DropZone){
  try{
    const primary=currentDocument,wasTerminal=terminalView.visible;
    openingSplit=true;
    try{await openFile(file.project,file.path,{newTab:true});}finally{openingSplit=false;}
    const doc=documents.get(`${file.project}:${file.path}`);if(!doc)return;
    if(!wasTerminal&&primary&&primary!==doc&&!filePanes.has(primary.key))mountFilePane(primary,null);
    const target=typeof zone==='object'?zone.id:terminalView.activePaneId;
    const direction=typeof zone==='object'?(zone.direction==='swap'&&!filePanes.has(doc.key)?'right':zone.direction):zone==='bottom'?'down':'right';
    mountFilePane(doc,target,direction);renderTabs();return;
  }catch(error){toast(errorMessage(error,'Operation failed.'));return;}
}
let browserCounter=0;
function browserTabIcon(favicon?:string){
 if(!favicon)return icon('globe');
 const wrapper=document.createElement('span'),image=new Image();wrapper.className='shared-file-icon';image.alt='';image.referrerPolicy='no-referrer';image.src=favicon;image.onerror=()=>wrapper.replaceChildren(icon('globe'));wrapper.append(image);return wrapper;
}
async function loadBrowserServers():Promise<BrowserServer[]>{
 const results=await Promise.allSettled(projects.map(project=>api<DevServerSnapshot>(`/api/dev-servers?${new URLSearchParams({project:project.id})}`).then(snapshot=>snapshot.rows.filter(row=>row.projectId===project.id&&row.status==='running'&&row.url).map(row=>({url:row.url!,label:`${row.url} · ${project.name}${project.branch?` · ${project.branch}`:''}`})))));
 return results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
}
function openBrowser(project:Workspace,url=''){
 if(window.paneDesktop?.browserVersion!==1)return;
 const doc:OpenDocument={key:`browser:${project.id}:${Date.now().toString(36)}${++browserCounter}`,project:project.id,path:url,name:'New tab',kind:'browser',url,dirty:false};
 documents.set(doc.key,doc);gitView?.deactivate();mountBrowserPane(doc,null);renderTabs();
}
function mountBrowserPane(doc:OpenDocument&{kind:'browser'},target:string|null|undefined,direction:'right'|'down'|'swap'='right'){
 const element=document.createElement('section');element.className='terminal-screen file-layout-pane browser-pane';
 element.innerHTML='<header class="terminal-pane-header"><span class="terminal-pane-title"></span><button class="terminal-pane-zoom" aria-label="Maximize browser pane"></button><button class="terminal-pane-close" aria-label="Close browser pane"></button></header><div class="file-layout-code"></div>';
 const header=element.querySelector<HTMLElement>('header')!,host=element.querySelector<HTMLElement>('.file-layout-code')!,zoom=element.querySelector<HTMLButtonElement>('.terminal-pane-zoom')!,title=header.querySelector<HTMLElement>('.terminal-pane-title')!;
 title.textContent=doc.name;zoom.innerHTML=fileZoom.innerHTML;
 header.querySelector<HTMLButtonElement>('.terminal-pane-close')!.append(icon('close'));header.querySelector<HTMLButtonElement>('.terminal-pane-close')!.onclick=()=>closeDocument(doc);
 const browser=setupBrowserPane({host,icon,initialUrl:doc.url,loadServers:loadBrowserServers,openExternal:url=>{window.open(url,'_blank','noopener');},onFocus:()=>element.dispatchEvent(new Event('pointerdown',{bubbles:true})),onState:state=>{
  doc.url=state.url;doc.path=state.url;doc.favicon=state.favicon;doc.name=state.title||(state.url?new URL(state.url).host:'New tab');title.textContent=doc.name;renderTabs();
 }});
 const pane:FilePane={id:`file:${doc.key}`,project:projects.find(project=>project.id===doc.project)!,element,paneHeader:header,paneZoom:zoom,preview:element,editor:null,layout:()=>{},dispose:browser.destroy,onSelect:()=>{activeFileKey=doc.key;$('#app').dataset.fileFocused='true';agentView.close();renderTabs();}};
 filePanes.set(doc.key,pane);terminalView.placeFilePane(pane,target,direction);
 if(!doc.url)browser.focusAddress();
}
function mountFilePane(doc:OpenDocument,target:string|null|undefined,direction:'right'|'down'|'swap'='right'){
  if(doc.kind==='browser'){mountBrowserPane(doc,target,direction);return;}
  let pane=filePanes.get(doc.key);
  if(!pane){
    const element=document.createElement('section');element.className='terminal-screen file-layout-pane';
    element.innerHTML='<header class="terminal-pane-header"><span class="terminal-pane-title"></span><div class="pane-file-view"><button data-view="editor">Editor</button><button data-view="preview">Preview</button></div><button class="terminal-pane-zoom" aria-label="Maximize file pane"></button><button class="terminal-pane-close" aria-label="Close file pane"></button></header><div class="file-layout-code"></div><div class="file-layout-preview preview-content" hidden></div><div class="file-layout-image" hidden></div>';
    const header=element.querySelector<HTMLElement>('header')!,preview=element.querySelector<HTMLElement>('.file-layout-preview')!,code=element.querySelector<HTMLElement>('.file-layout-code')!,image=element.querySelector<HTMLElement>('.file-layout-image')!,zoom=element.querySelector<HTMLButtonElement>('.terminal-pane-zoom')!;
    header.querySelector<HTMLElement>('.terminal-pane-title')!.textContent=doc.name;zoom.innerHTML=fileZoom.innerHTML;
    header.querySelector<HTMLButtonElement>('.terminal-pane-close')!.append(icon('close'));header.querySelector<HTMLButtonElement>('.terminal-pane-close')!.onclick=()=>closeDocument(doc);
    let diffHeader:ReturnType<typeof setupDiffHeader>|undefined;
    const paneEditor=doc.kind==='diff'?monaco.editor.createDiffEditor(code,{theme:'ai-web',readOnly:true,originalEditable:false,fontFamily:'"JetBrains Mono", Consolas, monospace',fontSize:appearance.fontSize,wordWrap:appearance.wrap?'on':'off',minimap:{enabled:false},automaticLayout:true,scrollBeyondLastLine:false,...diffEditorOptions()}):doc.model?monaco.editor.create(code,{model:doc.model,theme:'ai-web',fontFamily:'"JetBrains Mono", Consolas, monospace',fontSize:appearance.fontSize,wordWrap:appearance.wrap?'on':'off',minimap:{enabled:false},automaticLayout:true,scrollBeyondLastLine:false}):null;
    if(doc.kind==='diff'){(paneEditor as monaco.editor.IStandaloneDiffEditor).setModel({original:doc.diffModels[0],modified:doc.diffModels[1]});header.querySelector<HTMLElement>('.pane-file-view')!.hidden=true;diffHeader=setupDiffHeader({header,anchor:zoom,diff:paneEditor as monaco.editor.IStandaloneDiffEditor,doc:{path:doc.path,name:doc.name,baseline:doc.baseline,stat:doc.diffStat},icon});}
    if(doc.kind!=='diff')paneEditor?.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS,()=>saveFile(doc));
    header.querySelector<HTMLElement>('.pane-file-view')!.hidden=doc.kind==='image'||doc.kind==='diff';
    const liveElement=document.createElement('div');element.append(liveElement);
    const live=createLiveMarkdownSurface(liveElement,{save:doc=>{void saveFile(doc);},loadImage:loadLiveImage,fallback:reason=>{doc.liveError=reason;setMode('editor');toast(reason);}});
    const setMode=(view:FileView)=>{view=chooseFileView(doc,view);element.dataset.fileView=view;code.hidden=view!=='editor'||doc.kind==='image';image.hidden=true;preview.hidden=view!=='preview';syncFileModeButtons(header.querySelector<HTMLElement>('.pane-file-view')!,doc,view,setMode);if(view==='live')void live.show(doc);else live.hide();void renderPreview({doc,target:preview,secondary:true,view});requestAnimationFrame(()=>paneEditor?.layout());};
    pane={id:`file:${doc.key}`,project:projects.find(project=>project.id===doc.project)!,element,paneHeader:header,paneZoom:zoom,preview,live,editor:paneEditor,layout:()=>{diffHeader?.layout(element.clientWidth);paneEditor?.layout();},onSelect:()=>{currentDocument=doc;activeFileKey=doc.key;$('#app').dataset.fileFocused='true';agentView.close();renderTabs();},};
    const initialView:FileView=doc.kind==='diff'?'editor':doc===secondaryDocument?secondaryMode:doc===currentDocument?chooseFileView(doc,mode):defaultFileView;
    filePanes.set(doc.key,pane);setMode(initialView);
  }
  terminalView.placeFilePane(pane,target,direction);
}
setupUnifiedTabOrder($('#unified-tabs'),order=>{tabOrder=order;});
window.paneDesktop?.onDialog?.(showAppDialog);
window.paneDesktop?.onBrowserOpen?.(url=>{if(currentProject)openBrowser(currentProject,url);});
tabDrag=setupTabDrag({tabs:$('#tabs'),content:contentViews,onReorder:()=>{},canDrop:(key,zone)=>{if(!key||!zone)return false;if(typeof zone==='object')return documents.has(key);const split=$('#app').classList.contains('chat-file-split')||$('#app').classList.contains('file-file-split');if(zone!=='right'&&zone!=='bottom')return split;if(key==='ai')return Boolean(agentView.selected&&currentDocument);return Boolean(documents.has(key)&&(terminalView.visible||agentView.visible||agentView.selected&&split||currentDocument&&currentDocument.key!==key));},onDrop:dropTab,onFileDrop:dropFile});

notifications=createNotifications({icon,isViewing:agent=>!document.hidden&&document.hasFocus()&&(agent.terminalSession?Boolean(terminalAgents.find(item=>item.id===agent.id)?.selected):agentView.visible&&Boolean(agent.agent_session?.value?agentView.selected?.agent_session?.value===agent.agent_session.value:agent.pane_id&&agentView.selected?.pane_id===agent.pane_id)),onOpen:agent=>{if(agent.terminalSession){agentView.close();if(agent.id)openTerminalAgent(agent.id);}else{agentView.open(agent);agentView.focusLatest();}}});
if(window.paneDesktop?.browserVersion===1)setupLinkSettings(linkPreferences);
setupColorTheme();setupSettings({icon,api});
setupFileActions({tree:$('#tree'),api,icon,getProject:()=>currentProject,guard:guardFileAction,changed:fileActionChanged,toast});
const subWorkspaceDialog=createWorktreeDialog({api,getProjects:()=>projects,onCreated:async (project,launch)=>{const existing=projects.find(item=>item.id===project.id);if(existing)Object.assign(existing,project);else projects.push(project);await selectProject(existing||project);if(launch)terminalView.startSession(existing||project,launch);toast(`Opened ${project.branch||project.name}`);}});
workspaceSidebar=createWorkspaceSidebar({icon,onCreateSubWorkspace:project=>{void subWorkspaceDialog.open(project);},onSelect:project=>{if(Date.now()-lastProjectDrag>300)void selectProject(project);},onAgentSelect:openTerminalAgent,onMenu:showWorkspaceMenu,setupDrag:setupProjectDrag});
changesView=setupChanges({api,icon,getProject:()=>currentProject,onOpenDiff:openDiff,onError:message=>toast(message),onStatuses:(id,data)=>fileGit.update(id,data)});
setupResources({api,getProjects:()=>projects,getTerminals:()=>terminalAgents,onError:message=>toast(message)});
devServers=setupDevServers({api,getProjects:()=>projects,onError:message=>toast(message),...(window.paneDesktop?.browserVersion===1?{onOpenUrl:(projectId:string,url:string)=>{const target=projects.find(project=>project.id===projectId);if(!target)return;void (currentProject?.id===target.id?Promise.resolve():selectProject(target)).then(()=>openBrowser(target,url));}}:{})});
setupHistory({api,getProjects:()=>projects,getCurrentProject:()=>currentProject,onResume:(record,project)=>{agentView.close();terminalView.resumeSession(record,project);}});
gitView=createGitPanel({api,icon,getProject:()=>currentProject,onTabsChanged:renderTabs,onActivate:project=>{if(currentProject?.id!==project.id)void selectProject(project);agentView.suspend();(document.activeElement as HTMLElement|null)?.blur();terminalView.setFocused(false);},onDeactivate:()=>{if(terminalView.visible)terminalView.setFocused(true);},onStartIssue:(project,issue)=>{const parent=project.parentId?projects.find(item=>item.id===project.parentId):project;if(parent)void subWorkspaceDialog.open(parent,{name:`issue-${issue.number}-${worktreeSlug(issue.title)}`.replace(/-$/,'').slice(0,80),note:`Issue #${issue.number}: ${issue.title}\n${issue.url}\n\n${issue.body}`});},onChanged:()=>{void changesView?.refresh();void refreshTree();void refreshSessions();},onOpenDiff:async(project,hash,file)=>{await openDiff(project,{path:file.path,added:null,removed:null,binary:false},hash);}});
titlebar=setupTitlebar({getProject:()=>projects.find(project=>project.id===(activeFileKey?documents.get(activeFileKey)?.project:terminalView.visible?terminalView.focusedProjectId:null))||currentProject,getAttention:()=>terminalAgents.map(agent=>({...agent,open:()=>openTerminalAgent(agent.id)}))});
startWorkingAnimation();
start().catch(error => { status(errorMessage(error,'Operation failed.'), true); toast(errorMessage(error,'Operation failed.')); });

// Refresh Monaco metrics when the bundled font has finished loading.
document.fonts.ready.then(() => { monaco.editor.remeasureFonts(); editor.layout(); });

for (const [selector, name] of [['#refresh-files','refresh'], ['#refresh-file','refresh'], ['#close-files','close'], ['.empty-symbol','folder'], ['#empty-open span','arrow']]) $(selector).replaceChildren(icon(name));
for (const button of document.querySelectorAll<HTMLButtonElement>('.dialog-heading .icon-button')) button.replaceChildren(icon('close'));
const refreshGit = document.createElement('button'); refreshGit.className = 'icon-button refresh-git'; refreshGit.setAttribute('aria-label', 'Refresh Git branches'); refreshGit.title = 'Refresh Git branches'; refreshGit.append(icon('refresh')); refreshGit.onclick = () => refreshSessions(); $('.section-head').append(refreshGit);
window.addEventListener('focus', () => { void refreshSessions(); });

setupPanelResize();
requestAnimationFrame(()=>requestAnimationFrame(()=>{document.documentElement.dataset.layoutReady='true';}));

function acknowledgeViewedSession(){terminalAgents=sessionAttention.update(terminalAgents,!document.hidden&&document.hasFocus());renderProjects();}
window.addEventListener('focus',acknowledgeViewedSession);document.addEventListener('visibilitychange',acknowledgeViewedSession);
