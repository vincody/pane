import {startWorkingAnimation} from './working-animation.js';
import {setupTitlebar} from './titlebar.js';
import {setupHistory} from './history.js';
import {setupChanges} from './changes.js';
import {showImage} from './image-viewer.js';
import {addCodeCopyButtons} from './markdown-copy.js';
import {positionTab, setupUnifiedTabOrder,forgetTabPosition} from './tab-position.js';
import {createNotifications} from './notifications.js';
import {setupSettings} from './settings-layout.js';
import {setupTabDrag} from './tab-drag.js';
import {fileIcon} from './file-icons.js';
import {createUsagePanel} from './usage.js';
import { createAgentView } from './agent-view.js';
import { createTerminalView } from './terminal-view.js';
import { setupPanelResize } from './panel-resize.js';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './styles.css';

self.MonacoEnvironment = { getWorker(_, label) {
  if (label === 'json') return new JsonWorker();
  if (label === 'typescript' || label === 'javascript') return new TsWorker();
  if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
  if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
  return new EditorWorker();
} };

const $ = selector => document.querySelector(selector);
const token = $('meta[name="ai-web-token"]').content;
const documents = new Map();
let notifications;
let titlebar;
let changesView;
let terminalAgents = [];
let sessionData = {agents:[],sessions:[]};
let tabOrder=[],tabDrag,secondaryDocument,secondaryEditor,secondarySaveBound=false;
let defaultFileView='editor',secondaryMode='editor';
let activeFileKey=null;
let openingSplit=false;
const filePanes=new Map();
function focusSecondaryFile(){
  if(!secondaryDocument)return;
  activeFileKey=secondaryDocument.key;$('#app').dataset.fileFocused='true';terminalView.setFocused(false);
  requestAnimationFrame(()=>{
    if(!secondaryDocument)return;
    if(secondaryMode==='preview'){secondaryPreview.tabIndex=-1;secondaryPreview.focus();}
    else if(secondaryDocument.kind==='image')secondaryPane.querySelector('.image-zoom-viewport')?.focus();
    else secondaryEditor?.focus();
  });
  renderTabs();
}
try{if(localStorage.getItem('ai-web.default-file-view')==='preview')defaultFileView='preview';}catch{}
const previewRequests=new WeakMap();
const expanded = new Set();
let projects = [], currentProject, currentDocument, mode = 'editor', previewGeneration = 0, previewTimer, toastTimer;
const paths = {
  folder: 'M3 7V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  edit: 'm16 3 5 5 M4 20l4-1 13-13-4-4L4 15Z',
  write: 'M12 8v8 M8 12h8 M5 3h14v18H5Z',
  run: 'm5 5 7 7-7 7 M13 19h6',
  read: 'M4 5h6l2 2 2-2h6v14h-6l-2 2-2-2H4Z M12 7v14',
  branch: 'M6 8v8 M18 8a6 6 0 0 1-6 6H6 M6 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M6 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z M14 2v6h6',
  code: 'm8 8-4 4 4 4 m8-8 4 4-4 4 m-3-13-2 18',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z m-2 13 5-5 4 4 3-3 6 6 M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  markdown: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M6 15V9l3 3 3-3v6 m5-6v6 m-2-2 2 2 2-2',
  search: 'm21 21-4.3-4.3 M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
  panel: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M9 3v18',
  'panel-right': 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M15 3v18',
  monitor: 'M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M12 17v4 M8 21h8',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 2l1 4 M4 12l1 4a8 8 0 0 0 13 2',
  plus: 'M12 5v14 M5 12h14',
  pet: 'M5 13V5l5 3h4l5-3v8a7 7 0 0 1-14 0Z M9 12h.01 M15 12h.01 M10 16h4',
  stop: 'M7 7h10v10H7Z',
  close: 'm6 6 12 12 M18 6 6 18',
  terminal: 'M4 5h16v14H4Z M7 9l3 3-3 3 M12 15h4',
  maximize: 'M8 3H3v5 M3 3l7 7 M16 21h5v-5 M21 21l-7-7',
  'chevron-right': 'm9 5 7 7-7 7',
  'chevron-up': 'm5 15 7-7 7 7',
  'chevron-down': 'm5 9 7 7 7-7',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.1.7-1.7 1.1-1.7 2.7 M12 17h.01',
  arrow: 'M7 17 17 7 M7 7h10v10',
};
function icon(name = 'file') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.65', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', paths[name] || paths.file); svg.append(shape);
  svg.classList.add(`file-${name}`); return svg;
}
function kind(path) {
  if (/\.(png|jpe?g|gif|webp|avif|ico|svg)$/i.test(path)) return 'image';
  if (/\.(md|markdown)$/i.test(path)) return 'markdown';
  return 'code';
}
function language(path) {
  const ext = path.split('.').pop().toLowerCase();
  return ({ js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', css: 'css', scss: 'scss', html: 'html', htm: 'html', md: 'markdown', py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp', sh: 'shell', ps1: 'powershell', toml: 'ini', yml: 'yaml', yaml: 'yaml', sql: 'sql', xml: 'xml', svg: 'xml', txt: 'plaintext' })[ext] || 'plaintext';
}
function status(message, error = false) { if (error) toast(message); }
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 6500);
}
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'X-AI-Web-Token': token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (!response.ok) { const data = await response.json().catch(() => ({})); const error=new Error(data.error || `Request failed (${response.status}).`);error.status=response.status;throw error; }
  return options.image ? response.blob() : response.json();
}
const fileUrl = (route, doc = currentDocument) => `/api/${route}?${new URLSearchParams({ project: doc.project, path: doc.path })}`;

