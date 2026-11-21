import {test,expect} from './app.ts';
import type {Page} from './app.ts';

const project={id:'chat-test',name:'Chat test',root:'C:\\work\\chat',branch:'dev'};
async function mockApp(page:Page,onClient:(message:any,send:(event:unknown)=>void,socket:{send:(data:string)=>void})=>void){
 await page.addInitScript(()=>{document.hasFocus=()=>true;localStorage.setItem('ai-web.notifications',JSON.stringify({popup:false,sound:false}));});
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.route('**/api/integrations/tools',route=>route.fulfill({json:{tools:[]}}));
 await page.routeWebSocket('**/api/chat',socket=>socket.onMessage(raw=>{
  const message=JSON.parse(raw.toString());
  if(message.type==='start')socket.send(JSON.stringify({type:'ready',sessionId:'123e4567-e89b-12d3-a456-426614174000',project:project.name,replay:[]}));
  else if(message.type==='list-models')socket.send(JSON.stringify({type:'models',models:[{value:'sonnet',displayName:'Sonnet 5.5'},{value:'opus',displayName:'Opus 5.5'}]}));
  else onClient(message,event=>socket.send(JSON.stringify({type:'event',event})),socket);
 }));
 await page.goto('/');
}
const openChat=async(page:Page)=>{await page.locator('#terminal-new').click();await page.locator('[data-launch=claude]').click();};

test('starting Claude opens a native chat tab instead of a terminal',async({page})=>{
 await mockApp(page,()=>{});
 await openChat(page);
 const pane=page.locator('.chat-pane');await expect(pane).toBeVisible();
 await expect(pane.getByText('Start a chat with Claude')).toBeVisible();
 await expect(pane.locator('.chat-footer')).toHaveText(/^Chat testdev/);
 await expect(pane.getByLabel('Message Claude')).toBeFocused();
 await expect(pane.getByRole('button',{name:'Model'})).toBeVisible();
 await expect(pane.locator('.xterm')).toHaveCount(0);
});

test('a reply streams in as markdown, tools show their result and permissions are answered',async({page})=>{
 const sent:any[]=[];
 await mockApp(page,(message,send)=>{
  sent.push(message);
  if(message.type!=='send')return;
  send({type:'user',id:'u1',text:message.text});send({type:'status',state:'working'});
  send({type:'text',id:'m1',text:'Here is **bold** and `code`'});
  send({type:'tool',id:'t1',name:'Bash',input:{command:'ls -la'},status:'running'});
  send({type:'permission',id:'p1',tool:'Bash',input:{command:'rm -rf build'}});
 });
 await openChat(page);
 const pane=page.locator('.chat-pane'),composer=pane.getByLabel('Message Claude');
 await composer.fill('list files');await composer.press('Enter');
 await expect(pane.locator('.chat-bubble')).toHaveText('list files');
 await expect(pane.locator('.chat-md strong')).toHaveText('bold');
 await expect(pane.locator('.chat-tool-name')).toHaveText('Bash');
 await expect(pane.locator('.chat-tool-line')).toHaveText('ls -la');
 await expect(pane.locator('.chat-tool')).toHaveAttribute('data-status','running');
 await expect(page.locator('.file-tab .tab-name')).toHaveText('List files');
 // While working, the send button becomes Stop.
 await expect(pane.getByRole('button',{name:'Stop'})).toBeVisible();
 await expect(pane.locator('.chat-permission-head strong')).toHaveText('Claude wants to run a command');
 await pane.getByRole('button',{name:'Always allow'}).click();
 expect(sent.find(message=>message.type==='answer-permission')).toEqual({type:'answer-permission',id:'p1',decision:'always'});
 await pane.getByRole('button',{name:'Stop'}).click();
 expect(sent.some(message=>message.type==='interrupt')).toBe(true);
});

test('a finished turn returns to idle and an error is shown',async({page})=>{
 await mockApp(page,(message,send)=>{
  if(message.type!=='send')return;
  send({type:'user',id:'u1',text:message.text});send({type:'status',state:'working'});
  send({type:'text',id:'m1',text:'Done.',final:true});
  send({type:'tool',id:'t1',name:'Read',input:{file_path:'a.ts'},status:'error',output:'no such file'});
  send({type:'status',state:'error',message:'Claude could not finish this turn.'});
 });
 await openChat(page);
 const pane=page.locator('.chat-pane');
 await pane.getByLabel('Message Claude').fill('go');await pane.getByLabel('Message Claude').press('Enter');
 await expect(pane.locator('.chat-notice')).toHaveText('Claude could not finish this turn.');
 await expect(pane.locator('.chat-tool')).toHaveAttribute('data-status','error');
 await expect(pane.getByRole('button',{name:'Send message'})).toBeDisabled();
});

