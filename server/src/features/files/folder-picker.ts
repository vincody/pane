import {execFile} from 'node:child_process';
import {FileError} from './files.ts';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {nativeDialogFocusScript} from './native-dialog-focus.ts';

let active=false;
const downloadsScript=`$downloads = Join-Path $env:USERPROFILE 'Downloads'
try {
 $configured = (Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders' -ErrorAction Stop).'{374DE290-123F-4565-9164-39C4925E467B}'
 if ($configured) { $downloads = [Environment]::ExpandEnvironmentVariables($configured) }
} catch { }`;
export async function defaultWorkspaceFolder():Promise<string>{
 if(process.platform!=='win32')return path.join(os.homedir(),'Downloads');
 try{const result=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`${downloadsScript}\n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n[Console]::Write((ConvertTo-Json -Compress -InputObject $downloads))`],{windowsHide:true,timeout:10_000});const value:unknown=JSON.parse(result.stdout);if(typeof value==='string'&&path.isAbsolute(value))return value;}catch{}
 return path.join(os.homedir(),'Downloads');
}
const script=`Add-Type -AssemblyName System.Windows.Forms
${nativeDialogFocusScript}
${downloadsScript}
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Choose a workspace folder'
$dialog.AutoUpgradeEnabled = $true
$dialog.SelectedPath = ''
if ($dialog.PSObject.Properties['InitialDirectory']) { $dialog.InitialDirectory = $downloads }
if ($dialog.PSObject.Properties['ClientGuid']) { $dialog.ClientGuid = [Guid]::NewGuid() }
if ($dialog.PSObject.Properties['UseDescriptionForTitle']) { $dialog.UseDescriptionForTitle = $true }
$dialog.ShowNewFolderButton = $true
$owner = New-Object System.Windows.Forms.Form
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$focus = New-Object PaneDialogFocus('Choose a workspace folder')
try {
 $owner.Show()
 $owner.Activate()
 if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::Write((ConvertTo-Json -Compress -InputObject $dialog.SelectedPath))
 }
} finally { $focus.Dispose(); $dialog.Dispose(); $owner.Dispose() }`;

export async function selectWorkspaceFolder():Promise<string|null>{
 if(process.platform!=='win32')throw new FileError(400,'Enter the folder path manually on this platform.');
 if(active)throw new FileError(409,'A folder picker is already open.');
 active=true;
 try{return await new Promise<string|null>((resolve,reject)=>{
  const launch=(shell:string)=>execFile(shell,['-NoProfile','-STA','-Command',script],{windowsHide:true,timeout:600_000,maxBuffer:32_768},(error,stdout)=>{
   if(error&&(error as NodeJS.ErrnoException).code==='ENOENT'&&shell==='pwsh.exe'){launch('powershell.exe');return;}
   if(error){reject(new FileError(400,'Could not open the folder picker. Enter the folder path manually.'));return;}
   try{const selected:unknown=stdout.trim()?JSON.parse(stdout.trim()):null;if(selected!==null&&typeof selected!=='string')throw new Error();resolve(selected as string|null);}catch{reject(new FileError(400,'Could not read the selected folder path.'));}
  });
  launch('pwsh.exe');
 });}finally{active=false;}
}