monaco.editor.defineTheme('ai-web', {
  base: 'vs-dark', inherit: true,
  rules: [{ token: 'comment', foreground: '9B9183', fontStyle: 'italic' }, { token: 'keyword', foreground: 'E8875F' }, { token: 'string', foreground: 'A8C17C' }, { token: 'number', foreground: 'D6A0C9' }, { token: 'type', foreground: '6CB8D6' }, { token: 'delimiter', foreground: '8F859D' }],
  colors: { 'editor.background': '#1F1E1B', 'editor.foreground': '#E9E5DC', 'editorLineNumber.foreground': '#61594F', 'editorLineNumber.activeForeground': '#E9E5DC', 'editor.lineHighlightBackground': '#FFFFFF04', 'editor.selectionBackground': '#D9775722', 'editorCursor.foreground': '#D97757', 'editorIndentGuide.background1': '#FFFFFF08', 'editorIndentGuide.activeBackground1': '#D9775722', 'editorWidget.background': '#2B2925', 'editorWidget.border': '#49443C' },
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

let draggedProject=null,lastProjectDrag=0,reorderingProjects=false;
const clearProjectDrop=()=>{for(const group of document.querySelectorAll('.workspace-group'))group.classList.remove('drop-before','drop-after');};
async function reorderProjects(id,target,after=false){
 if(reorderingProjects||id===target)return;const ordered=projects.map(project=>project.id);const from=ordered.indexOf(id);if(from<0||!ordered.includes(target))return;ordered.splice(from,1);ordered.splice(ordered.indexOf(target)+(after?1:0),0,id);if(ordered.every((item,index)=>item===projects[index].id))return;
 reorderingProjects=true;const before=new Map([...document.querySelectorAll('.workspace-group')].map(group=>[group.dataset.project,group.getBoundingClientRect().top]));
 try{const result=await api('/api/project-order',{method:'POST',body:JSON.stringify({ids:ordered})});const existing=new Map(projects.map(project=>[project.id,project]));projects=result.projects.map(project=>Object.assign(existing.get(project.id)||{},project));renderProjects();
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches)for(const group of document.querySelectorAll('.workspace-group')){const delta=(before.get(group.dataset.project) ?? group.getBoundingClientRect().top)-group.getBoundingClientRect().top;if(delta)group.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});}
 document.querySelector(`.workspace-group[data-project="${CSS.escape(id)}"] .project-button`)?.focus();status('Project order saved');
 }catch(failure){toast(failure.message);await refreshSessions();}finally{reorderingProjects=false;}
}
function setupProjectDrag(project,button,group){
 button.draggable=true;button.title=project.root+' · Drag to reorder · Alt+↑/↓';
 button.addEventListener('keydown',event=>{if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const index=projects.findIndex(item=>item.id===project.id),next=projects[index+(event.key==='ArrowUp'?-1:1)];if(next)void reorderProjects(project.id,next.id,event.key==='ArrowDown');}});
 button.ondragstart=event=>{if(reorderingProjects){event.preventDefault();return;}draggedProject=project.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',project.id);group.classList.add('project-dragging');};
 button.ondragend=()=>{draggedProject=null;lastProjectDrag=Date.now();group.classList.remove('project-dragging');clearProjectDrop();};
 group.ondragover=event=>{if(!draggedProject||draggedProject===project.id)return;event.preventDefault();event.dataTransfer.dropEffect='move';clearProjectDrop();const bounds=group.getBoundingClientRect();group.classList.add(event.clientY>bounds.top+bounds.height/2?'drop-after':'drop-before');};
 group.ondragleave=event=>{if(!group.contains(event.relatedTarget))group.classList.remove('drop-before','drop-after');};
 group.ondrop=event=>{if(!draggedProject)return;event.preventDefault();const id=draggedProject,after=group.classList.contains('drop-after');draggedProject=null;lastProjectDrag=Date.now();clearProjectDrop();void reorderProjects(id,project.id,after);};
}
function renderProjects() {
  $('#projects').replaceChildren();
  for (const project of projects) {
    const selected = project.id === currentProject?.id;
    const group = document.createElement('section'); group.className = `workspace-group${selected ? ' selected' : ''}`; group.dataset.project = project.id;
    const row = document.createElement('div'); row.className = 'project-row';
    const button = document.createElement('button'); button.className = `project-button${selected ? ' active' : ''}`; if(selected) button.setAttribute('aria-current','page');
    button.title = project.root; button.append(icon('folder'));
    const label = document.createElement('span'); label.className = 'project-text'; label.textContent = project.name; button.append(label);
    button.onclick = () => {if(Date.now()-lastProjectDrag>300)void selectProject(project);};
    setupProjectDrag(project,button,group);
    button.oncontextmenu = event => { event.preventDefault(); showWorkspaceMenu(project, event.clientX, event.clientY, button); };
    button.onkeydown = event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const bounds = button.getBoundingClientRect(); showWorkspaceMenu(project, bounds.left + 20, bounds.bottom, button); } };
    const more = document.createElement('button'); more.className = 'project-more'; more.append(icon('more')); more.setAttribute('aria-label', `Actions for ${project.name}`); more.setAttribute('aria-haspopup', 'menu');
    more.onclick = () => { const bounds = more.getBoundingClientRect(); showWorkspaceMenu(project, bounds.left, bounds.bottom, more); };
    row.append(button,more); group.append(row);
    const agents = terminalAgents.filter(agent => agent.project === project.id);
    const attentionCount = agents.filter(agent => agent.status === 'blocked').length;
    if (attentionCount) {
      const attention = document.createElement('span'); attention.className = 'workspace-attention';
      attention.textContent = `${attentionCount} ${attentionCount === 1 ? 'needs' : 'need'} attention`;
      attention.title = `${attentionCount} ${attentionCount === 1 ? 'session requires' : 'sessions require'} your input or review`;
      button.append(attention);
    }
    if (project.branch || agents.length) {
      const children = document.createElement('div'); children.className = 'workspace-children';
      if (project.branch) { const branch = document.createElement('div'); branch.className = 'workspace-branch'; branch.append(icon('branch')); const name = document.createElement('span'); name.textContent = project.branch; branch.append(name); branch.title = `Git branch: ${project.branch}`; children.append(branch); }
      for (const agent of agents) {
        const card=document.createElement('button'); card.type='button'; card.className=`agent-card terminal-agent-card${agent.selected?' selected':''}`; card.dataset.status=agent.status; card.dataset.provider=agent.agent;
        const provider=document.createElement('span'); provider.className='provider-mark';
        if(['codex','claude','opencode'].includes(agent.agent)){const image=document.createElement('img');image.src=`/agents/${agent.agent}.svg`;image.alt='';provider.append(image);}else provider.append(icon('terminal'));
        const state=document.createElement('span');state.className='agent-state';state.textContent=agent.status==='working'?'⠏':agent.status==='blocked'?'!':'';provider.append(state);
        const content=document.createElement('span');content.className='terminal-agent-content';
        const title=document.createElement('strong');title.textContent=agent.name===project.name?agent.agent.charAt(0).toUpperCase()+agent.agent.slice(1):agent.name;
        const detail=document.createElement('span');detail.className='agent-meta';const status={working:'Working',blocked:'Needs your input',idle:'Ready'}[agent.status];detail.textContent=`${agent.agent} · ${status}`;content.append(title,detail);card.append(provider,content);card.title=detail.textContent;card.setAttribute('aria-label',`${title.textContent}: ${status}`);
        card.onclick=()=>{agentView.close();terminalView.select(agent.id);};children.append(card);
      }
      group.append(children);
    }
    $('#projects').append(group);
  }
  titlebar?.refresh();
}
async function selectProject(project) {
  if (terminalView?.visible) terminalView.toggle();
  agentView?.close();
  closeWorkspaceMenu(false);
  if (!project) { currentProject = null;changesView?.projectChanged(); $('#empty').hidden = false; renderProjects(); $('#tree').replaceChildren(); return; }
  currentProject = project; changesView?.projectChanged();titlebar?.refresh();$('#empty').hidden = true; expanded.clear(); $('#filter').value = '';
  terminalView?.setProject(project);
  renderProjects(); await refreshTree();
  if (!currentDocument) status(project.root);
}
let menuOrigin, renameProject;
function closeWorkspaceMenu(restoreFocus = true) {
  const menu = $('#workspace-menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  if (restoreFocus && menuOrigin?.isConnected) menuOrigin.focus();
}
function showWorkspaceMenu(project, x, y, origin) {
  const menu = $('#workspace-menu'); menuOrigin = origin; menu.replaceChildren();
  const title = document.createElement('div'); title.className = 'context-title'; title.textContent = project.name; menu.append(title);
  const actions = [
    ['Open workspace', async () => { await selectProject(project); setFilesOpen(true); }],
    ['Rename in web', () => { renameProject = project; $('#workspace-name').value = project.name; $('#rename-error').textContent = ''; $('#rename-dialog').showModal(); $('#workspace-name').select(); }],
    ['Copy folder path', async () => { await navigator.clipboard.writeText(project.root); toast('Folder path copied'); }],
    ['Refresh files', async () => { await selectProject(project); setFilesOpen(true); }],
    ['Move up',()=>{const index=projects.findIndex(item=>item.id===project.id);if(index>0)return reorderProjects(project.id,projects[index-1].id);}],
    ['Move down',()=>{const index=projects.findIndex(item=>item.id===project.id);if(index>=0&&index<projects.length-1)return reorderProjects(project.id,projects[index+1].id,true);}],
    ['Remove from web', () => removeProject(project)],
  ];
  for (const [label, action] of actions) {
    const item = document.createElement('button'); item.type = 'button'; item.setAttribute('role', 'menuitem'); item.textContent = label;
    if (label === 'Remove from web') item.className = 'danger-action';
    item.onclick = async () => { closeWorkspaceMenu(false); try { await action(); } catch (error) { toast(error.message); } };
    menu.append(item);
  }
  const note = document.createElement('div'); note.className = 'context-note'; note.textContent = 'Files on disk are never deleted.'; menu.append(note);
  menu.hidden = false;
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
  menu.querySelector('button').focus();
}
async function removeProject(project) {
  const tabs = [...documents.values()].filter(doc => doc.project === project.id);
  if (tabs.some(doc => doc.saving)) { toast('A file is still saving. Try again when it finishes.'); return; }
  if (tabs.some(doc => doc.dirty) && !confirm(`Remove ${project.name} from Pane and discard its unsaved edits? Files on disk will not be deleted.`)) return;
  await api(`/api/projects?${new URLSearchParams({ project: project.id })}`, { method: 'DELETE' });
  for (const doc of tabs) { doc.dirty = false; closeDocument(doc); }
  projects = projects.filter(item => item.id !== project.id);
  if (currentProject?.id === project.id) await selectProject(projects.find(item => item.id === currentDocument?.project) || projects[0]); else renderProjects();
  await refreshSessions();
  status('Workspace removed from web'); toast('Removed from Pane. Your folder and sessions remain on disk. Use Open folder to add it again.');
}
$('#workspace-menu').onkeydown = event => {
  const items = [...$('#workspace-menu').querySelectorAll('button')];
  const position = items.indexOf(document.activeElement);
  if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); closeWorkspaceMenu(); }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (position + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }
};
document.addEventListener('pointerdown', event => { if (!event.target.closest('#workspace-menu')) closeWorkspaceMenu(false); });
window.addEventListener('resize', () => closeWorkspaceMenu(false));
document.addEventListener('scroll', event => { if (!$('#workspace-menu').contains(event.target)) closeWorkspaceMenu(false); }, true);
$('#rename-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    const updated = await api(`/api/projects?${new URLSearchParams({ project: renameProject.id })}`, { method: 'PATCH', body: JSON.stringify({ name: $('#workspace-name').value.trim() }) });
    Object.assign(renameProject, updated); renderProjects();
    renderTabs(); $('#rename-dialog').close(); toast('Workspace renamed in Pane');
  } catch (error) { $('#rename-error').textContent = error.message; }
  finally { button.disabled = false; }
};

