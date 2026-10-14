export function setupSettings({icon}) {
 const dialog=document.querySelector('#settings-dialog'),close=dialog.querySelector('.close-dialog'),footnote=dialog.querySelector('.settings-footnote');
 const categories=[{id:'appearance',name:'Appearance',description:'Make your workspace comfortable.',icon:'settings',controls:['#compact-setting']},{id:'editor',name:'Editor',description:'Choose how files open and how code is displayed.',icon:'code',controls:['#font-setting','#wrap-setting','[aria-label="Opening files"]']},{id:'terminal',name:'Terminal',description:'Choose whether agent terminals are available.',icon:'monitor',controls:['#terminal-setting']},{id:'usage',name:'Usage',description:'Keep account limits within reach.',icon:'refresh',controls:['[aria-label="Show usage"]']},{id:'notifications',name:'Notifications',description:'Stay informed when agents need you.',icon:'bell',controls:['[aria-label="Popup notifications"]','[aria-label="Notification sounds"]','#test-notification']},{id:'pet',name:'Chat pet',description:'Customize your companion in the chat area.',icon:'pet',controls:[]}];
 categories.find(category=>category.id==='terminal').controls.push('#auto-split-terminal-setting');
 categories.find(category=>category.id==='usage').controls.push('[aria-label="Show Codex usage"]','[aria-label="Show Claude usage"]','[aria-label="Usage quota window"]');
 categories.find(category=>category.id==='editor').controls.push('[aria-label="Default file view"]');
 categories.find(category=>category.id==='notifications').controls.push('[aria-label="Notify while focused"]');
 categories.push({id:'keybinds',name:'Keybinds',description:'Keyboard shortcuts for navigating your workspace and editing files.',icon:'code',controls:[]});
 const shortcuts=document.querySelector('#help-dialog .shortcut-list');
 document.querySelector('#help-dialog')?.remove();
 document.querySelector('#help')?.remove();
 categories.find(category=>category.id==='terminal').description='Choose how new terminal sessions are arranged.';
 const rows=new Map(categories.map(category=>[category.id,category.controls.map(selector=>dialog.querySelector(selector)?.closest('.setting-row')).filter(Boolean)])),pet=dialog.querySelector('.pet-settings');
 dialog.replaceChildren();dialog.setAttribute('aria-label','Settings');
 const side=document.createElement('aside');side.className='settings-navigation';const brand=document.createElement('h2');brand.textContent='Settings';const nav=document.createElement('nav');nav.setAttribute('aria-label','Settings categories');side.append(brand,nav);
 const main=document.createElement('section');main.className='settings-main';const header=document.createElement('header');header.className='settings-header';const title=document.createElement('h2');title.id='settings-page-title';header.append(title,close);const content=document.createElement('div');content.className='settings-content';content.setAttribute('aria-labelledby',title.id);main.append(header,content);dialog.append(side,main);
 let current='appearance';
 for(const category of categories){const button=document.createElement('button');button.type='button';button.dataset.settingsPage=category.id;button.append(icon(category.icon),document.createTextNode(category.name));nav.append(button);const page=document.createElement('section');page.dataset.settingsPanel=category.id;page.hidden=true;const description=document.createElement('p');description.className='settings-page-description';description.textContent=category.description;const card=document.createElement('div');card.className='settings-card';card.append(...rows.get(category.id));if(category.id==='pet'&&pet){pet.querySelector('h3')?.remove();card.append(pet);}page.append(description,card);content.append(page);button.onclick=()=>select(category.id);}
 const keybindCard=content.querySelector('[data-settings-panel=keybinds] .settings-card');
 if(shortcuts){keybindCard.append(shortcuts);keybindCard.classList.add('keybinds-card');}
 content.append(footnote);
 function select(id){current=id;const category=categories.find(item=>item.id===id);title.textContent=category.name;for(const button of nav.querySelectorAll('button')){const active=button.dataset.settingsPage===id;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}for(const page of content.querySelectorAll('[data-settings-panel]'))page.hidden=page.dataset.settingsPanel!==id;content.scrollTop=0;}
 nav.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...nav.querySelectorAll('button')],index=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();});
 dialog.addEventListener('close',()=>select(current));select(current);
}
