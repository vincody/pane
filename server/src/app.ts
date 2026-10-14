import {createAccountUsage} from './features/usage/account-usage.ts';
import {createTokenUsage} from './features/usage/token-usage.ts';
import {createLocalSessions} from './features/sessions/local-sessions.ts';
import {createLocalRunner} from './features/sessions/local-runner.ts';
import {attachTerminalPty} from './features/terminal/terminal-pty.ts';
import {selectSshKey} from './features/terminal/ssh-key-picker.ts';
import {selectWorkspaceFolder,defaultWorkspaceFolder} from './features/files/folder-picker.ts';
import {createProjectFolder} from './features/files/new-project.ts';
import {createDevServers,type DevServerOptions} from './features/dev-servers/dev-servers.ts';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Files, FileError, isWithin } from './features/files/files.ts';
import { gitBranch } from './features/git/git.ts';
import {worktreeBranches,createWorktree,unregisterNewWorktree,existingWorktree,createComposerWorktree} from './features/git/worktrees.ts';
import {changes,fileDiff} from './features/git/git-changes.ts';
import type { SessionRecord } from '../../shared/contracts.ts';

export interface AppOptions {
  devServerOptions?:Omit<DevServerOptions,'getProjects'>;
  initialRoot?: string; stateDir?: string; agentHome?: string;
  modelControl?: unknown;
  localLaunch?: Parameters<typeof createLocalRunner>[0]['launch'];
  accountUsage?: ReturnType<typeof createAccountUsage>;
  codexEngineFactory?: Parameters<typeof createLocalRunner>[0]['codexEngineFactory'];
}

export const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.mp3': 'audio/mpeg' };

async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 3 * 1024 * 1024) throw new FileError(413, 'Request too large.');
  }
  try { const parsed: unknown = JSON.parse(data); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected object'); return parsed as Record<string, unknown>; }
  catch { throw new FileError(400, 'Invalid JSON.'); }
}

