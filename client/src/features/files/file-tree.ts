import type {Workspace,TreeEntry} from '../../../../shared/contracts.ts';
import type {OpenDocument} from './documents.ts';
import type {createApi} from '../../lib/api.ts';
import {fileIcon,folderIcon,setFolderIconOpen} from './file-icons.ts';
import {errorMessage} from '../../components/contracts.ts';
interface FileTreeOptions {
 api:ReturnType<typeof createApi>;
 tree:HTMLElement;
 filter:HTMLInputElement;
 expanded:Set<string>;
 getDocument:()=>OpenDocument|null;
 icon:(name?:string)=>SVGElement;
 decorate:(button:HTMLButtonElement)=>void;
 openFile:(project:string,path:string)=>Promise<unknown>;
 toast:(message:string)=>void;
}
export function createFileTree({api,tree,filter,expanded,getDocument,icon,decorate,openFile,toast}:FileTreeOptions){
async function treeDirectory(project:Workspace,path:string,depth:number) {
  const { entries } = await api<{entries:TreeEntry[]}>(`/api/tree?${new URLSearchParams({ project: project.id, path })}`);
  const list = document.createElement('ul'); list.className = 'tree-list'; list.setAttribute('role', 'group');
  for (const entry of entries) {
    const item = document.createElement('li'); item.dataset.name = entry.name.toLowerCase();
    const button = document.createElement('button'); button.className = 'file-row'; button.style.paddingLeft = `${8 + depth * 13}px`; button.title = entry.path;
    button.dataset.path = entry.path; button.dataset.project = project.id; button.dataset.entryType=entry.type; button.setAttribute('role', 'treeitem');
    button.setAttribute('aria-label', entry.name);
    const currentDocument=getDocument();
    if (currentDocument?.project === project.id && currentDocument.path === entry.path) button.classList.add('active');
    const arrow = document.createElement('span'); arrow.className = 'chevron'; if (entry.type === 'directory') arrow.append(icon('chevron-right')); button.append(arrow);
    const mark=entry.type==='directory'?folderIcon(entry.name,expanded.has(entry.path)):fileIcon(entry.name);button.append(mark);
    const label = document.createElement('span'); label.className='file-row-name'; label.textContent = entry.name; button.append(label);decorate(button); item.append(button); list.append(item);
    if (entry.type === 'directory') {
      button.setAttribute('aria-expanded', expanded.has(entry.path) ? 'true' : 'false');
      if (expanded.has(entry.path)) { arrow.replaceChildren(icon('chevron-down')); item.append(await treeDirectory(project, entry.path, depth + 1)); }
      button.onclick = async () => {
        const children = item.querySelector<HTMLElement>('ul')!;
        if (children) { children.remove(); expanded.delete(entry.path); setFolderIconOpen(mark,entry.name,false); arrow.replaceChildren(icon('chevron-right')); button.setAttribute('aria-expanded', 'false'); }
        else { try { button.disabled = true; item.append(await treeDirectory(project, entry.path, depth + 1)); expanded.add(entry.path); setFolderIconOpen(mark,entry.name,true); arrow.replaceChildren(icon('chevron-down')); button.setAttribute('aria-expanded', 'true'); } catch (error) { toast(errorMessage(error,'Operation failed.')); } finally { button.disabled = false; } }
        filterTree();
      };
    } else if (entry.type === 'link') {
      button.disabled = true; button.title = 'Linked entries are not browsed.';
    } else {
      button.draggable=true;button.dataset.draggableFile='true';
      button.onclick = () => openFile(project.id, entry.path).catch(error => { toast(errorMessage(error,'Operation failed.')); toast(errorMessage(error,'Operation failed.')); });
    }
  }
  if (!entries.length) { const empty = document.createElement('li'); empty.className = 'tree-empty'; empty.textContent = 'This folder is empty.'; list.append(empty); }
  return list;
}
function filterTree() {
  const query = filter.value.toLowerCase();
  for (const item of [...tree.querySelectorAll<HTMLElement>('li[data-name]')].reverse()) {
    item.hidden = Boolean(query) && !(item.dataset.name||'').includes(query) && ![...item.querySelectorAll<HTMLElement>('li[data-name]')].some(child => !child.hidden);
  }
}

return {treeDirectory,filterTree};
}
