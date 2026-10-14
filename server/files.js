import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const excluded = new Set(['node_modules', '.git', '.ai-web']);
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

export class FileError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

export class Files {
  constructor() { this.projects = new Map(); this.locks = new Map(); this.referenceIndexes=new Map(); }

  async addProject(input) {
    if (typeof input !== 'string' || !path.isAbsolute(input)) throw new FileError(400, 'Enter an absolute folder path.');
    const root = await fs.realpath(input);
    if (!(await fs.stat(root)).isDirectory()) throw new FileError(400, 'Choose a folder, not a file.');
    const id = hash(Buffer.from(process.platform === 'win32' ? root.toLowerCase() : root)).slice(0, 16);
    if (this.projects.has(id)) return this.projects.get(id);
    const project = { id, name: path.basename(root) || root, root };
    this.projects.set(id, project);
    return project;
  }

  async resolve(id, relative = '') {
    const project = this.projects.get(id);
    if (!project) throw new FileError(404, 'Project is not open.');
    if (typeof relative !== 'string' || relative.includes('\0') || path.isAbsolute(relative)) throw new FileError(400, 'Invalid file path.');
    const candidate = path.resolve(project.root, relative);
    if (!isWithin(project.root, candidate)) throw new FileError(403, 'File is outside the selected project.');
    // Check canonical paths too: a symlink/junction must not escape the project.
    const real = await fs.realpath(candidate);
    if (!isWithin(project.root, real)) throw new FileError(403, 'Linked file is outside the selected project.');
    return real;
  }

  async tree(id, relative = '') {
    const directory = await this.resolve(id, relative);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter(item => !excluded.has(item.name)).map(item => ({
      name: item.name,
      path: path.posix.join(relative.replaceAll('\\', '/'), item.name),
      type: item.isSymbolicLink() ? 'link' : item.isDirectory() ? 'directory' : 'file',
      image: Boolean(imageTypes[path.extname(item.name).toLowerCase()]),
    })).sort((a, b) => (a.type === 'directory' ? 0 : 1) - (b.type === 'directory' ? 0 : 1) || a.name.localeCompare(b.name));
  }

  async searchReferences(id,query='') {
    const project=this.projects.get(id);if(!project)throw new FileError(404,'Project is not open.');if(typeof query!=='string'||query.length>160||query.includes('\0'))throw new FileError(400,'Invalid file search.');
    let index=this.referenceIndexes.get(id);
    if(!index||!index.pending&&index.expires<Date.now()){
      index={expires:0};this.referenceIndexes.set(id,index);
      index.pending=(async()=>{const files=[],queue=[{relative:'',depth:0}];let visited=0,truncated=false;
        while(queue.length){if(visited++>=500||files.length>=5000){truncated=true;break;}const {relative,depth}=queue.shift();let entries;try{entries=await fs.readdir(await this.resolve(id,relative),{withFileTypes:true});}catch{continue;}
          entries.sort((a,b)=>a.name.localeCompare(b.name));for(const entry of entries){if(excluded.has(entry.name)||entry.isSymbolicLink())continue;const file=path.posix.join(relative,entry.name);if(entry.isDirectory()){if(depth<15)queue.push({relative:file,depth:depth+1});else truncated=true;}else if(entry.isFile()){if(files.length>=5000){truncated=true;break;}files.push({name:entry.name,path:file});}}
        }
        index.files=files;index.truncated=truncated;index.expires=Date.now()+15000;
      })().finally(()=>index.pending=null);
    }
    if(index.pending)await index.pending;const needle=query.toLowerCase().replaceAll('\\','/');const matches=(index.files || []).filter(file=>file.path.toLowerCase().includes(needle)).sort((a,b)=>Number(b.name.toLowerCase().startsWith(needle))-Number(a.name.toLowerCase().startsWith(needle))||a.path.localeCompare(b.path));return {files:matches.slice(0,40),truncated:index.truncated||matches.length>40};
  }

  async read(id, relative) {
    const target = await this.resolve(id, relative);
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new FileError(400, 'Choose a file.');
    if (imageTypes[path.extname(target).toLowerCase()]) return { kind: 'image', size: stat.size, path: relative };
    if (stat.size > MAX_TEXT_BYTES) throw new FileError(413, 'This file is larger than the 2 MB editor limit.');
    const buffer = await fs.readFile(target);
    if (buffer.length > MAX_TEXT_BYTES) throw new FileError(413, 'This file is larger than the 2 MB editor limit.');
    if (buffer.includes(0)) throw new FileError(415, 'Binary files cannot be edited as text.');
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new FileError(415, 'This editor supports UTF-8 text files.'); }
    return { kind: 'text', content, version: hash(buffer), bom: buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), size: buffer.length };
  }

  async save(id, relative, content, version, bom = false) {
    if (typeof content !== 'string' || typeof version !== 'string') throw new FileError(400, 'Missing content or file version.');
    const encoded = Buffer.from((bom ? '\ufeff' : '') + content, 'utf8');
    if (encoded.length > MAX_TEXT_BYTES) throw new FileError(413, 'This file exceeds the 2 MB editor limit.');
    const key = `${id}:${relative}`;
    const previous = this.locks.get(key) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const target = await this.resolve(id, relative);
      // Open once so replacing a path with a symlink between read and write does
      // not make the save follow that new link. Never truncate before comparing.
      const handle = await fs.open(target, 'r+');
      try {
        const current = await handle.readFile();
        if (hash(current) !== version) throw new FileError(409, 'The file changed on disk. Reload it before saving; your edits are still open.');
        let written = 0;
        while (written < encoded.length) {
          const result = await handle.write(encoded, written, encoded.length - written, written);
          if (!result.bytesWritten) throw new Error('File write made no progress.');
          written += result.bytesWritten;
        }
        await handle.truncate(encoded.length);
        await handle.sync();
      } finally { await handle.close(); }
      return { version: hash(encoded), size: encoded.length };
    });
    this.locks.set(key, operation);
    try { return await operation; }
    finally { if (this.locks.get(key) === operation) this.locks.delete(key); }
  }

  async image(id, relative) {
    const target = await this.resolve(id, relative);
    const type = imageTypes[path.extname(target).toLowerCase()];
    if (!type) throw new FileError(415, 'Not a supported image.');
    const stat = await fs.stat(target);
    if (stat.size > 20 * 1024 * 1024) throw new FileError(413, 'Image exceeds 20 MB.');
    return { content: await fs.readFile(target), type };
  }
}