async function refreshTree() {
  if (!currentProject) return;
  const project = currentProject;
  try {
    const list = await treeDirectory(project, '', 0);
    if (project.id === currentProject?.id) { $('#tree').replaceChildren(list); filterTree(); }
  } catch (error) { status(error.message, true); }
}
async function treeDirectory(project, path, depth) {
  const { entries } = await api(`/api/tree?${new URLSearchParams({ project: project.id, path })}`);
  const list = document.createElement('ul'); list.className = 'tree-list'; list.setAttribute('role', 'group');
  for (const entry of entries) {
    const item = document.createElement('li'); item.dataset.name = entry.name.toLowerCase();
    const button = document.createElement('button'); button.className = 'file-row'; button.style.paddingLeft = `${8 + depth * 13}px`; button.title = entry.path;
    button.dataset.path = entry.path; button.dataset.project = project.id; button.setAttribute('role', 'treeitem');
    button.setAttribute('aria-label', entry.name);
    if (currentDocument?.project === project.id && currentDocument.path === entry.path) button.classList.add('active');
    const arrow = document.createElement('span'); arrow.className = 'chevron'; if (entry.type === 'directory') arrow.append(icon('chevron-right')); button.append(arrow);
    button.append(entry.type==='directory'?icon('folder'):fileIcon(entry.name,icon));
    const label = document.createElement('span'); label.textContent = entry.name; button.append(label); item.append(button); list.append(item);
    if (entry.type === 'directory') {
      button.setAttribute('aria-expanded', expanded.has(entry.path) ? 'true' : 'false');
      if (expanded.has(entry.path)) { arrow.replaceChildren(icon('chevron-down')); item.append(await treeDirectory(project, entry.path, depth + 1)); }
      button.onclick = async () => {
        const children = item.querySelector('ul');
        if (children) { children.remove(); expanded.delete(entry.path); arrow.replaceChildren(icon('chevron-right')); button.setAttribute('aria-expanded', 'false'); }
        else { try { button.disabled = true; item.append(await treeDirectory(project, entry.path, depth + 1)); expanded.add(entry.path); arrow.replaceChildren(icon('chevron-down')); button.setAttribute('aria-expanded', 'true'); } catch (error) { toast(error.message); } finally { button.disabled = false; } }
        filterTree();
      };
    } else if (entry.type === 'link') {
      button.disabled = true; button.title = 'Linked entries are not browsed.';
    } else {
      button.draggable=true;button.dataset.draggableFile='true';
      button.onclick = () => openFile(project.id, entry.path).catch(error => { status(error.message, true); toast(error.message); });
    }
  }
  if (!entries.length) { const empty = document.createElement('li'); empty.className = 'tree-empty'; empty.textContent = 'This folder is empty.'; list.append(empty); }
  return list;
}
function filterTree() {
  const query = $('#filter').value.toLowerCase();
  for (const item of [...$('#tree').querySelectorAll('li[data-name]')].reverse()) {
    item.hidden = Boolean(query) && !item.dataset.name.includes(query) && ![...item.querySelectorAll('li[data-name]')].some(child => !child.hidden);
  }
}

