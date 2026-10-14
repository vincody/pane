export type WorktreeLaunch='shell'|'claude'|'codex'|null;
export function worktreeSlug(name:string):string{
 return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80).replace(/-$/,'');
}
export function automaticWorktreeName(existingNames:readonly string[]=[]):string{
 const creatures=['Narwhal','Manta','Otter','Beluga','Marlin','Nautilus','Orca','Dolphin'];
 const values=new Uint32Array(1);globalThis.crypto.getRandomValues(values);
 const used=new Set(existingNames.map(name=>name.toLowerCase()));
 const start=values[0]!%creatures.length;
 for(let suffix=1;suffix<=100;suffix++)for(let index=0;index<creatures.length;index++){const creature=creatures[(start+index)%creatures.length]!;const name=suffix===1?creature:`${creature}-${suffix}`;if(!used.has(name.toLowerCase()))return name;}
 return `Worktree-${globalThis.crypto.randomUUID().slice(0,8)}`;
}
