import {test,expect} from './app.ts';
import type {DevServer,Workspace} from '../../shared/contracts.ts';
const first:Workspace={id:'servers-one',name:'First workspace',root:'C:\\work\\one'},second:Workspace={id:'servers-two',name:'Second workspace',root:'C:\\work\\two',branch:'main'};
function server(projectId:string,port:number,protocol:DevServer['protocol']):DevServer{return {id:`${projectId}:${port}`,projectId,pid:42,port,host:'127.0.0.1',name:'node',status:'running',protocol,url:protocol==='unknown'?null:`${protocol}://127.0.0.1:${port}`,observedAt:new Date().toISOString()};}
test('local servers aggregates open workspaces and keeps workspace labels and scoped actions',async({page})=>{
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[first,second],defaultProject:first.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 let oldScanStarted=false,scanFailed=false;
 await page.route('**/api/dev-servers?**',async route=>{const project=new URL(route.request().url()).searchParams.get('project');if(project===first.id){oldScanStarted=true;await new Promise<void>(resolve=>setTimeout(resolve,300));}const rows=project===first.id?[server(first.id,3000,'http')]:[server(second.id,5173,'http'),server(second.id,9229,'unknown')];await route.fulfill({json:{available:!scanFailed,scannedAt:new Date().toISOString(),rows:scanFailed?rows.map(row=>({...row,status:'unknown'})):rows,...(scanFailed?{error:'Scan unavailable'}:{})}}).catch(()=>{});});
 await page.goto('/');await expect.poll(()=>oldScanStarted).toBe(true);
 await page.locator('.project-button').filter({hasText:second.name}).click();
 await page.locator('#dev-servers-open').click();
 const panel=page.locator('#dev-servers-popover');await expect(panel).toBeVisible();await expect(panel.locator('.dev-server-workspace')).toHaveText([first.name,second.name,second.name]);
 await expect(panel.locator('.dev-server-row')).toHaveCount(3);await expect(page.locator('.dev-server-count')).toHaveText('3');
 await expect(panel.locator('.dev-server-branch')).toHaveText(['main','main']);
 await expect(panel.locator('.dev-server-scope')).toHaveText('2 open workspaces');
 await expect(panel.locator('.dev-server-caption')).toContainText('3 running');
 await expect(panel.locator('.dev-server-url')).toHaveText(['http://127.0.0.1:3000','http://127.0.0.1:5173']);
 await page.screenshot({path:'test-results/tracking-ui.png'});
 await expect(panel).toContainText('Protocol unknown');await expect(panel.getByRole('link',{name:'Open',exact:true})).toHaveCount(2);
 const secondRow=panel.locator('.dev-server-row').filter({hasText:':5173'});const link=secondRow.getByRole('link',{name:'Open',exact:true});await expect(link).toHaveAttribute('href','http://127.0.0.1:5173');await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');
 await secondRow.getByRole('button',{name:'Copy URL',exact:true}).click();await expect(panel.getByRole('button',{name:'Copied',exact:true})).toBeVisible();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('http://127.0.0.1:5173');
 await expect(panel).toContainText(':3000');scanFailed=true;await panel.getByRole('button',{name:'Refresh local servers',exact:true}).click();await expect(panel).toContainText('Scan unavailable');await expect(panel.locator('.dev-server-row')).toHaveCount(3);await expect(panel.getByRole('link',{name:'Open',exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'Copy URL',exact:true})).toHaveCount(2);await expect(page.locator('.dev-server-count')).toHaveText('');
 await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(page.locator('#dev-servers-open')).toBeFocused();
});

