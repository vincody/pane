import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

/** The Rust addon in native/pane-native. Both calls return JSON text and throw if the system call fails. */
export interface PaneNative { listProcesses(): string; listTcpListeners(): string; parseTokenLog?(path: string, provider: 'codex' | 'claude'): Promise<string>; trimWorkingSets?(pids: number[]): number }

let loaded: PaneNative | null | undefined;
/**
 * The addon, or null when it is not built, not Windows, or switched off with PANE_NATIVE=0. Callers must keep their slower
 * fallback: the addon is an optimisation, never a requirement.
 */
export function native(): PaneNative | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (process.platform !== 'win32' || process.env.PANE_NATIVE === '0') return loaded;
  const here = path.dirname(fileURLToPath(import.meta.url)), load = createRequire(import.meta.url);
  // From server/src/lib in a checkout, and from desktop-build once bundled. A packaged app has the file outside its asar archive.
  for (const relative of ['../../../native', '../native']) {
    const file = path.join(here, relative, 'pane-native.node').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    try {
      const addon = load(file) as Partial<PaneNative>;
      if (typeof addon.listProcesses === 'function' && typeof addon.listTcpListeners === 'function') { loaded = addon as PaneNative; break; }
    } catch {}
  }
  return loaded;
}
