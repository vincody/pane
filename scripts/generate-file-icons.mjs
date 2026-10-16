// Regenerates the file/folder icon set from material-icon-theme (MIT). Run: npm run icons
import {cpSync,existsSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {generateManifest} from 'material-icon-theme';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'node_modules/material-icon-theme');
const publicDir=path.join(root,'client/public/file-icons');
const manifestFile=path.join(root,'client/src/features/files/file-icon-manifest.json');
const manifest=generateManifest({activeIconPack:'react',folders:{theme:'specific'}});
const exists=name=>existsSync(path.join(source,'icons',`${name}.svg`));
// An open folder icon is always the closed icon plus "-open"; storing only the closed names keeps the manifest small.
const folders={};
for(const [name,icon] of Object.entries(manifest.folderNames)){
 const open=manifest.folderNamesExpanded[name];
 if(open!==`${icon}-open`)throw new Error(`Unexpected open icon for folder ${name}: ${open}`);
 folders[name]=icon;
}
// Only keep mappings whose SVG exists, so the app never requests a missing file.
const keep=map=>Object.fromEntries(Object.entries(map).filter(([,icon])=>exists(icon)));
const fileNames=keep(manifest.fileNames),fileExtensions=keep(manifest.fileExtensions);
for(const [name,icon] of Object.entries(folders))if(!exists(icon)||!exists(`${icon}-open`))delete folders[name];
const used=new Set([manifest.file,manifest.folder,manifest.folderExpanded,...Object.values(fileNames),...Object.values(fileExtensions)]);
for(const icon of Object.values(folders)){used.add(icon);used.add(`${icon}-open`);}
for(const name of [manifest.file,manifest.folder,manifest.folderExpanded])if(!exists(name))throw new Error(`Missing default icon ${name}`);
rmSync(publicDir,{recursive:true,force:true});mkdirSync(publicDir,{recursive:true});
for(const name of used)cpSync(path.join(source,'icons',`${name}.svg`),path.join(publicDir,`${name}.svg`));
cpSync(path.join(source,'LICENSE'),path.join(publicDir,'LICENSE'));
writeFileSync(manifestFile,JSON.stringify({file:manifest.file,folder:manifest.folder,folderOpen:manifest.folderExpanded,fileNames,fileExtensions,folderNames:folders}));
console.log(`file icons: ${used.size} SVGs, ${Object.keys(fileExtensions).length} extensions, ${Object.keys(fileNames).length} file names, ${Object.keys(folders).length} folder names`);
