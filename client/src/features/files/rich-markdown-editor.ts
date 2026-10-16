import {Editor,getSchema,type AnyExtension} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {Markdown,MarkdownManager} from '@tiptap/markdown';
import {TableKit} from '@tiptap/extension-table';
import {TaskList,TaskItem} from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import CodeBlock from '@tiptap/extension-code-block';
import {LiveCodeBlock} from './live-code-block.ts';
import {markdownMeaning,splitMarkdownSource} from './markdown-modes.ts';

// Eligibility and the mounted editor must use the same schema and Markdown options.
function markdownExtensions(image:AnyExtension=Image,codeBlock:AnyExtension=CodeBlock){return [StarterKit.configure({underline:false,link:{openOnClick:false,autolink:false},trailingNode:false,codeBlock:false}),codeBlock,TaskList,TaskItem.configure({nested:true,HTMLAttributes:{'data-type':'taskItem'}}),TableKit.configure({table:{resizable:false}}),image];}
const codecExtensions=markdownExtensions(),codec=new MarkdownManager({extensions:codecExtensions}),schema=getSchema(codecExtensions);
export function richMarkdownReason(source:string):string|null{
 const {body}=splitMarkdownSource(source);
 try{const document=codec.parse(body);schema.nodeFromJSON(document).check();if(markdownMeaning(body)===markdownMeaning(codec.serialize(document)))return null;}catch{}
 return 'This Markdown uses formatting that Live Editor cannot preserve. Edit it in Source; Preview is still available.';
}