async function openFile(project, path, {newTab=false}={}) {
  const replacement=!newTab&&fileOpenMode==='replace'?currentDocument:null;
  const key = `${project}:${path}`;
  if (documents.has(key)) return selectDocument(documents.get(key));
  status('Opening file…');
  const doc = { key, project, path, name: path.split('/').pop(), ...(await api(fileUrl('file', { project, path }))) };
  if (documents.has(key)) return selectDocument(documents.get(key));
  doc.dirty = false;
  if (doc.kind === 'text') {
    doc.savedContent = doc.content;
    doc.model = monaco.editor.createModel(doc.content, language(path), monaco.Uri.parse(`ai-web://${project}/${path}`));
    doc.subscription = doc.model.onDidChangeContent(() => {
      doc.dirty = doc.model.getValue() !== doc.savedContent; renderTabs();
      if (currentDocument === doc) { updateToolbar(); status(doc.dirty ? 'Unsaved changes' : 'Ready'); schedulePreview(); }
    });
  } else doc.imageUrl = URL.createObjectURL(await api(fileUrl('image', doc), { image: true }));
  if(documents.has(key)){doc.subscription?.dispose();doc.model?.dispose();if(doc.imageUrl)URL.revokeObjectURL(doc.imageUrl);return selectDocument(documents.get(key));}
  const replace=replacement&&replacement===currentDocument&&documents.get(replacement.key)===replacement&&!replacement.dirty&&!replacement.saving;
  if(replace){const entries=[...documents];documents.clear();for(const [entryKey,entry] of entries)if(entryKey===replacement.key)documents.set(key,doc);else documents.set(entryKey,entry);}else documents.set(key,doc);
  selectDocument(doc);if(replace){replacement.subscription?.dispose();replacement.model?.dispose();if(replacement.imageUrl)URL.revokeObjectURL(replacement.imageUrl);}

}
async function openDiff(project,file){
 const result=await api(fileUrl('diff',{project:project.id,path:file.path})),key=`diff:${project.id}:${file.path}`;
 let doc=documents.get(key);
 if(doc){doc.diffModels[0].setValue(result.original);doc.diffModels[1].setValue(result.modified);terminalView.select(`file:${key}`);return;}
 doc={key,project:project.id,path:file.path,name:`${file.path.split('/').pop()} · Diff`,kind:'diff',dirty:false,baseline:result.baseline,diffModels:[monaco.editor.createModel(result.original,language(file.path),monaco.Uri.parse(`git-base://${project.id}/${file.path}`)),monaco.editor.createModel(result.modified,language(file.path),monaco.Uri.parse(`git-current://${project.id}/${file.path}`))]};
 documents.set(key,doc);mountFilePane(doc,null);renderTabs();
}
function selectDocument(doc,{keepChat=false}={}) {
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
  $('#image-editor').replaceChildren();
  if (doc.kind === 'image') showImage($('#image-editor'),doc);
  renderTabs(); updateToolbar(); renderPreview();
  setView(defaultFileView);
  for (const row of $('#tree').querySelectorAll('.file-row')) row.classList.toggle('active', row.dataset.project === doc.project && row.dataset.path === doc.path);
  status(doc.dirty ? 'Unsaved changes' : 'Ready'); if (doc.model&&!keepChat) editor.focus();
}
function renderTabs() {
  updateToolbar();
  $('#tabs').replaceChildren();$('#tabs').setAttribute('role','tablist');$('#tabs').setAttribute('aria-label','Open tabs');
  const selectedAgent=agentView?.selected,split=$('#app').classList.contains('chat-file-split'),chatActive=agentView?.visible&&!split;
  if(selectedAgent){const tab=document.createElement('div');tab.dataset.tabKey='ai';tab.className=`file-tab ai-session-tab${chatActive?' active':''}`;tab.tabIndex=0;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(chatActive));const title=selectedAgent.display_agent || selectedAgent.name || selectedAgent.terminal_title_stripped || 'AI';tab.setAttribute('aria-label',`AI · ${title}`);const mark=document.createElement('span');mark.className='ai-tab-mark';if(['codex','claude','opencode'].includes(selectedAgent.agent)){const image=document.createElement('img');image.src=`/agents/${selectedAgent.agent}.svg`;image.alt='';mark.append(image);}else mark.append(icon('code'));const indicator=document.createElement('span');indicator.className='ai-tab-indicator';mark.append(indicator);tab.append(mark);const label=document.createElement('span');label.className='ai-tab-name';label.textContent=title;tab.append(label);const close=document.createElement('button');close.className='tab-close';close.setAttribute('aria-label','Close AI tab');close.append(icon('close'));close.onclick=event=>{event.stopPropagation();agentView.close();};tab.append(close);tab.onclick=()=>{endFileSplit();if(!agentView.visible||split){$('#app').classList.remove('chat-file-split');agentView.resume();}};tab.onkeydown=event=>{if(event.target===tab&&['Enter',' '].includes(event.key)){event.preventDefault();tab.click();}};$('#tabs').append(tab);}
  for (const doc of documents.values()) {
    const tab = document.createElement('div'); tab.dataset.tabKey=doc.key;tab.className = `file-tab${activeFileKey===doc.key&&!chatActive ? ' active' : ''}`; tab.title = `${projects.find(p => p.id === doc.project)?.name}/${doc.path}`; tab.tabIndex = 0; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(activeFileKey===doc.key&&!chatActive));
    tab.append(fileIcon(doc.path,icon)); const name = document.createElement('span'); name.className = 'tab-name'; name.textContent = doc.name; tab.append(name);
    if (doc.dirty) { const dot = document.createElement('span'); dot.className = 'tab-dirty'; dot.setAttribute('aria-label', 'Unsaved changes'); tab.append(dot); }
    const close = document.createElement('button'); close.className = 'tab-close'; close.append(icon('close')); close.setAttribute('aria-label', `Close ${doc.name}`); close.onclick = event => { event.stopPropagation(); closeDocument(doc); }; tab.append(close);
    tab.onclick = () => selectDocument(doc); tab.onkeydown = event => { if (event.target === tab && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); tab.click(); } }; $('#tabs').append(tab);
  }
  const present=[...$('#tabs').children].map(tab=>tab.dataset.tabKey);tabOrder=tabOrder.filter(key=>present.includes(key));for(const key of present)if(!tabOrder.includes(key))tabOrder.push(key);for(const key of tabOrder)$('#tabs').append([...$('#tabs').children].find(tab=>tab.dataset.tabKey===key));tabDrag?.decorate();
  for (const tab of $('#tabs').children) positionTab(tab, `file:${tab.dataset.tabKey}`);
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
 for(const card of document.querySelectorAll('.agent-card'))if(card.dataset.sessionKey===(agent.agent_session?.value || agent.pane_id || agent.id)){card.dataset.status=raw;const mark=card.querySelector('.agent-state');mark.setAttribute('aria-label',raw);if(raw!=='working')mark.replaceChildren();}
 const labels={working:'Working',idle:'Idle · Ready for a prompt',blocked:'Needs your input',connecting:'Connecting',occupied:'Open in another app',saved:'Saved session',error:'Connection error',unknown:'Status unavailable'};
 tab.dataset.status=state;tab.title=labels[state] || state;
 const indicator=tab.querySelector('.ai-tab-indicator');if(state==='working'){if(!/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(indicator.textContent))indicator.textContent='⠏';}else indicator.textContent=state==='blocked'?'!':state==='occupied'?'–':'';indicator.setAttribute('role','img');indicator.setAttribute('aria-label',labels[state] || state);
}
function closeDocument(doc) {
  const keepChat=agentView.visible&&!$('#app').classList.contains('chat-file-split');
  if (doc.dirty && !confirm(`Discard unsaved changes to ${doc.name}?`)) return;
  if(filePanes.has(doc.key)){
    const pane=filePanes.get(doc.key);filePanes.delete(doc.key);
    documents.delete(doc.key);forgetTabPosition(`file:${doc.key}`);
    if(currentDocument===doc)currentDocument=null;
    terminalView.removeFilePane(`file:${doc.key}`);pane.editor?.dispose();for(const model of doc.diffModels||[])model.dispose();
    previewRequests.set(pane.preview,(previewRequests.get(pane.preview)||0)+1);
    doc.subscription?.dispose();doc.model?.dispose();if(doc.imageUrl)URL.revokeObjectURL(doc.imageUrl);
    if(!terminalView.visible){const next=[...documents.values()].at(-1);if(next)selectDocument(next);}
    updateToolbar();renderTabs();return;
  }
  const closingSecondary=secondaryDocument===doc,keepTerminal=closingSecondary&&terminalView.visible;
  if(closingSecondary)endFileSplit();
  forgetTabPosition(`file:${doc.key}`);
  documents.delete(doc.key); doc.subscription?.dispose(); doc.model?.dispose(); if (doc.imageUrl) URL.revokeObjectURL(doc.imageUrl);
  if(keepTerminal){if(currentDocument===doc){currentDocument=null;editor.setModel(null);}activeFileKey=null;$('#app').dataset.fileFocused='false';terminalView.showMostRecent();updateToolbar();renderTabs();return;}
  if (currentDocument === doc) {
    currentDocument = null; const next = [...documents.values()].filter(doc=>doc!==secondaryDocument).at(-1);if(!next&&secondaryDocument){const remaining=secondaryDocument;endFileSplit();selectDocument(remaining);renderTabs();return;}
    if(terminalView.showMostRecent()){agentView?.close();$('#app').classList.remove('chat-file-split','split-ai-last');editor.setModel(null);$('#empty').hidden=false;$('#preview-content').replaceChildren();$('#image-editor').hidden=true;updateToolbar();renderTabs();return;}
    if (next) selectDocument(next,{keepChat});
    else { if(agentView.selected){if(!agentView.visible)agentView.resume();else $('#app').classList.remove('chat-file-split');}editor.setModel(null); $('#empty').hidden = false; $('#preview-content').replaceChildren(); $('#image-editor').hidden = true; updateToolbar(); }
  }
  renderTabs();
}
function updateToolbar() {
  $('#save').disabled = !currentDocument?.dirty || currentDocument.saving;
  $('.topbar').classList.toggle('has-document', Boolean(currentDocument));
  $('#workspace').classList.toggle('no-file',!currentDocument);
  if(!currentDocument){
    editor.setModel(null);
    const preview=$('#preview-content');previewRequests.set(preview,(previewRequests.get(preview)||0)+1);preview.replaceChildren();$('#preview-kind').textContent='';
    $('#image-editor').replaceChildren();$('#image-editor').hidden=true;
    $('#empty').hidden=Boolean(currentProject);
    if(!secondaryDocument){activeFileKey=null;$('#app').dataset.fileFocused='false';}
  }
}
async function saveFile(target) {
  const doc = target?.key ? target : currentDocument;
  if (!doc?.dirty || !doc.model || doc.saving) return;
  const content = doc.model.getValue(); doc.saving = true; updateToolbar(); status('Saving…');
  try {
    const result = await api(fileUrl('file', doc), { method: 'PUT', body: JSON.stringify({ content, version: doc.version, bom: doc.bom }) });
    doc.version = result.version; doc.savedContent = content; doc.dirty = doc.model.getValue() !== content;
    status(doc.dirty ? 'Saved · newer edits are still unsaved' : 'Saved to disk');
  } catch (error) { status(error.message, true); toast(error.message); }
  finally { doc.saving = false; renderTabs(); updateToolbar(); }
}
function setView(view) {
  mode = view; $('#workspace').dataset.view = view;
  for (const button of document.querySelectorAll('button[data-view]')) { button.classList.toggle('active', button.dataset.view === view); button.setAttribute('aria-pressed', String(button.dataset.view === view)); }
  editor.layout(); renderPreview();
  if (view !== 'editor' && !matchMedia('(prefers-reduced-motion: reduce)').matches) $('#preview-pane').animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
}
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(() => renderPreview(), 200); }
async function renderPreview({doc=currentDocument,target=$('#preview-content'),secondary=false}={}) {
  const generation=(previewRequests.get(target)||0)+1;previewRequests.set(target,generation);
  if (!doc || (secondary ? secondaryMode : mode) === 'editor') return;
  target.replaceChildren(); if(!secondary)$('#preview-kind').textContent = doc.kind === 'image' ? 'Image file' : doc.dirty ? 'Unsaved edits' : 'Current file';
  if (doc.kind === 'image') { showImage(target,doc); return; }
  const content = doc.model.getValue();
  if (kind(doc.path) === 'markdown') {
    target.innerHTML = DOMPurify.sanitize(marked.parse(content), { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'], FORBID_ATTR: ['style'] });
    addCodeCopyButtons(target);
    for (const link of target.querySelectorAll('a')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    for (const img of target.querySelectorAll('img')) {
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
    const highlighted = await monaco.editor.colorize(content, doc.model.getLanguageId(), { tabSize: 2 });
    if (generation !== previewRequests.get(target)) return; pre.innerHTML = highlighted; target.append(pre);
  }
}

async function refreshSessions() {
  try {
    const [data, metadata] = await Promise.all([api('/api/local-sessions'), api('/api/projects')]);
    sessionData = { agents: data.agents || [], sessions: data.sessions || [] };usagePanel.setAgents([...sessionData.agents,...terminalAgents]);for(const agent of sessionData.agents)notifications?.observe(agent);
    if(!draggedProject&&!reorderingProjects){const ranks=new Map(metadata.projects.map((project,index)=>[project.id,index]));projects.sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));}
    for (const project of projects) { const latest = metadata.projects.find(item => item.id === project.id); if (latest) project.branch = latest.branch; }
    if(agentView.selected?.local&&!data.sessions?.some(record=>record.id===agentView.selected.saved_session_id))agentView.close();
    if(agentView.selected?.archived&&data.sessions){const saved=data.sessions.find(record=>record.id===agentView.selected.id);if(saved)agentView.syncSaved(saved);else agentView.close();}
    if(!draggedProject&&!reorderingProjects)renderProjects();const selected=agentView.selected;const fresh=sessionData.agents.find(agent=>agent.pane_id===selected?.pane_id);if(fresh)updateAITabStatus(fresh);
  } catch {}
}
function openFolderDialog() { $('#folder-error').textContent = ''; $('#folder-dialog').showModal(); $('#folder-path').focus(); }

$('#open-folder').replaceChildren(icon('folder'), document.createTextNode('Folder'));
$('#open-folder').onclick = openFolderDialog; $('#empty-open').onclick = openFolderDialog;
$('#folder-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('#folder-error').textContent = '';
  try { const project = await api('/api/projects', { method: 'POST', body: JSON.stringify({ path: $('#folder-path').value.trim() }) }); if (!projects.some(p => p.id === project.id)) projects.push(project); $('#folder-dialog').close(); await selectProject(project); void refreshSessions(); }
  catch (error) { $('#folder-error').textContent = error.message; }
  finally { button.disabled = false; }
};
for (const button of document.querySelectorAll('.close-dialog')) button.onclick = () => button.closest('dialog').close();
for (const button of document.querySelectorAll('button[data-view]')) button.onclick = () => setView(button.dataset.view);
$('#save').onclick = saveFile; $('#refresh-files').onclick = refreshTree; $('#filter').oninput = filterTree;
$('#settings-icon').append(icon('settings')); $('#host-icon').append(icon('monitor'));
let fileOpenMode='new';try{if(localStorage.getItem('ai-web.file-open-mode')==='replace')fileOpenMode='replace';}catch{}
const fileOpenSetting=document.createElement('div');fileOpenSetting.className='setting-row';fileOpenSetting.innerHTML='<div><strong>Opening files</strong><small>Unsaved tabs are always kept</small></div><select aria-label="Opening files"><option value="new">Open a new tab</option><option value="replace">Replace selected file tab</option></select>';document.querySelector('.settings-footnote').before(fileOpenSetting);const fileOpenSelect=fileOpenSetting.querySelector('select');fileOpenSelect.value=fileOpenMode;fileOpenSelect.onchange=()=>{fileOpenMode=fileOpenSelect.value;try{localStorage.setItem('ai-web.file-open-mode',fileOpenMode);}catch{}};
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
const toggleSidebar = () => {const hidden=$('#app').classList.toggle('sidebar-hidden');$('#show-sidebar').setAttribute('aria-expanded',String(!hidden));editor.layout();};
function setFilesOpen(open, persist = true) {
  $('#app').classList.toggle('files-hidden', !open);
  $('#toggle-files').setAttribute('aria-expanded', String(open));
  if (persist) { try { localStorage.setItem('ai-web.files-open', String(open)); } catch {} }
  editor.layout();
}
function toggleFiles() { setFilesOpen($('#app').classList.contains('files-hidden')); }
$('#toggle-files').onclick = toggleFiles;
$('#close-files').onclick = () => setFilesOpen(false);
$('#files-toggle-icon').append(icon('panel-right'));
$('#toggle-files').querySelector('.files-toggle-label')?.remove();
$('#toggle-files').title='Files (Ctrl+Shift+E)';
$('#show-sidebar').title='Workspaces (Ctrl+B)';
const narrowLayout = matchMedia('(max-width: 900px)');
narrowLayout.addEventListener('change', event => { if (event.matches) setFilesOpen(false, false); });
$('#collapse').append(icon('panel')); $('#show-sidebar').append(icon('panel')); $('#search-icon').append(icon('search'));
$('#collapse').onclick = toggleSidebar; $('#show-sidebar').onclick = toggleSidebar;
document.addEventListener('keydown', event => {
  if (event.target.closest('#agent-panel')) return;
  if(event.target.closest('#secondary-file')&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveFile(secondaryDocument);return;}
  const control = event.ctrlKey || event.metaKey;
  if (control && event.key.toLowerCase() === 's') { event.preventDefault(); saveFile(); }
  if (control && event.key.toLowerCase() === 'o') { event.preventDefault(); if (!document.querySelector('dialog[open]')) openFolderDialog(); }
  if (control && event.shiftKey && event.key.toLowerCase() === 'v') { event.preventDefault(); setView(mode === 'editor' ? 'preview' : 'editor'); }
  if (control && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSidebar(); }
  if (control && event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); toggleFiles(); }
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !event.target.closest('input,textarea,[contenteditable=true],.monaco-editor,dialog')) {
    if(terminalView.inputMostRecent('/')) event.preventDefault();
  }
});
window.addEventListener('beforeunload', event => { if ([...documents.values()].some(doc => doc.dirty)) { event.preventDefault(); event.returnValue = ''; } });
async function start() {
  let rememberedFiles; try { rememberedFiles = localStorage.getItem('ai-web.files-open'); } catch {}
  setFilesOpen(!narrowLayout.matches && rememberedFiles !== 'false', false);
  const data = await api('/api/projects'); projects = data.projects;
  const requested = new URLSearchParams(location.search).get('project');
  await selectProject(projects.find(p => p.id === requested) || projects.find(p => p.id === data.defaultProject) || projects[0]);
  updateToolbar(); refreshSessions();
  setInterval(() => { refreshSessions(); }, 8000);
  if (matchMedia('(max-width: 700px)').matches) $('#app').classList.add('sidebar-hidden');
  $('#show-sidebar').setAttribute('aria-expanded',String(!$('#app').classList.contains('sidebar-hidden')));
}
const usagePanel=createUsagePanel({api,icon});
 const agentView = createAgentView({api,icon,onStatus:agent=>{updateAITabStatus(agent);notifications?.observe(agent);},onSessionClosed:refreshSessions,onChange:()=>{if(agentView.visible)endFileSplit();$('#app').classList.remove('chat-file-split');renderProjects();renderTabs();editor.layout();}});
