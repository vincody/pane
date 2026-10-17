import {test,expect} from './app.ts';

test('workspace entry supports browsing, cloning and creating without a host selector',async({page})=>{
 const requests:Record<string,unknown>[]=[];let chosen=0;
 await page.route('**/api/project-defaults',route=>route.fulfill({json:{parent:'C:\\Users\\Test\\Downloads'}}));
 await page.route('**/api/projects',route=>route.fulfill({json:route.request().method()==='POST'?{id:'browse',name:'Existing',root:'C:\\projects\\existing'}:{projects:[],defaultProject:null}}));
 await page.route('**/api/select-workspace-folder',route=>{chosen++;return route.fulfill({json:{path:chosen===1?null:'C:\\projects'}});});
 await page.route('**/api/create-project',route=>{const body=route.request().postDataJSON();requests.push(body);return route.fulfill({json:{id:body.name,name:body.name,root:`C:\\projects\\${body.name}`,branch:'main'}});});
 await page.goto('/');await page.locator('#open-folder').click();
 const dialog=page.locator('#add-workspace-dialog');await expect(dialog).toContainText('Add a workspace');await expect(dialog).not.toContainText('Host');
 await page.screenshot({path:'test-results/add-workspace-light.png',animations:'disabled'});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'test-results/add-workspace-dark.png',animations:'disabled'});
 await page.getByRole('button',{name:/^Browse folder/}).click();await expect(dialog).toBeVisible();await expect(page.getByRole('button',{name:/^Browse folder/})).toBeEnabled();
 await page.getByRole('button',{name:/^Create new project/}).click();await expect(page.getByLabel('Project parent folder')).toHaveValue('C:\\Users\\Test\\Downloads');await page.getByLabel('Project name',{exact:true}).fill('my-project');await page.getByRole('button',{name:'Browse…',exact:true}).click();await expect(page.getByLabel('Project parent folder')).toHaveValue('C:\\projects');await expect(page.locator('.workspace-location-preview')).toHaveText('C:\\projects\\my-project');
 await page.getByRole('button',{name:'Create project',exact:true}).click();await expect(dialog).not.toBeVisible();expect(requests[0]).toEqual({mode:'create',name:'my-project',parent:'C:\\projects'});
 await page.locator('#open-folder').click();await page.getByRole('button',{name:/^Clone from URL/}).click();await page.getByLabel('Repository URL').fill('https://github.com/example/pane.git');await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('pane');await page.getByRole('button',{name:'Browse…',exact:true}).click();await page.getByRole('button',{name:'Clone repository',exact:true}).click();await expect(dialog).not.toBeVisible();expect(requests[1]).toEqual({mode:'clone',name:'pane',parent:'C:\\projects',url:'https://github.com/example/pane.git'});
 await page.locator('#open-folder').click();await page.getByRole('button',{name:/^Browse folder/}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'Existing',exact:true})).toBeVisible();
});