interface Options {element:HTMLElement;source:string;onChange:(value:string)=>void;save:()=>void;loadImage:(source:string)=>Promise<Blob>}
export function createRichMarkdownEditor(options:Options){
 let {frontmatter,body,eol,trailing}=splitMarkdownSource(options.source);
 const toolbar=document.createElement('div');toolbar.className='live-markdown-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Markdown formatting');options.element.append(toolbar);
 const note=document.createElement('p');note.className='live-markdown-frontmatter';note.textContent='YAML front matter is preserved. Edit it in Source.';note.hidden=!frontmatter;options.element.append(note);
 const content=document.createElement('div');content.className='live-markdown-content';options.element.append(content);
 const LocalImage=Image.extend({addNodeView(){return ({node})=>{
  const dom=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');dom.className='live-markdown-image';dom.contentEditable='false';img.alt=String(node.attrs.alt||'');if(node.attrs.title)img.title=String(node.attrs.title);caption.textContent=img.alt;dom.append(img,caption);
  let disposed=false,url:string|undefined;void options.loadImage(String(node.attrs.src||'')).then(blob=>{if(disposed)return;url=URL.createObjectURL(blob);img.src=url;}).catch(()=>{if(!disposed){img.hidden=true;caption.textContent=`${img.alt||'Image'} (not loaded)`;}});
  return {dom,destroy(){disposed=true;if(url)URL.revokeObjectURL(url);}};
 };}});
 let syncing=false,baselineSource=options.source,baselineDocument='';
 const editor=new Editor({element:content,extensions:[...markdownExtensions(LocalImage,LiveCodeBlock),Markdown],content:body,contentType:'markdown',editorProps:{attributes:{class:'live-markdown-document',role:'textbox','aria-label':'Live Markdown editor','aria-multiline':'true'},handleKeyDown:(_view,event)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();options.save();return true;}return false;}},onUpdate:({transaction})=>{
  if(syncing||!transaction.docChanged)return;if(JSON.stringify(editor.getJSON())===baselineDocument){options.onChange(baselineSource);return;}let value=editor.getMarkdown().replace(/\r\n/g,'\n');if(trailing&&!value.endsWith('\n'))value+='\n';if(!trailing)value=value.replace(/\n$/,'');options.onChange(frontmatter+value.replaceAll('\n',eol));
 }});
 try{if(markdownMeaning(body)!==markdownMeaning(editor.getMarkdown()))throw new Error('This Markdown contains formatting that Live Editor cannot preserve yet. Continue editing in Source.');}catch(error){editor.destroy();options.element.replaceChildren();throw error;}
 baselineDocument=JSON.stringify(editor.getJSON());
 const buttons:{button:HTMLButtonElement;active:()=>boolean}[]=[];
 function add(label:string,text:string,run:()=>void,active:()=>boolean){const button=document.createElement('button');button.type='button';if(text.startsWith('<svg'))button.innerHTML=text;else button.textContent=text;button.title=label;button.setAttribute('aria-label',label);button.onmousedown=event=>event.preventDefault();button.onclick=run;toolbar.append(button);buttons.push({button,active});}
 const glyph=(paths:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
 const separator=()=>{const line=document.createElement('span');line.className='live-markdown-toolbar-separator';line.setAttribute('aria-hidden','true');toolbar.append(line);};
 add('Paragraph',glyph('<path d="M12 4H8a4 4 0 0 0 0 8h4M12 4v16M18 4v16M10 4h10"/>'),()=>{editor.chain().focus().setParagraph().run();},()=>editor.isActive('paragraph'));
 for(const level of [1,2,3] as const)add(`Heading ${level}`,`H${level}`,()=>{editor.chain().focus().toggleHeading({level}).run();},()=>editor.isActive('heading',{level}));
 separator();
 add('Bold','B',()=>{editor.chain().focus().toggleBold().run();},()=>editor.isActive('bold'));
 add('Italic','I',()=>{editor.chain().focus().toggleItalic().run();},()=>editor.isActive('italic'));
 add('Strike','S',()=>{editor.chain().focus().toggleStrike().run();},()=>editor.isActive('strike'));
 separator();
 add('Bullet list',glyph('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),()=>{editor.chain().focus().toggleBulletList().run();},()=>editor.isActive('bulletList'));
 add('Numbered list',glyph('<path d="M10 6h11M10 12h11M10 18h11M3 4h1v5M3 14a2 2 0 0 1 3 2l-3 4h3"/>'),()=>{editor.chain().focus().toggleOrderedList().run();},()=>editor.isActive('orderedList'));
 add('Task list',glyph('<path d="m3 6 2 2 4-4M12 6h9M12 12h9M12 18h9"/><rect x="3" y="11" width="5" height="5" rx="1"/>'),()=>{editor.chain().focus().toggleTaskList().run();},()=>editor.isActive('taskList'));
 separator();
 add('Blockquote',glyph('<path d="M3 5h6v7H5c0 3-1 5-3 6M14 5h6v7h-4c0 3-1 5-3 6"/>'),()=>{editor.chain().focus().toggleBlockquote().run();},()=>editor.isActive('blockquote'));
 add('Inline code',glyph('<path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 4l-4 16"/>'),()=>{editor.chain().focus().toggleCode().run();},()=>editor.isActive('code'));
 let popover:HTMLElement|undefined;
 function closePopover(){popover?.remove();popover=undefined;}
 function resource(kind:'link'|'image'){
  closePopover();const form=document.createElement('form');form.className='live-markdown-popover';form.setAttribute('aria-label',kind==='link'?'Edit link':'Insert image');
  const label=document.createElement('label'),input=document.createElement('input'),error=document.createElement('p'),apply=document.createElement('button'),cancel=document.createElement('button');
  input.type='text';input.placeholder=kind==='link'?'https://example.com or relative path':'images/example.png';input.value=kind==='link'?String(editor.getAttributes('link').href||''):'';label.append(kind==='link'?'Link URL': 'Image path',input);error.setAttribute('role','alert');
  apply.type='submit';apply.textContent='Apply';cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>{closePopover();editor.commands.focus();};form.append(label,error,apply,cancel);
  if(kind==='link'&&editor.isActive('link')){const remove=document.createElement('button');remove.type='button';remove.textContent='Remove link';remove.onclick=()=>{editor.chain().focus().extendMarkRange('link').unsetLink().run();closePopover();};form.append(remove);}
  form.onsubmit=event=>{event.preventDefault();const value=input.value.trim();if(!value||(/^[a-z][a-z\d+.-]*:/i.test(value)&&! /^(https?:|mailto:)/i.test(value))){error.textContent='Enter a valid URL or relative path.';return;}
   if(kind==='link')editor.chain().focus().extendMarkRange('link').setLink({href:value}).run();else editor.chain().focus().setImage({src:value,alt:value.split('/').at(-1)||'Image'}).run();closePopover();};
  form.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();closePopover();editor.commands.focus();}};
  popover=form;options.element.append(form);input.focus();
 }
 add('Link',glyph('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>'),()=>resource('link'),()=>editor.isActive('link'));
 add('Image',glyph('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m21 15-6-6-12 12"/>'),()=>resource('image'),()=>editor.isActive('image'));
 add('More blocks',glyph('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),()=>{
  if(popover){closePopover();return;}const menu=document.createElement('div');menu.className='live-markdown-popover live-markdown-block-menu';menu.setAttribute('role','group');menu.setAttribute('aria-label','More blocks');
  for(const level of [4,5,6] as const){const button=document.createElement('button');button.type='button';button.textContent=`Heading ${level}`;button.onclick=()=>{editor.chain().focus().toggleHeading({level}).run();closePopover();};menu.append(button);}
  for(const [label,run] of [['Code block',()=>editor.chain().focus().toggleCodeBlock().run()],['Horizontal rule',()=>editor.chain().focus().setHorizontalRule().run()]] as const){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{run();closePopover();};menu.append(button);}
  menu.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();closePopover();editor.commands.focus();}};popover=menu;options.element.append(menu);menu.querySelector('button')?.focus();
 },()=>false);
 const refresh=()=>{for(const {button,active} of buttons)button.setAttribute('aria-pressed',String(active()));};editor.on('transaction',refresh);refresh();
 return {focus:()=>editor.commands.focus(),setSource(source:string){syncing=true;try{({frontmatter,body,eol,trailing}=splitMarkdownSource(source));note.hidden=!frontmatter;editor.commands.setContent(body,{contentType:'markdown',emitUpdate:false});if(markdownMeaning(body)!==markdownMeaning(editor.getMarkdown()))throw new Error('Live Editor cannot preserve this formatting. Continue editing in Source.');baselineSource=source;baselineDocument=JSON.stringify(editor.getJSON());}finally{syncing=false;}},destroy(){editor.destroy();options.element.replaceChildren();}};
}
