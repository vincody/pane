import {execFile} from 'node:child_process';
import {FileError} from '../files/files.ts';
import {nativeDialogFocusScript} from '../files/native-dialog-focus.ts';
let active=false;
// Only a path leaves the native dialog; no private key contents are read here.
const script=`Add-Type -AssemblyName System.Windows.Forms
${nativeDialogFocusScript}
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Choose SSH private key'
$dialog.InitialDirectory = Join-Path $env:USERPROFILE '.ssh'
$dialog.Filter = 'All files (*.*)|*.*'
$dialog.CheckFileExists = $true
$owner = New-Object System.Windows.Forms.Form
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$focus = New-Object PaneDialogFocus('Choose SSH private key')
try {
 $owner.Show()
 $owner.Activate()
 if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::Write((ConvertTo-Json -Compress -InputObject $dialog.FileName))
 }
} finally { $focus.Dispose(); $dialog.Dispose(); $owner.Dispose() }`;
export async function selectSshKey():Promise<string|null>{
 if(process.platform!=='win32')throw new FileError(400,'Enter the key file path manually on this platform.');
 if(active)throw new FileError(409,'A key file picker is already open.');
 active=true;
 try{return await new Promise<string|null>((resolve,reject)=>{
  execFile('powershell.exe',['-NoProfile','-STA','-Command',script],{windowsHide:true,timeout:600_000,maxBuffer:32_768},(error,stdout)=>{
   if(error){reject(new FileError(400,'Could not open the key picker. Enter the file path manually.'));return;}
   try{resolve(stdout.trim()?JSON.parse(stdout.trim()):null);}catch{reject(new FileError(400,'Could not read the selected file path.'));}
  });
 });}finally{active=false;}
}
