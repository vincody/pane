/** A sibling folder suggestion; users can choose a different absolute location. */
export function suggestWorktreePath(repository:string,branch:string):string{
 const name=branch.trim();if(!repository||!name)return '';
 const windows=/^(?:[a-z]:[\\/]|\\\\)/i.test(repository);
 const root=repository.replace(windows?/[\\/]+$/:/\/+$/,'');
 const cut=windows?Math.max(root.lastIndexOf('\\'),root.lastIndexOf('/')):root.lastIndexOf('/');
 const folder=root.slice(cut+1);if(!folder)return '';
 const separator=windows&&root[cut]==='\\'?'\\':'/';
 return `${root}-worktrees${separator}${name}`;
}
