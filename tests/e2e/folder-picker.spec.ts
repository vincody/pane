import {test,expect} from '@playwright/test';

test('Browse fills a workspace path, preserves it on cancel and reports picker errors',async({page})=>{
 let selection=0;const submitted:string[]=[];
 await page.route('**/api/select-workspace-folder',route=>{
  selection++;
  if(selection===3)return route.fulfill({status:400,json:{error:'Could not open the folder picker.'}});
  return route.fulfill({json:{path:selection===1?'C:\\Workspaces\\chosen project':null}});
 });
 await page.route('**/api/projects',route=>{
  if(route.request().method()==='POST'){submitted.push(route.request().postDataJSON().path);return route.fulfill({json:{id:'chosen',name:'Chosen',root:submitted[0],branch:null}});}
  return route.fulfill({json:{projects:[],defaultProject:null}});
 });
 await page.goto('/');await page.locator('#open-folder').click();await page.getByRole('button',{name:'Enter a folder path manually',exact:true}).click();
 await page.getByRole('button',{name:'Browse…',exact:true}).click();await expect(page.getByLabel('Folder path',{exact:true})).toHaveValue('C:\\Workspaces\\chosen project');
 await page.getByRole('button',{name:'Browse…',exact:true}).click();await expect(page.getByRole('button',{name:'Browse…',exact:true})).toBeEnabled();await expect(page.getByLabel('Folder path',{exact:true})).toHaveValue('C:\\Workspaces\\chosen project');
 await page.getByRole('button',{name:'Browse…',exact:true}).click();await expect(page.locator('#folder-error')).toHaveText('Could not open the folder picker.');
 await page.locator('#folder-form').getByRole('button',{name:'Open folder',exact:true}).click();await expect(page.locator('#folder-dialog')).not.toBeVisible();expect(submitted).toEqual(['C:\\Workspaces\\chosen project']);
});
