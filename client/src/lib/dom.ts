/** Tag/id-aware queries keep DOM assumptions local instead of casting event targets. */
export function required<T extends Element=HTMLElement>(selector:string,root:ParentNode=document):T{
 const element=root.querySelector<T>(selector);if(!element)throw new Error(`Missing UI element: ${selector}`);return element;
}
export const eventElement=(event:Event):Element|null=>event.target instanceof Element?event.target:null;
export const htmlChildren=(element:Element):HTMLElement[]=>[...element.children].filter((child):child is HTMLElement=>child instanceof HTMLElement);
interface Elements {
 '#filter':HTMLInputElement;'#folder-path':HTMLInputElement;'#workspace-name':HTMLInputElement;
 '#compact-setting':HTMLInputElement;'#wrap-setting':HTMLInputElement;'#font-setting':HTMLSelectElement;
 '#folder-form':HTMLFormElement;'#rename-form':HTMLFormElement;
 '#settings-dialog':HTMLDialogElement;'#folder-dialog':HTMLDialogElement;'#rename-dialog':HTMLDialogElement;
 '#browse-folder':HTMLButtonElement;
 '#save':HTMLButtonElement;'#settings':HTMLButtonElement;'#refresh-files':HTMLButtonElement;
 'meta[name="ai-web-token"]':HTMLMetaElement;
}
export function uiQuery<S extends string>(selector:S):S extends keyof Elements?Elements[S]:HTMLElement {
 return document.querySelector(selector) as S extends keyof Elements?Elements[S]:HTMLElement;
}