test('dev server scans slow down when closed and resume immediately when opened',async({page})=>{
 await page.clock.install();
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[first],defaultProject:first.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 let scans=0;
 await page.route('**/api/dev-servers?**',route=>{scans++;return route.fulfill({json:{available:true,scannedAt:new Date().toISOString(),rows:[]}});});
 await page.goto('/');await expect.poll(()=>scans).toBe(1);
 await expect(page.locator('.dev-server-caption')).toContainText('Scanned');
 await page.clock.fastForward(4000);expect(scans).toBe(1);
 await page.clock.fastForward(1000);await expect.poll(()=>scans).toBe(2);
 await expect(page.locator('.dev-server-caption')).toContainText('Scanned');
 await page.locator('#dev-servers-open').click();await expect.poll(()=>scans).toBe(3);
 await expect(page.locator('.dev-server-caption')).toContainText('Scanned');
 await page.clock.fastForward(2900);expect(scans).toBe(3);
 await page.clock.fastForward(100);await expect.poll(()=>scans).toBe(4);
 await expect(page.locator('.dev-server-caption')).toContainText('Scanned');
 await page.keyboard.press('Escape');await page.clock.fastForward(4000);expect(scans).toBe(4);
 await page.clock.fastForward(1000);await expect.poll(()=>scans).toBe(5);
});

test('stopped rows disappear after five seconds without requiring another port scan',async({page})=>{
 const stoppedAt='2026-10-14T10:00:00.000Z';await page.clock.install({time:new Date(Date.parse(stoppedAt)-1000)});await page.clock.pauseAt(new Date(stoppedAt));
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[first],defaultProject:first.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 let scans=0;
 await page.route('**/api/dev-servers?**',route=>{scans++;return route.fulfill({json:{available:true,scannedAt:stoppedAt,rows:[{...server(first.id,3000,'http'),status:'stopped',stoppedAt}]}});});
 await page.goto('/');await expect.poll(()=>scans).toBe(1);await expect(page.locator('.dev-server-row')).toHaveCount(1);
 await page.clock.fastForward(4900);await expect(page.locator('.dev-server-row')).toHaveCount(1);
 await page.clock.fastForward(100);await expect(page.locator('.dev-server-row')).toHaveCount(0);
 await page.locator('#dev-servers-open').click();await expect.poll(()=>scans).toBe(3);
 await expect(page.locator('.dev-server-row')).toHaveCount(0);await expect(page.locator('#dev-servers-popover')).toContainText('No local servers detected');
});

test('a running server is stopped only after a second click, and failures are explained',async({page})=>{
 const workspace={id:'stop-servers',name:'Stop servers',root:'C:\work\stop',branch:'main'};
 let running=true,failure:{status:number;error:string}|null=null;const stops:{project:string;id:string}[]=[];
 await page.addInitScript(()=>{document.hasFocus=()=>true;});
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[workspace],defaultProject:workspace.id}}));await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.route('**/api/dev-servers?**',route=>route.fulfill({json:{available:true,scannedAt:new Date().toISOString(),rows:[{id:'srv-1',projectId:workspace.id,pid:4242,port:5173,host:'127.0.0.1',name:'node',status:running?'running':'stopped',protocol:'http',url:'http://127.0.0.1:5173/',observedAt:new Date().toISOString(),...(running?{}:{stoppedAt:new Date().toISOString()})}]}}));
 await page.route('**/api/dev-servers/terminate',route=>{stops.push(route.request().postDataJSON());if(failure)return route.fulfill({status:failure.status,json:{error:failure.error}});running=false;return route.fulfill({json:{terminated:true}});});
 await page.goto('/');await page.locator('#dev-servers-open').click();
 const panel=page.locator('#dev-servers-popover'),stop=panel.getByRole('button',{name:/^Stop 127\.0\.0\.1:5173$/});
 await expect(panel.locator('.dev-server-row')).toHaveCount(1);
 await stop.click();expect(stops).toHaveLength(0);
 const confirm=panel.getByRole('button',{name:/^Confirm stop /});await expect(confirm).toHaveText('Stop?');
 failure={status:409,error:'This server changed or has already stopped. Refresh the list.'};
 await confirm.click();await expect.poll(()=>stops.length).toBe(1);await expect(page.locator('#toast')).toContainText('changed or has already stopped');
 await expect(panel.locator('.dev-server-status')).toHaveText('Running');
 failure=null;
 await panel.getByRole('button',{name:/^Stop 127\.0\.0\.1:5173$/}).click();await panel.getByRole('button',{name:/^Confirm stop /}).click();
 await expect.poll(()=>stops.length).toBe(2);expect(stops[1]).toEqual({project:workspace.id,id:'srv-1'});
 await expect(panel.locator('.dev-server-status')).toHaveText('Stopped');await expect(panel.getByRole('button',{name:/^Stop /})).toHaveCount(0);
});