export async function createApp({ initialRoot = appRoot, stateDir = path.join(appRoot, '.ai-web'), agentHome, localLaunch, accountUsage, codexEngineFactory,devServerOptions } : AppOptions = {}) {
  const files = new Files();
  const devServers=createDevServers({...devServerOptions,getProjects:()=>[...files.projects.values()]});
  const local=await createLocalSessions({home:agentHome,stateDir});
  const registeredSession=(record: SessionRecord)=>[...files.projects.values()].some(project=>record.cwd&&isWithin(path.resolve(project.root),path.resolve(record.cwd)));
  const localRunner=createLocalRunner({local,launch:localLaunch,allowRecord:registeredSession,codexEngineFactory});
  const usage=accountUsage || createAccountUsage({home:agentHome,requestCodex:(method,params)=>localRunner.accountRequest(method,params)});
  const tokenUsage=createTokenUsage({home:agentHome});
  const token = crypto.randomBytes(32).toString('hex');
  await fs.mkdir(stateDir, { recursive: true });
  const projectFile = path.join(stateDir, 'projects.json');
  let saved: unknown = null;
  try { saved = JSON.parse(await fs.readFile(projectFile, 'utf8')); } catch {}
  const candidates: unknown[] = Array.isArray(saved) ? saved.map((root: unknown) => ({ root })) : saved && typeof saved === 'object' && 'projects' in saved && Array.isArray(saved.projects) ? saved.projects : [];
  const entries = candidates.filter((entry): entry is { root: unknown; name?: unknown; parentId?:unknown;nameSource?:unknown;note?:unknown } => Boolean(entry && typeof entry === 'object' && 'root' in entry));
  for (const entry of entries) {
    try { const project = await files.addProject(entry.root); if(typeof entry.parentId==='string')project.parentId=entry.parentId; if(typeof entry.note==='string')project.note=entry.note.slice(0,2000); if(typeof entry.name==='string'&&entry.name.trim()){const name=entry.name.trim();const custom=entry.nameSource==='custom'||(entry.nameSource===undefined&&name!==path.basename(project.root)&&name!==project.name);if(project.parentId||custom){project.name=name.slice(0,200);project.nameSource='custom';}} } catch {}
  }
  for(const [id,project] of files.projects)if(project.parentId&&(!files.projects.has(project.parentId)||files.projects.get(project.parentId)?.parentId||project.parentId===id))files.projects.delete(id);
  // A persisted empty list is intentional: never resurrect a removed workspace.
  if (saved === null) await files.addProject(initialRoot);
  const preferredRoot = path.resolve(initialRoot);
  const defaultProjectId = () => [...files.projects.values()].find(project => path.resolve(project.root) === preferredRoot)?.id || files.projects.keys().next().value || null;
  let mutations: Promise<unknown> = Promise.resolve();
  function changeProjects<T>(operation: () => T | Promise<T>): Promise<T> {
    const task = mutations.catch(() => {}).then(async () => {
      const before = new Map([...files.projects].map(([id, project]) => [id, { ...project }]));
      try {
        const result = await operation();
        const temporary = projectFile + '.tmp';
        await fs.writeFile(temporary, JSON.stringify({ projects: [...files.projects.values()].map(({ root, name,parentId,nameSource,note }) => ({ root, name,nameSource,...(parentId?{parentId}:{}),...(note?{note}:{}) })) }, null, 2));
        await fs.rename(temporary, projectFile);
        return result;
      } catch (error) { files.projects = before; throw error; }
    });
    mutations = task; return task;
  }
  const listProjects = () => Promise.all([...files.projects.values()].map(async project => ({ ...project, branch: await gitBranch(project.root) })));
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:* ws://[::1]:* wss://127.0.0.1:* wss://localhost:* wss://[::1]:*; worker-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw new FileError(403, 'Only local connections are allowed.');
      const url = new URL(req.url || '', `http://${host}`);
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new FileError(403, 'Cross-origin requests are not allowed.');
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-ai-web-token'] !== token) throw new FileError(403, 'Reload AI Web to reconnect.');
        if (req.method === 'GET' && url.pathname === '/api/projects') return json(200, { projects: await listProjects(), defaultProject: defaultProjectId() });
        if(req.method==='POST'&&url.pathname==='/api/select-workspace-folder')return json(200,{path:await selectWorkspaceFolder()});
        if(req.method==='GET'&&url.pathname==='/api/project-defaults')return json(200,{parent:await defaultWorkspaceFolder()});
        if(req.method==='POST'&&url.pathname==='/api/create-project'){
          const data=await body(req);
          const project=await changeProjects(async()=>files.addProject(await createProjectFolder(data)));
          return json(201,{...project,branch:await gitBranch(project.root)});
        }
        if(req.method==='POST'&&url.pathname==='/api/project-order'){
          const data=await body(req);await changeProjects(()=>{
            if(!Array.isArray(data.ids)||!data.ids.every((id: unknown): id is string=>typeof id==='string')||new Set(data.ids).size!==data.ids.length)throw new FileError(400,'Provide each project ID exactly once.');
            const ids: string[] = data.ids;
            if(ids.length!==files.projects.size||ids.some(id=>!files.projects.has(id)))throw new FileError(409,'The project list changed. Refresh and try again.');
            files.projects=new Map(ids.map(id=>{const project=files.projects.get(id);if(!project)throw new FileError(409,'The project list changed. Refresh and try again.');return [id,project];}));
          });return json(200,{projects:await listProjects()});
        }
        if(url.pathname==='/api/sub-workspaces'){
          const parent=files.projects.get(url.searchParams.get('project')||'');
          if(!parent)throw new FileError(404,'Workspace not found.');
          if(parent.parentId)throw new FileError(400,'Choose a parent workspace.');
          if(req.method==='GET')return json(200,await worktreeBranches(parent));
          if(req.method==='POST'){
            const data=await body(req);let created:{root:string;name:string;parentId:string;note?:string}|undefined;
            try{
              const child=await changeProjects(async()=>{
                if(!files.projects.has(parent.id))throw new FileError(404,'Workspace was removed.');
                if(data.mode==='open'){
                  const root=await existingWorktree(parent,data.branch);
                  if(isWithin(root,parent.root))return parent;
                  const prior=[...files.projects.values()].find(project=>project.root===root);
                  if(prior)return prior;
                  const opened=await files.addProject(root);opened.name=typeof data.branch==='string'?data.branch:opened.name;opened.parentId=parent.id;opened.nameSource='custom';return opened;
                }
                created=await (data.mode==='compose'?createComposerWorktree(parent,stateDir,data):createWorktree(parent,stateDir,data));
                const child=await files.addProject(created.root);child.name=created.name;child.parentId=parent.id;child.nameSource='custom';if(created.note)child.note=created.note;return child;
              });
              return json(201,{...child,branch:await gitBranch(child.root)});
            }catch(error){if(created)await unregisterNewWorktree(parent,created.root).catch(()=>{});throw error;}
          }
          throw new FileError(405,'Method not allowed.');
        }
        if (req.method === 'GET' && url.pathname === '/api/health') return json(200, { app: 'ai-web', version: '0.1.0' });
        if (req.method === 'POST' && url.pathname === '/api/projects') {
          const data = await body(req);
          const project = await changeProjects(() => files.addProject(data.path));
          return json(201, { ...project, branch: await gitBranch(project.root) });
        }
        if(req.method==='POST'&&url.pathname==='/api/ssh/select-key')return json(200,{path:await selectSshKey()});
        if(req.method==='GET'&&url.pathname==='/api/account-usage')return json(200,await usage.read((url.searchParams.get('providers') || '').split(',').filter(Boolean)));
        if(req.method==='GET'&&url.pathname==='/api/token-usage')return json(200,await tokenUsage.read(Number(url.searchParams.get('since')||0)));
        if(req.method==='POST'&&url.pathname==='/api/close-terminal'){const data=await body(req);if(typeof data.sessionId!=='string')throw new FileError(400,'Provide a terminal session ID.');return json(200,{closed:closeTerminalPty.stop(data.sessionId)});}
        if(req.method==='GET'&&url.pathname==='/api/dev-servers'){
          const project=url.searchParams.get('project')||'';if(!files.projects.has(project))throw new FileError(404,'Workspace not found.');
          return json(200,await devServers.read(project));
        }
        if(req.method==='GET'&&url.pathname==='/api/local-sessions')return json(200,await localRunner.snapshot());
        if(url.pathname==='/api/sessions'){const id=(url.searchParams.get('id')||'');if(req.method==='PATCH'){const data=await body(req);return json(200,await local.rename(id,data.name));}if(req.method==='DELETE'){await local.remove(id);return json(200,{removed:id});}}
        if(req.method==='POST'&&url.pathname==='/api/close-local-session')return json(200,await localRunner.release((url.searchParams.get('agent')||''),(url.searchParams.get('session')||'')));
        if(req.method==='POST'&&url.pathname==='/api/resume-session')return json(200,await localRunner.resume((url.searchParams.get('id')||'')));
        if(req.method==='GET'&&url.pathname==='/api/saved-session'){const record=await local.get((url.searchParams.get('id')||''));if(!registeredSession(record))throw new FileError(404,'Add this session folder as a project first.');return json(200,{...await local.history(record.id),agent:{...record,archived:true,agent_status:'saved'},terminal:'',question:null,context:{cwd:record.cwd,branch:await gitBranch(record.cwd)}});}
        if (url.pathname === '/api/agent-session') {
          const target = (url.searchParams.get('agent')||''); const identity = (url.searchParams.get('session')||'');const controller=localRunner;
          if (req.method === 'GET') return json(200, await controller.read(target, identity));
        }
        const id = url.searchParams.get('project') || '';
        const relative = url.searchParams.get('path') || '';
        if(req.method==='GET'&&['/api/changes','/api/diff'].includes(url.pathname)){
          const project=files.projects.get(id);if(!project)throw new FileError(404,'Workspace not found.');
          return json(200,url.pathname==='/api/diff'?await fileDiff(project.root,relative):await changes(project.root));
        }
        if (req.method === 'PATCH' && url.pathname === '/api/projects') {
          const data = await body(req);
          if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 80) throw new FileError(400, 'Workspace name must be 1–80 characters.');
          const name = data.name.trim();
          const project = await changeProjects(() => {
            const project = files.projects.get(id);
            if (!project) throw new FileError(404, 'Workspace not found.');
            project.name = name;project.nameSource='custom'; return project;
          });
          return json(200, project);
        }
        if (req.method === 'DELETE' && url.pathname === '/api/projects') {
          const removed=await changeProjects(() => {
            if (!files.projects.has(id)) throw new FileError(404, 'Workspace not found.');
            const removed=[id,...[...files.projects.values()].filter(project=>project.parentId===id).map(project=>project.id)];
            for(const key of removed)files.projects.delete(key);return removed;
          });
          // Only the web registry changes. No filesystem deletion or agent process control.
          return json(200, { removed: id,removedIds:removed });
        }
        if (req.method === 'GET' && url.pathname === '/api/tree') return json(200, { entries: await files.tree(id, relative) });
        if (req.method === 'GET' && url.pathname === '/api/file') return json(200, await files.read(id, relative));
        if (req.method === 'PUT' && url.pathname === '/api/file') {
          const data = await body(req);
          if (typeof data.content !== 'string' || typeof data.version !== 'string') throw new FileError(400,'Missing content or file version.');
          return json(200, await files.save(id, relative, data.content, data.version, Boolean(data.bom)));
        }
        if (req.method === 'GET' && url.pathname === '/api/image') {
          const image = await files.image(id, relative);
          // Prevent an SVG opened directly from executing code on the app origin.
          res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
          res.writeHead(200, { 'Content-Type': image.type }); return res.end(image.content);
        }
        return json(404, { error: 'Endpoint not found.' });
      }
      if (req.method !== 'GET') throw new FileError(405, 'Method not allowed.');
      const dist = path.join(appRoot, 'dist');
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const target = path.resolve(dist, '.' + relative);
      if (!isWithin(dist, target)) throw new FileError(403, 'Invalid path.');
      let content = await fs.readFile(target);
      if (target === path.join(dist, 'index.html')) content = Buffer.from(content.toString().replace('__AI_WEB_TOKEN__', token));
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
      res.end(content);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      const status = error instanceof FileError ? error.status : code === 'ENOENT' ? 404 : code === 'EACCES' || code === 'EPERM' ? 403 : 500;
      json(status, { error: status === 500 ? 'The local service could not complete this request.' : error instanceof Error ? error.message : 'Request failed.' });
    }
  });
  const closeTerminalPty=attachTerminalPty(server,{token,getProject:id=>files.projects.get(id),onStart:devServers.register,onStop:devServers.unregister,onOutput:devServers.output});
  let closing: Promise<unknown> | undefined;const closeSessions=()=>{devServers.dispose();return closing ||= Promise.all([localRunner.close(),closeTerminalPty()]);};server.on('close',()=>{void closeSessions().catch(()=>{});});
  return { server, files, token, closeSessions };
}
