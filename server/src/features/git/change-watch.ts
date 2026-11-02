import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';

/**
 * Tells the Changes view whether anything could have changed, so an idle window stops running git every few seconds.
 * It watches a workspace's files (and its git directory, which for a worktree lives elsewhere) and bumps a version on any
 * event that can alter `git status`. A client that holds the current version is told "unchanged" instead of paying for four git
 * processes. A full refresh still happens once a minute as a safety net for anything a watcher cannot see.
 */
const SAFETY_REFRESH_MS = 60_000;
interface Entry { root: string; version: number; lastRun: number; broken: boolean; watchers: fs.FSWatcher[] }

const SKIPPED_DIRS = new Set(['node_modules', '.ai-web', '.git']);
/** A file event in the working tree: ignore dependency folders, the git directory and git's own lock files. */
export function treeEventMatters(name: string | null) {
  if (!name) return true; // the platform could not say what changed: assume the worst
  const parts = name.split(/[\\/]/);
  return !parts.some(part => SKIPPED_DIRS.has(part)) && !name.endsWith('.lock');
}
/** An event inside the git directory: index, HEAD, refs and merge/rebase state matter; objects, logs and locks do not. */
export function gitEventMatters(name: string | null) {
  if (!name) return true;
  const first = name.split(/[\\/]/)[0];
  return !['objects', 'logs', 'hooks', 'info'].includes(first) && !name.endsWith('.lock') && name !== 'FETCH_HEAD';
}

function gitDirectory(root: string): Promise<string | null> {
  return new Promise(resolve => execFile('git', ['rev-parse', '--absolute-git-dir'], {cwd: root, windowsHide: true, timeout: 10_000}, (error, stdout) => resolve(error ? null : path.resolve(stdout.trim()) || null)));
}

export function createChangeWatch() {
  const entries = new Map<string, Entry>();
  function close(entry: Entry) { for (const watcher of entry.watchers) { try { watcher.close(); } catch {} } entry.watchers = []; }
  function watch(entry: Entry, target: string, matters: (name: string | null) => boolean) {
    try {
      const watcher = fs.watch(target, {recursive: true, persistent: false}, (_event, name) => { if (matters(name === null ? null : String(name))) entry.version++; });
      watcher.on('error', () => { entry.broken = true; });
      entry.watchers.push(watcher);
    } catch { entry.broken = true; }
  }
  /** The entry for a workspace, watching it from the first call on. */
  function track(id: string, root: string) {
    let entry = entries.get(id);
    if (entry && entry.root !== root) { close(entry); entries.delete(id); entry = undefined; }
    if (!entry) {
      const created: Entry = {root, version: 0, lastRun: 0, broken: false, watchers: []};
      entries.set(id, created); entry = created;
      watch(created, root, treeEventMatters);
      void gitDirectory(root).then(directory => { if (directory && entries.get(id) === created) watch(created, directory, gitEventMatters); });
    }
    return entry;
  }
  return {
    track,
    /** True when nothing relevant happened since `since` and the last full refresh is recent. */
    unchanged(id: string, root: string, since: number) {
      const entry = track(id, root);
      return !entry.broken && entry.lastRun > 0 && since === entry.version && Date.now() - entry.lastRun < SAFETY_REFRESH_MS;
    },
    ran(id: string) { const entry = entries.get(id); if (entry) entry.lastRun = Date.now(); },
    forget(id: string) { const entry = entries.get(id); if (entry) { close(entry); entries.delete(id); } },
    dispose() { for (const entry of entries.values()) close(entry); entries.clear(); },
  };
}
export type ChangeWatch = ReturnType<typeof createChangeWatch>;