$('.topbar').insertBefore($('#tabs'),$('.toolbar-actions'));
$('.topbar .toolbar-actions').append($('.view-switch'), $('#save'), $('#terminal-toggle'));
$('#terminal-toggle-icon').append(icon('terminal'));
const contentViews=document.createElement('div');contentViews.id='content-views';const editorStack=document.createElement('section');editorStack.id='editor-stack';editorStack.setAttribute('aria-label','File editor');contentViews.append($('#agent-panel'),editorStack);editorStack.append($('#workspace'));document.querySelector('main').append(contentViews);
const terminalView=createTerminalView({token,icon,onSelect:()=>{activeFileKey=null;document.querySelector("#app").dataset.fileFocused="false";agentView.close();},onSessionsChange:agents=>{for(const old of terminalAgents)if(!agents.some(agent=>agent.id===old.id))notifications?.remove(old.id);terminalAgents=agents;for(const agent of agents)notifications?.observe({...agent,terminalSession:true});usagePanel.setAgents([...sessionData.agents,...terminalAgents]);if(!draggedProject&&!reorderingProjects)renderProjects();},onClose:visible=>{ $('#terminal-toggle').setAttribute('aria-pressed',String(visible)); $('.topbar').classList.toggle('terminal-active',visible); }});editorStack.append(terminalView.element);$('#terminal-toggle').title='New terminal';$('#terminal-toggle').setAttribute('aria-label','New terminal');$('#terminal-toggle').onclick=()=>{agentView.close();endFileSplit();terminalView.newSession(currentProject);};
new ResizeObserver(()=>editor.layout()).observe(editorStack);
const secondaryPane=document.createElement('section');secondaryPane.id='secondary-file';secondaryPane.hidden=true;secondaryPane.setAttribute('aria-label','Second file editor');secondaryPane.innerHTML='<header><span class="secondary-file-title"></span><button type="button" class="icon-button" aria-label="Merge split panes" title="Merge split panes"></button></header><div class="secondary-code"></div><div class="secondary-image" hidden></div>';contentViews.append(secondaryPane);secondaryPane.querySelector('button').append(icon('close'));secondaryPane.querySelector('button').onclick=()=>{if(secondaryDocument)closeDocument(secondaryDocument);};
const secondarySwitch=document.createElement('div');secondarySwitch.className='pane-file-view';secondarySwitch.innerHTML='<button type="button" data-secondary-view="editor">Editor</button><button type="button" data-secondary-view="preview">Preview</button>';secondaryPane.querySelector('header').insertBefore(secondarySwitch,secondaryPane.querySelector('header button'));
const secondaryPreview=document.createElement('div');secondaryPreview.className='secondary-preview preview-content';secondaryPreview.hidden=true;secondaryPane.append(secondaryPreview);
secondaryPane.querySelector('header').draggable=true;secondaryPane.querySelector('header').classList.add('file-pane-drag-handle');
secondaryPane.querySelector('header > button').setAttribute('aria-label','Close file pane');secondaryPane.querySelector('header > button').title='Close file pane';
secondaryPane.addEventListener('pointerdown',()=>{if(secondaryDocument&&activeFileKey!==secondaryDocument.key)focusSecondaryFile();});
const fileZoom=document.createElement('button');fileZoom.type='button';fileZoom.className='terminal-pane-zoom';fileZoom.setAttribute('aria-label','Maximize file pane');fileZoom.title='Maximize file pane';fileZoom.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M6 2H2v4M10 2h4v4M2 10v4h4M14 10v4h-4"/></svg>';secondaryPane.querySelector('header').insertBefore(fileZoom,secondaryPane.querySelector('header > button'));
let fileZoomAnimation;
fileZoom.onclick=()=>{
 fileZoomAnimation?.cancel();const before=secondaryPane.getBoundingClientRect();
 const zoomed=$('#app').classList.toggle('file-pane-maximized');
 fileZoom.setAttribute('aria-label',zoomed?'Restore file pane':'Maximize file pane');fileZoom.title=zoomed?'Restore file pane':'Maximize file pane';fileZoom.setAttribute('aria-pressed',String(zoomed));
 const after=secondaryPane.getBoundingClientRect();
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches && before.width && after.width)fileZoomAnimation=secondaryPane.animate([{transform:`translate(${before.left-after.left}px,${before.top-after.top}px) scale(${before.width/after.width},${before.height/after.height})`,transformOrigin:'top left'},{transform:'none',transformOrigin:'top left'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
 requestAnimationFrame(()=>secondaryEditor?.layout());
};
function setSecondaryView(view){
 secondaryMode=view;
 secondaryPane.querySelector('.secondary-code').hidden=view==='preview'||secondaryDocument?.kind==='image';
 secondaryPane.querySelector('.secondary-image').hidden=view==='preview'||secondaryDocument?.kind!=='image';
 secondaryPreview.hidden=view!=='preview';
 for(const button of secondarySwitch.children){button.classList.toggle('active',button.dataset.secondaryView===view);button.setAttribute('aria-pressed',String(button.dataset.secondaryView===view));}
 if(view==='preview'&&secondaryDocument)void renderPreview({doc:secondaryDocument,target:secondaryPreview,secondary:true});
 requestAnimationFrame(()=>secondaryEditor?.layout());
}
for(const button of secondarySwitch.children)button.onclick=()=>setSecondaryView(button.dataset.secondaryView);
const defaultViewRow=document.createElement('div');defaultViewRow.className='setting-row';defaultViewRow.innerHTML='<div><strong>Default file view</strong><small>Choose Editor or Preview whenever a file is opened</small></div><select aria-label="Default file view"><option value="editor">Editor</option><option value="preview">Preview</option></select>';document.querySelector('.settings-footnote').before(defaultViewRow);const defaultViewSelect=defaultViewRow.querySelector('select');defaultViewSelect.value=defaultFileView;defaultViewSelect.onchange=()=>{defaultFileView=defaultViewSelect.value;try{localStorage.setItem('ai-web.default-file-view',defaultFileView);}catch{}};
function endFileSplit(){fileZoomAnimation?.cancel();$('#app').classList.remove('file-pane-maximized','file-pane-first');fileZoom.setAttribute('aria-label','Maximize file pane');fileZoom.setAttribute('aria-pressed','false');if(secondaryDocument&&secondaryEditor)secondaryDocument.secondaryViewState=secondaryEditor.saveViewState();secondaryDocument=null;secondaryEditor?.setModel(null);$('#secondary-file')?.setAttribute('hidden','');$('#app').classList.remove('file-file-split');}
function showSecondary(doc){if(secondaryDocument&&secondaryEditor)secondaryDocument.secondaryViewState=secondaryEditor.saveViewState();secondaryDocument=doc;const handle=secondaryPane.querySelector("header");handle.dataset.project=doc.project;handle.dataset.path=doc.path;secondaryPane.hidden=false;secondaryPane.querySelector('.secondary-file-title').textContent=doc.name;const code=secondaryPane.querySelector('.secondary-code'),image=secondaryPane.querySelector('.secondary-image');code.hidden=doc.kind==='image';image.hidden=doc.kind!=='image';if(!secondaryEditor)secondaryEditor=monaco.editor.create(code,{model:null,theme:'ai-web',fontFamily:'"JetBrains Mono", Consolas, monospace',fontSize:appearance.fontSize,wordWrap:appearance.wrap?'on':'off',minimap:{enabled:false},automaticLayout:true,scrollBeyondLastLine:false});secondaryEditor.setModel(doc.model || null);if(doc.secondaryViewState)secondaryEditor.restoreViewState(doc.secondaryViewState);image.replaceChildren();if(doc.kind==='image')showImage(image,doc);setSecondaryView(defaultFileView);requestAnimationFrame(()=>secondaryEditor.layout());}
function dropTab(key,zone){
 if(documents.get(key)?.kind==='diff'){const doc=documents.get(key);mountFilePane(doc,typeof zone==='object'?zone.id:terminalView.activePaneId,typeof zone==='object'?zone.direction:zone==='bottom'?'down':'right');return;}
 if(key!=='ai'&&(typeof zone==='object'||zone==='right'||zone==='bottom')){const doc=documents.get(key);if(doc)void dropFile({project:doc.project,path:doc.path},zone);return;}
 const doc=documents.get(key),isAI=key==='ai',edge=zone==='right'||zone==='bottom',app=$('#app');
 if(isAI&&app.classList.contains('file-file-split'))endFileSplit();
 if(edge&&!isAI&&doc===currentDocument&&secondaryDocument){const other=secondaryDocument;endFileSplit();selectDocument(other);showSecondary(doc);app.classList.add('file-file-split');app.classList.toggle('split-vertical',zone==='bottom');renderTabs();return;}
 if(!edge&&app.classList.contains('file-file-split')){if(zone==='secondary-file'){if(doc===currentDocument){const other=secondaryDocument;endFileSplit();selectDocument(other);showSecondary(doc);app.classList.add('file-file-split');}else showSecondary(doc);}else if(doc!==secondaryDocument)selectDocument(doc);else{const other=currentDocument;endFileSplit();selectDocument(doc);showSecondary(other);app.classList.add('file-file-split');}renderTabs();return;}
 if(!isAI&&!agentView.visible&&!app.classList.contains('chat-file-split')&&doc!==currentDocument){const primary=currentDocument;endFileSplit();if(!primary)return;agentView.suspend();showSecondary(doc);app.classList.add('file-file-split');app.classList.toggle('split-vertical',zone==='bottom');renderTabs();return;}
 endFileSplit();if(!agentView.selected)return;
 if(doc)selectDocument(doc,{keepChat:true});if(!currentDocument)return;if(!agentView.visible)agentView.resume();
 app.classList.add('chat-file-split');if(edge){app.classList.toggle('split-vertical',zone==='bottom');app.classList.toggle('split-ai-last',isAI);}else app.classList.toggle('split-ai-last',isAI?zone==='editor-stack':zone==='agent-panel');setView('editor');renderTabs();requestAnimationFrame(()=>editor.layout());
}
async function dropFile(file,zone){
  try{
    const primary=currentDocument,wasTerminal=terminalView.visible;
    openingSplit=true;
    try{await openFile(file.project,file.path,{newTab:true});}finally{openingSplit=false;}
    const doc=documents.get(`${file.project}:${file.path}`);if(!doc)return;
    if(!wasTerminal&&primary&&primary!==doc&&!filePanes.has(primary.key))mountFilePane(primary,null);
    const target=typeof zone==='object'?zone.id:terminalView.activePaneId;
    const direction=typeof zone==='object'?(zone.direction==='swap'&&!filePanes.has(doc.key)?'right':zone.direction):zone==='bottom'?'down':'right';
    mountFilePane(doc,target,direction);renderTabs();return;
  }catch(error){toast(error.message);return;}
}
function mountFilePane(doc,target,direction='right'){
  let pane=filePanes.get(doc.key);
  if(!pane){
    const element=document.createElement('section');element.className='terminal-screen file-layout-pane';
    element.innerHTML='<header class="terminal-pane-header"><span class="terminal-pane-title"></span><div class="pane-file-view"><button data-view="editor">Editor</button><button data-view="preview">Preview</button></div><button class="terminal-pane-zoom" aria-label="Maximize file pane"></button><button class="terminal-pane-close" aria-label="Close file pane"></button></header><div class="file-layout-code"></div><div class="file-layout-preview preview-content" hidden></div><div class="file-layout-image" hidden></div>';
    const header=element.querySelector('header'),preview=element.querySelector('.file-layout-preview'),code=element.querySelector('.file-layout-code'),image=element.querySelector('.file-layout-image'),zoom=element.querySelector('.terminal-pane-zoom');
    header.querySelector('.terminal-pane-title').textContent=doc.name;zoom.innerHTML=fileZoom.innerHTML;
    header.querySelector('.terminal-pane-close').append(icon('close'));header.querySelector('.terminal-pane-close').onclick=()=>closeDocument(doc);
    const paneEditor=doc.kind==='diff'?monaco.editor.createDiffEditor(code,{theme:'ai-web',readOnly:true,originalEditable:false,fontFamily:'"JetBrains Mono", Consolas, monospace',fontSize:appearance.fontSize,wordWrap:appearance.wrap?'on':'off',minimap:{enabled:false},automaticLayout:true,scrollBeyondLastLine:false,renderSideBySide:true}):doc.model?monaco.editor.create(code,{model:doc.model,theme:'ai-web',fontFamily:'"JetBrains Mono", Consolas, monospace',fontSize:appearance.fontSize,wordWrap:appearance.wrap?'on':'off',minimap:{enabled:false},automaticLayout:true,scrollBeyondLastLine:false}):null;
    if(doc.kind==='diff'){paneEditor.setModel({original:doc.diffModels[0],modified:doc.diffModels[1]});header.querySelector('.pane-file-view').hidden=true;const badge=document.createElement('span');badge.className='diff-baseline';badge.textContent='Git → Working tree';badge.title=doc.baseline?'HEAD compared with the file on disk':'New file compared with an empty Git baseline';header.insertBefore(badge,zoom);}
    if(doc.kind!=='diff')paneEditor?.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS,()=>saveFile(doc));
    const setMode=view=>{code.hidden=view!=='editor'||doc.kind==='image';image.hidden=view!=='editor'||doc.kind!=='image';preview.hidden=view!=='preview';for(const button of header.querySelectorAll('[data-view]')){button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-pressed',String(button.dataset.view===view));}if(view==='preview')void renderPreview({doc,target:preview,secondary:true});else if(doc.kind==='image')showImage(image,doc);requestAnimationFrame(()=>paneEditor?.layout());};
    for(const button of header.querySelectorAll('[data-view]'))button.onclick=()=>setMode(button.dataset.view);
    pane={id:`file:${doc.key}`,project:projects.find(project=>project.id===doc.project),element,paneHeader:header,paneZoom:zoom,preview,editor:paneEditor,layout:()=>{if(doc.kind==='diff')paneEditor.updateOptions({renderSideBySide:element.clientWidth>=680});paneEditor?.layout();},onSelect:()=>{currentDocument=doc;activeFileKey=doc.key;$('#app').dataset.fileFocused='true';agentView.close();renderTabs();},};
    filePanes.set(doc.key,pane);setMode(doc.kind==='diff'?'editor':defaultFileView);
  }
  terminalView.placeFilePane(pane,target,direction);
}
setupUnifiedTabOrder($('#unified-tabs'),order=>{tabOrder=order;});
tabDrag=setupTabDrag({tabs:$('#tabs'),content:contentViews,onReorder:()=>{},canDrop:(key,zone)=>{if(!zone)return false;if(typeof zone==='object')return documents.has(key);const split=$('#app').classList.contains('chat-file-split')||$('#app').classList.contains('file-file-split');if(zone!=='right'&&zone!=='bottom')return split;if(key==='ai')return Boolean(agentView.selected&&currentDocument);return Boolean(documents.has(key)&&(terminalView.visible||agentView.visible||agentView.selected&&split||currentDocument&&currentDocument.key!==key));},onDrop:dropTab,onFileDrop:dropFile});

notifications=createNotifications({icon,isViewing:agent=>!document.hidden&&document.hasFocus()&&(agent.terminalSession?Boolean(terminalAgents.find(item=>item.id===agent.id)?.selected):agentView.visible&&Boolean(agent.agent_session?.value?agentView.selected?.agent_session?.value===agent.agent_session.value:agent.pane_id&&agentView.selected?.pane_id===agent.pane_id)),onOpen:agent=>{if(agent.terminalSession){agentView.close();terminalView.select(agent.id);}else{agentView.open(agent);agentView.focusLatest();}}});
setupSettings({icon});
changesView=setupChanges({api,getProject:()=>currentProject,onOpenDiff:openDiff,onError:message=>toast(message)});
setupHistory({api,getProjects:()=>projects,getCurrentProject:()=>currentProject,onResume:(record,project)=>{agentView.close();terminalView.resumeSession(record,project);}});
titlebar=setupTitlebar({getProject:()=>projects.find(project=>project.id===(activeFileKey?documents.get(activeFileKey)?.project:terminalView.visible?terminalView.focusedProjectId:null))||currentProject,getAttention:()=>terminalAgents.map(agent=>({...agent,open:()=>terminalView.select(agent.id)}))});
startWorkingAnimation();
start().catch(error => { status(error.message, true); toast(error.message); });

// Refresh Monaco metrics when the bundled font has finished loading.
document.fonts.ready.then(() => { monaco.editor.remeasureFonts(); editor.layout(); });

for (const [selector, name] of [['#refresh-files','refresh'], ['#close-files','close'], ['.empty-symbol','folder'], ['#empty-open span','arrow']]) $(selector).replaceChildren(icon(name));
for (const button of document.querySelectorAll('.dialog-heading .icon-button')) button.replaceChildren(icon('close'));
const refreshGit = document.createElement('button'); refreshGit.className = 'icon-button refresh-git'; refreshGit.setAttribute('aria-label', 'Refresh Git branches'); refreshGit.title = 'Refresh Git branches'; refreshGit.append(icon('refresh')); refreshGit.onclick = () => refreshSessions(); $('.section-head').append(refreshGit);
window.addEventListener('focus', () => { void refreshSessions(); });

setupPanelResize();
