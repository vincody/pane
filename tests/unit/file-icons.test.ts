import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileIconName,folderIconName} from '../../client/src/features/files/file-icon-lookup.ts';
import manifest from '../../client/src/features/files/file-icon-manifest.json' with {type:'json'};
test('files resolve by exact name, then longest extension, then the default icon',()=>{
 assert.equal(fileIconName('package.json'),'nodejs');assert.equal(fileIconName('src/PACKAGE.JSON'),'nodejs');
 assert.equal(fileIconName('app/main.ts'),'typescript');assert.equal(fileIconName('types/index.d.ts'),'typescript-def');
 assert.equal(fileIconName('C:\work\view.tsx'),'react_ts');assert.equal(fileIconName('notes.md'),'markdown');
 assert.equal(fileIconName('src/app.ts:42:7'),'typescript');assert.equal(fileIconName('src/app.ts#L10C2'),'typescript');
 assert.equal(fileIconName('unknown.zzzz'),manifest.file);assert.equal(fileIconName('LICENSE-NOTES'),manifest.file);
});
test('folders resolve by name with an open variant and fall back to the default folder',()=>{
 assert.equal(folderIconName('src'),'folder-src');assert.equal(folderIconName('src',true),'folder-src-open');
 assert.equal(folderIconName('Node_Modules'),'folder-node');
 assert.equal(folderIconName('my-custom-folder'),manifest.folder);assert.equal(folderIconName('my-custom-folder',true),manifest.folderOpen);
});
test('every icon the manifest can return exists as a generated SVG',()=>{
 const names=new Set([manifest.file,manifest.folder,manifest.folderOpen,...Object.values(manifest.fileNames),...Object.values(manifest.fileExtensions)]);
 for(const icon of Object.values(manifest.folderNames)){names.add(icon);names.add(`${icon}-open`);}
 const missing=[...names].filter(name=>!fs.existsSync(new URL(`../../client/public/file-icons/${name}.svg`,import.meta.url)));
 assert.deepEqual(missing,[]);
});
