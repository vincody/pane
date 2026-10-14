import fs from 'node:fs/promises';
import path from 'node:path';

// Read only Git's HEAD metadata; do not spawn Git or inspect file contents.
export async function gitBranch(start:string) {
  let directory = path.resolve(start);
  for (;;) {
    try {
      let git = path.join(directory, '.git');
      const info = await fs.stat(git);
      if (info.isFile()) {
        const pointer = (await fs.readFile(git, 'utf8')).match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
        if (!pointer) return null;
        git = path.resolve(directory, pointer);
      }
      const head = (await fs.readFile(path.join(git, 'HEAD'), 'utf8')).trim();
      const branch = head.match(/^ref:\s*refs\/heads\/(.+)$/)?.[1];
      if (branch) return branch;
      return /^[a-f0-9]{7,64}$/i.test(head) ? head.slice(0, 7) : null;
    } catch {}
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}
