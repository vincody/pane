import {execFileSync} from 'node:child_process';

/** Expands %NAME% references in a REG_EXPAND_SZ value from `env`; names it does not know are left as written. */
export function expandEnvironment(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => {
    const key = Object.keys(env).find(item => item.toLowerCase() === name.toLowerCase());
    return key === undefined || env[key] === undefined ? whole : env[key]!;
  });
}

/** The Path value in the output of `reg query <key> /v Path`. */
export function parseRegistryPath(output: string): string | undefined {
  return /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/im.exec(output)?.[1];
}

const normalize = (entry: string) => entry.replace(/[\\/]+$/, '').toLowerCase();

/**
 * Keeps `current` exactly as it is and appends the entries it lacks. A tool installed after Pane started is then found,
 * while nothing Pane was launched with changes order or precedence.
 */
export function appendMissingPath(current: string, extra: string[]): string {
  const entries = current.split(';').filter(Boolean), seen = new Set(entries.map(normalize));
  for (const entry of extra) {
    const key = normalize(entry);
    if (!seen.has(key)) { seen.add(key); entries.push(entry); }
  }
  return entries.join(';');
}

const KEYS = ['HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', 'HKCU\\Environment'];

/** The machine and user Path entries as Windows has them now, which an already running process does not see. */
function readRegistryPath(env: NodeJS.ProcessEnv): string[] {
  const entries: string[] = [];
  for (const key of KEYS) {
    try {
      const output = execFileSync('reg.exe', ['query', key, '/v', 'Path'], {encoding: 'utf8', windowsHide: true, timeout: 2000, stdio: ['ignore', 'pipe', 'ignore']});
      const value = parseRegistryPath(output);
      if (value) entries.push(...expandEnvironment(value, env).split(';'));
    } catch {}
  }
  // reg.exe prints in the console code page, so an entry with other characters may arrive garbled: skip those rather than add a wrong path.
  return entries.map(entry => entry.trim()).filter(entry => entry && !entry.includes('%') && /^[\x20-\x7e]+$/.test(entry));
}

export interface CurrentPathOptions { platform?: NodeJS.Platform; read?: (env: NodeJS.ProcessEnv) => string[]; now?: () => number }

/**
 * Returns a function that gives a terminal the current Windows Path. Pane inherits its environment from whatever launched it
 * (a dock, an updater restart), so a tool installed since then would otherwise be missing from its terminals.
 */
export function createCurrentPath({platform = process.platform, read = readRegistryPath, now = Date.now}: CurrentPathOptions = {}) {
  let cache: {at: number; entries: string[]} | undefined;
  return (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
    if (platform !== 'win32') return env;
    // Reading the registry spawns two short processes; terminals restored together share one read.
    if (!cache || now() - cache.at > 3000) cache = {at: now(), entries: read(env)};
    const key = Object.keys(env).find(item => item.toLowerCase() === 'path') ?? 'Path';
    return {...env, [key]: appendMissingPath(env[key] ?? '', cache.entries)};
  };
}
