export function kind(path:string) {
  if (/\.(png|jpe?g|gif|webp|avif|ico|svg)$/i.test(path)) return 'image';
  if (/\.(md|markdown)$/i.test(path)) return 'markdown';
  return 'code';
}
export function language(path:string) {
  const ext = path.split('.').pop()!.toLowerCase();
  return ({ js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', css: 'css', scss: 'scss', html: 'html', htm: 'html', md: 'markdown', py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp', sh: 'shell', ps1: 'powershell', toml: 'ini', yml: 'yaml', yaml: 'yaml', sql: 'sql', xml: 'xml', svg: 'xml', txt: 'plaintext' } as Record<string,string>)[ext] || 'plaintext';
}