test('a chat shows up in the workspace list with its working and needs-you state',async({page})=>{
 let push:(event:unknown)=>void=()=>{};
 await mockApp(page,(message,send)=>{push=send;if(message.type==='send'){send({type:'user',id:'u1',text:message.text});send({type:'status',state:'working'});}});
 await openChat(page);
 const card=page.locator(`[data-project=${project.id}] .terminal-agent-card`);
 await page.locator('.chat-pane').getByLabel('Message Claude').fill('do it');await page.keyboard.press('Enter');
 await expect(card).toHaveAttribute('data-status','working');
 push({type:'permission',id:'p1',tool:'Bash',input:{command:'x'}});
 await expect(card).toHaveAttribute('data-status','blocked');
 push({type:'permission-done',id:'p1'});await page.evaluate(()=>(document.activeElement as HTMLElement|null)?.blur());push({type:'status',state:'idle'});
 await expect(card).toHaveAttribute('data-status','done');
});

test('a multiple-choice question from Claude is answered on a card and the answers go back',async({page})=>{
 const seen:any[]=[];
 await mockApp(page,(message,send)=>{
  if(message.type==='answer-permission'){seen.push(message);return;}
  if(message.type!=='send')return;
  send({type:'user',id:'u1',text:'demo'});
  send({type:'tool',id:'q1',name:'AskUserQuestion',input:{},status:'running'});
  send({type:'permission',id:'q1',tool:'AskUserQuestion',input:{questions:[{question:'Which language?',header:'Language',multiSelect:false,options:[{label:'TypeScript',description:'Typed'},{label:'Python',description:'Scripts'}]},{question:'Which features?',header:'Features',multiSelect:true,options:[{label:'Auth'},{label:'Search'}]}]}});
  send({type:'status',state:'working'});
 });
 await openChat(page);
 const pane=page.locator('.chat-pane'),composer=pane.getByLabel('Message Claude');
 await composer.fill('go');await composer.press('Enter');
 const send=pane.getByRole('button',{name:'Send answers'});
 await expect(send).toBeDisabled();
 await expect(pane.locator('.chat-tool')).toHaveCount(0);
 await pane.locator('.chat-question-option',{hasText:'Python'}).click();
 await pane.locator('.chat-question-option',{hasText:'Auth'}).click();
 await pane.locator('.chat-question-option',{hasText:'Search'}).click();
 await send.click();
 await expect.poll(()=>seen.length).toBe(1);
 expect(seen[0]).toMatchObject({id:'q1',decision:'allow',answers:{'Which language?':'Python','Which features?':'Auth, Search'}});
});

test('Auto mode is offered, and the chosen permission mode is remembered for the next chat',async({page})=>{
 const seen:any[]=[];
 await mockApp(page,message=>{seen.push(message);});
 await openChat(page);
 const pane=page.locator('.chat-pane').first();
 await pane.getByRole('button',{name:'Permission mode'}).click();
  await pane.getByRole('menuitemradio',{name:/Claude handles permission decisions/}).click();
 await expect.poll(()=>seen.some(message=>message.type==='set-permission-mode'&&message.mode==='auto')).toBe(true);
 await expect(pane.getByRole('button',{name:'Permission mode'})).toHaveText('Auto');
 await openChat(page);
 await expect(page.locator('.chat-pane:visible').getByRole('button',{name:'Permission mode'})).toHaveText('Auto');
});

test('the footer shows the 5-hour and weekly limits with a countdown to each reset',async({page})=>{
 await mockApp(page,()=>{});
 const soon=new Date(Date.now()+3*3600_000).toISOString(),later=new Date(Date.now()+3*86400_000).toISOString();
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[{provider:'claude',available:true,fiveHour:{usedPercent:37,resetsAt:soon},weekly:{usedPercent:72,resetsAt:later}}]}}));
 await openChat(page);
 const footer=page.locator('.chat-pane .chat-footer');
 await expect(footer).toContainText('Chat test');
 const limits=footer.locator('.chat-footer-limit');
 await expect(limits).toHaveCount(2);
 await expect(limits.nth(0)).toContainText('5h');await expect(limits.nth(0)).toContainText('37%');
 await expect(limits.nth(1)).toContainText('Weekly');await expect(limits.nth(1)).toContainText('72%');
 for(const text of await footer.locator('.chat-footer-limit-reset').allInnerTexts())expect(text).toMatch(/^(?:\d+d \d+h|\d+h \d+m|\d+m)$/);
});

test('the footer says so when the account limits cannot be read',async({page})=>{
 await mockApp(page,()=>{});
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[{provider:'claude',available:false,fiveHour:null,weekly:null,message:'Claude quota is rate limited. Retrying later.'}]}}));
 await openChat(page);
 const note=page.locator('.chat-pane .chat-footer .chat-footer-limit-note');
 await expect(note).toHaveText('Usage limits unavailable');
 await expect(note).toHaveAttribute('title','Claude quota is rate limited. Retrying later.');
});
