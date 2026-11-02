import type {Workspace,TreeEntry} from '../../../../shared/contracts.ts';
import type {OpenDocument} from './documents.ts';
import type {createApi} from '../../lib/api.ts';
import {fileIcon,folderIcon,setFolderIconOpen} from './file-icons.ts';
import {errorMessage} from '../../components/contracts.ts';
import './file-search.css';
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
 getProject:()=>Workspace|null;
}
export function createFileTree({api,tree,filter,expanded,getDocument,icon,decorate,openFile,toast,getProject}:FileTreeOptions){
// Name search covers the whole workspace, not only the folders opened so far: results replace the tree while a query is typed.
const results=document.createElement('div');results.id='file-search-results';results.className='file-search-results';results.setAttribute('role','listbox');results.setAttribute('aria-label','Matching files');results.hidden=true;tree.after(results);
let searchTimer=0,searchStamp=0;
function closeSearch(){clearTimeout(searchTimer);searchStamp++;results.hidden=true;results.replaceChildren();tree.hidden=false;}
function showResults(project:Workspace,files:{name:string;path:string}[],truncated:boolean){
  results.replaceChildren();
  if(!files.length){const empty=document.createElement('p');empty.className='file-search-empty';empty.textContent='No matching files';results.append(empty);return;}
  for(const file of files){
    const button=document.createElement('button');button.type='button';button.className='file-row file-search-row';button.setAttribute('role','option');button.title=file.path;button.dataset.path=file.path;button.dataset.project=project.id;
    button.append(fileIcon(file.name));
    const name=document.createElement('span');name.className='file-row-name';name.textContent=file.name;button.append(name);
    const folder=file.path.includes('/')?file.path.slice(0,file.path.lastIndexOf('/')):'';if(folder){const where=document.createElement('span');where.className='file-search-folder';where.textContent=folder;button.append(where);}
    button.onclick=()=>openFile(project.id,file.path).catch(error=>toast(errorMessage(error,'Operation failed.')));
    results.append(button);
  }
  if(truncated){const more=document.createElement('p');more.className='file-search-empty';more.textContent='Showing the first matches. Type more to narrow.';results.append(more);}
}
async function search(project:Workspace,query:string){
  const stamp=++searchStamp;
  try{
    const found=await api<{files:{name:string;path:string}[];truncated:boolean}>(`/api/file-search?${new URLSearchParams({project:project.id,q:query})}`);
    if(stamp!==searchStamp||filter.value.trim()!==query)return;
    tree.hidden=true;results.hidden=false;showResults(project,found.files,found.truncated);
  }catch(error){if(stamp===searchStamp){closeSearch();toast(errorMessage(error,'Could not search files.'));}}
}
filter.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&filter.value){event.preventDefault();filter.value='';filterTree();}
  else if(event.key==='Enter'){const first=results.querySelector<HTMLButtonElement>('.file-search-row');if(first){event.preventDefault();first.click();}}
  else if(event.key==='ArrowDown'){const first=results.querySelector<HTMLButtonElement>('.file-search-row');if(first){event.preventDefault();first.focus();}}
});
results.addEventListener('keydown',event=>{
  const rows=[...results.querySelectorAll<HTMLButtonElement>('.file-search-row')],index=rows.indexOf(document.activeElement as HTMLButtonElement);
  if(event.key==='ArrowDown'&&index>=0){event.preventDefault();rows[Math.min(rows.length-1,index+1)].focus();}
  else if(event.key==='ArrowUp'&&index>=0){event.preventDefault();if(index===0)filter.focus();else rows[index-1].focus();}
});
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
  const typed = filter.value.trim(), project = getProject();
  if (typed.length >= 2 && project) { clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void search(project, typed); }, 120); }
  else closeSearch();
  const query = filter.value.toLowerCase();
  for (const item of [...tree.querySelectorAll<HTMLElement>('li[data-name]')].reverse()) {
    item.hidden = Boolean(query) && !(item.dataset.name||'').includes(query) && ![...item.querySelectorAll<HTMLElement>('li[data-name]')].some(child => !child.hidden);
  }
}

return {treeDirectory,filterTree,resetSearch:closeSearch};
}
