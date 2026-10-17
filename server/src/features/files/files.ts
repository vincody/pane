import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {repositoryName} from '../git/repository-name.ts';

export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const imageTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
export interface Workspace { id: string; name: string; root: string; parentId?: string; nameSource?:'automatic'|'custom';note?:string }
export interface FileTreeEntry { name: string; path: string; type: 'link' | 'directory' | 'file'; image: boolean }
export interface FileReference { name: string; path: string }
export interface FileReferenceResult { files: FileReference[]; truncated: boolean }
export interface SavedFile { version: string; size: number }
const MAX_PDF_BYTES = 100 * 1024 * 1024;
export type ReadFile = { kind: 'image'; media?: 'pdf'; size: number; path: string } | { kind: 'text'; content: string; version: string; bom: boolean; size: number };
interface ReferenceIndex { expires: number; pending?: Promise<void> | null; files?: FileReference[]; truncated?: boolean }
const excluded = new Set(['node_modules', '.git', '.ai-web']);
const hash = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

export class FileError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function isWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

export class Files {
  projects: Map<string, Workspace>;
  locks: Map<string, Promise<SavedFile>>;
  referenceIndexes: Map<string, ReferenceIndex>;
  constructor() { this.projects = new Map(); this.locks = new Map(); this.referenceIndexes=new Map(); }

  async addProject(input: unknown): Promise<Workspace> {
    if (typeof input !== 'string' || !path.isAbsolute(input)) throw new FileError(400, 'Enter an absolute folder path.');
    const root = await fs.realpath(input);
    if (!(await fs.stat(root)).isDirectory()) throw new FileError(400, 'Choose a folder, not a file.');
    const id = hash(Buffer.from(process.platform === 'win32' ? root.toLowerCase() : root)).slice(0, 16);
    const existing = this.projects.get(id);
    if (existing) return existing;
    const project:Workspace = { id, name: await repositoryName(root)||path.basename(root)||root, root,nameSource:'automatic' };
    this.projects.set(id, project);
    return project;
  }

  async resolve(id: string, relative = '') {
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

  async tree(id: string, relative = ''): Promise<FileTreeEntry[]> {
    const directory = await this.resolve(id, relative);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter(item => !excluded.has(item.name)).map((item): FileTreeEntry => ({
      name: item.name,
      path: path.posix.join(relative.replaceAll('\\', '/'), item.name),
      type: item.isSymbolicLink() ? 'link' : item.isDirectory() ? 'directory' : 'file',
      image: Boolean(imageTypes[path.extname(item.name).toLowerCase()]),
    })).sort((a, b) => (a.type === 'directory' ? 0 : 1) - (b.type === 'directory' ? 0 : 1) || a.name.localeCompare(b.name));
  }

  async searchReferences(id: string,query=''): Promise<FileReferenceResult> {
    const project=this.projects.get(id);if(!project)throw new FileError(404,'Project is not open.');if(typeof query!=='string'||query.length>160||query.includes('\0'))throw new FileError(400,'Invalid file search.');
    let index=this.referenceIndexes.get(id);
    if(!index||!index.pending&&index.expires<Date.now()){
      const newIndex: ReferenceIndex={expires:0};index=newIndex;this.referenceIndexes.set(id,index);
      index.pending=(async()=>{const files: FileReference[]=[],queue=[{relative:'',depth:0}];let visited=0,truncated=false;
        while(queue.length){if(visited++>=500||files.length>=5000){truncated=true;break;}const item=queue.shift();if(!item)break;const {relative,depth}=item;let entries;try{entries=await fs.readdir(await this.resolve(id,relative),{withFileTypes:true});}catch{continue;}
          entries.sort((a,b)=>a.name.localeCompare(b.name));for(const entry of entries){if(excluded.has(entry.name)||entry.isSymbolicLink())continue;const file=path.posix.join(relative,entry.name);if(entry.isDirectory()){if(depth<15)queue.push({relative:file,depth:depth+1});else truncated=true;}else if(entry.isFile()){if(files.length>=5000){truncated=true;break;}files.push({name:entry.name,path:file});}}
        }
        newIndex.files=files;newIndex.truncated=truncated;newIndex.expires=Date.now()+15000;
      })().finally(()=>newIndex.pending=null);
    }
    if(index.pending)await index.pending;const needle=query.toLowerCase().replaceAll('\\','/');const matches=(index.files || []).filter(file=>file.path.toLowerCase().includes(needle)).sort((a,b)=>Number(b.name.toLowerCase().startsWith(needle))-Number(a.name.toLowerCase().startsWith(needle))||a.path.localeCompare(b.path));return {files:matches.slice(0,40),truncated:index.truncated||matches.length>40};
  }

  async read(id: string, relative: string): Promise<ReadFile> {
    const target = await this.resolve(id, relative);
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new FileError(400, 'Choose a file.');
    if (imageTypes[path.extname(target).toLowerCase()]) return { kind: 'image', size: stat.size, path: relative };
    if (path.extname(target).toLowerCase() === '.pdf') return { kind: 'image', media: 'pdf', size: stat.size, path: relative };
    if (stat.size > MAX_TEXT_BYTES) throw new FileError(413, 'This file is larger than the 2 MB editor limit.');
    const buffer = await fs.readFile(target);
    if (buffer.length > MAX_TEXT_BYTES) throw new FileError(413, 'This file is larger than the 2 MB editor limit.');
    if (buffer.includes(0)) throw new FileError(415, 'Binary files cannot be edited as text.');
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new FileError(415, 'This editor supports UTF-8 text files.'); }
    return { kind: 'text', content, version: hash(buffer), bom: buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), size: buffer.length };
  }

  async save(id: string, relative: string, content: string, version: string, bom = false): Promise<SavedFile> {
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

  async image(id: string, relative: string): Promise<{ content: Buffer; type: string }> {
    const target = await this.resolve(id, relative);
    const pdf = path.extname(target).toLowerCase() === '.pdf';
    const type = pdf ? 'application/pdf' : imageTypes[path.extname(target).toLowerCase()];
    if (!type) throw new FileError(415, 'Not a supported image.');
    const stat = await fs.stat(target);
    if (pdf ? stat.size > MAX_PDF_BYTES : stat.size > 20 * 1024 * 1024) throw new FileError(413, pdf ? 'PDF exceeds 100 MB.' : 'Image exceeds 20 MB.');
    return { content: await fs.readFile(target), type };
  }
}
