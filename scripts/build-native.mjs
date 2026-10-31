// Builds the Rust addon in native/pane-native and copies it to native/pane-native.node, where the backend looks for it.
// Without a Rust toolchain this only warns: the backend falls back to PowerShell and netstat, so contributors do not need Rust.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const crate = path.join(root, 'native', 'pane-native');
const output = path.join(root, 'native', 'pane-native.node');
const library = {win32: 'pane_native.dll', darwin: 'libpane_native.dylib'}[process.platform] ?? 'libpane_native.so';

const probe = spawnSync('cargo', ['--version'], {encoding: 'utf8'});
if (probe.status !== 0) {
  console.warn('native: Rust (cargo) was not found, so the native addon was not built. Pane falls back to PowerShell and netstat.');
  process.exit(0);
}
// Run inside the crate so its .cargo/config.toml (static C runtime) applies.
const build = spawnSync('cargo', ['build', '--release'], {cwd: crate, stdio: 'inherit'});
if (build.status !== 0) {
  console.error('native: cargo build failed.');
  process.exit(build.status ?? 1);
}
fs.copyFileSync(path.join(crate, 'target', 'release', library), output);
console.log(`native: built ${path.relative(root, output)} (${Math.round(fs.statSync(output).size / 1024)} KB)`);
