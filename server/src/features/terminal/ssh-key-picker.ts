import {execFile} from 'node:child_process';
import {FileError} from '../files/files.ts';
let active=false;
// Only a path leaves the native dialog; no private key contents are read here.
const script=`Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Choose SSH private key'
$dialog.InitialDirectory = Join-Path $env:USERPROFILE '.ssh'
$dialog.Filter = 'All files (*.*)|*.*'
$dialog.CheckFileExists = $true
try {
 if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::Write((ConvertTo-Json -Compress -InputObject $dialog.FileName))
 }
} finally { $dialog.Dispose() }`;
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
