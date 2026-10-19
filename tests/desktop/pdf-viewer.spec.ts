import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A one-page PDF whose offsets are computed, so no fixture file is needed.
function samplePdf(text:string){
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${`BT /F1 24 Tf 20 100 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 24 Tf 20 100 Td (${text}) Tj ET\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 ];
 let out='%PDF-1.4\n';const offsets:number[]=[];
 objects.forEach((body,index)=>{offsets.push(out.length);out+=`${index+1} 0 obj\n${body}\nendobj\n`;});
 const xref=out.length;
 out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}`;
 out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out,'latin1');
}

test('a PDF in the file tree opens in a viewer with its pages, text search and zoom',async()=>{
 test.setTimeout(120000);
 const data=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pane-pdf-'))),root=path.join(data,'project');await fs.mkdir(root);
 await fs.writeFile(path.join(root,'guide.pdf'),samplePdf('Hello Pane PDF'));await fs.writeFile(path.join(data,'projects.json'),JSON.stringify({projects:[{root}]}));
 let application:ElectronApplication|undefined;
 try{
  const executablePath=process.env.PANE_DESKTOP_EXECUTABLE;application=await electron.launch({args:executablePath?[]:[path.resolve('.')],...(executablePath?{executablePath}:{}),env:{...process.env,PANE_DESKTOP_DATA_DIR:data,PANE_DESKTOP_PORT:'17395'}});
  application.process().stderr?.on('data',()=>{});
  const page=await application.firstWindow();await expect(page.locator('.project-button')).toBeVisible();
  await page.locator('.file-row[data-path="guide.pdf"]').click();
  const viewer=page.locator('.pdf-viewer:visible');await expect(viewer).toBeVisible({timeout:20000});
  await expect(viewer.locator('.pdf-status')).toBeHidden({timeout:20000});
  await expect(viewer.locator('.page canvas').first()).toBeVisible();
  await expect(viewer.locator('.textLayer')).toContainText('Hello Pane PDF');
  await expect(viewer.locator('.pdf-page-value')).toHaveText('1 / 1');
  const before=await viewer.locator('.image-zoom-value').textContent();
  await viewer.getByRole('button',{name:'Zoom in'}).click();
  await expect.poll(async()=>viewer.locator('.image-zoom-value').textContent()).not.toBe(before);
  await viewer.getByLabel('Find in PDF').fill('pane');
  await expect(viewer.locator('.pdf-find-count')).toHaveText('1/1');
  await viewer.getByLabel('Find in PDF').fill('nothing here');
  await expect(viewer.locator('.pdf-find-count')).toHaveText('No matches');
  await expect(page.locator('#preview-pane')).toHaveClass(/pdf-only/);
  // Reload from disk picks up a rewritten PDF.
  await fs.writeFile(path.join(root,'guide.pdf'),samplePdf('Second version'));
  await page.getByRole('button',{name:'Reload from disk'}).click();
  await expect(page.locator('.pdf-viewer:visible .textLayer')).toContainText('Second version',{timeout:20000});
  await expect(page.locator('.preview-heading')).toBeHidden();
 }finally{
  if(application){const exited=new Promise<void>(resolve=>application!.process().once('exit',()=>resolve()));await application.evaluate(({dialog,app})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});app.quit();}).catch(()=>{});await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,10000))]);}
  await fs.rm(data,{recursive:true,force:true}).catch(()=>{});
 }
});
