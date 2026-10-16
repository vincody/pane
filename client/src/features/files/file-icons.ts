import {fileIconName,folderIconName} from './file-icon-lookup.ts';
// SVGs come from material-icon-theme (MIT); regenerate them with `npm run icons`.
const source=(name:string)=>`/file-icons/${name}.svg`;
function mark(name:string,type:'file'|'folder'){
 const wrapper=document.createElement('span'),image=new Image();wrapper.className='shared-file-icon';wrapper.dataset.type=type;
 image.alt='';image.draggable=false;image.decoding='async';image.src=source(name);wrapper.append(image);return wrapper;
}
export const fileIcon=(path:string)=>mark(fileIconName(path),'file');
export const folderIcon=(name:string,open=false)=>mark(folderIconName(name,open),'folder');
export function setFolderIconOpen(wrapper:HTMLElement,name:string,open:boolean){wrapper.querySelector('img')!.src=source(folderIconName(name,open));}
