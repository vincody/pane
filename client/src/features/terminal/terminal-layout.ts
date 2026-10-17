export type SplitDirection='right'|'down';
export type PaneTree<T>={session:T}|{direction:SplitDirection;ratio:number;first:PaneTree<T>;second:PaneTree<T>};
export function leaves<T>(tree:PaneTree<T>|null|undefined):T[] { return !tree?[]:'session' in tree?[tree.session]:[...leaves(tree.first),...leaves(tree.second)]; }
export function removePane<T>(tree:PaneTree<T>|null, session:T):PaneTree<T>|null {
  if (!tree || 'session' in tree&&tree.session===session) return null;
  if ('session' in tree) return tree;
  const first=removePane(tree.first,session),second=removePane(tree.second,session);
  return !first ? second : !second ? first : {...tree,first,second};
}
export type DropZone='left'|'right'|'up'|'down'|'swap';
// The nearest edge within a third of the pane splits that side; the middle swaps.
export function dropZone(x:number,y:number,width:number,height:number):DropZone {
  const edges:[DropZone,number][]=[['left',x/width],['right',1-x/width],['up',y/height],['down',1-y/height]];
  const [zone,distance]=edges.reduce((best,edge)=>edge[1]<best[1]?edge:best);
  return distance<=1/3?zone:'swap';
}
export function splitPane<T>(tree:PaneTree<T>, target:T, session:T, direction:SplitDirection, before=false):PaneTree<T> {
  if ('session' in tree&&tree.session === target) return {direction,ratio:.5,first:before?{session}:tree,second:before?tree:{session}};
  if ('session' in tree) return tree;
  return {...tree,first:splitPane(tree.first,target,session,direction,before),second:splitPane(tree.second,target,session,direction,before)};
}
export function swapPanes<T>(tree:PaneTree<T>, first:T, second:T):PaneTree<T> {
  if('session' in tree)return {...tree,session:tree.session===first?second:tree.session===second?first:tree.session};
  return {...tree,first:swapPanes(tree.first,first,second),second:swapPanes(tree.second,first,second)};
}
export function chooseBalancedSplit<T extends {lastUsed?:number}>(tree:PaneTree<T>,measure:(session:T)=>number=()=>0) {
  const candidates:{session:T;depth:number;area:number}[]=[];
  function visit(node:PaneTree<T>,depth=0,fraction=1):void{
    if('session' in node){candidates.push({session:node.session,depth,area:measure(node.session)||fraction});return;}
    visit(node.first,depth+1,fraction*node.ratio);visit(node.second,depth+1,fraction*(1-node.ratio));
  }
  visit(tree);
  const minDepth=Math.min(...candidates.map(item=>item.depth));
  const tier=candidates.filter(item=>item.depth===minDepth);
  const largest=Math.max(...tier.map(item=>item.area));
  const chosen=tier.filter(item=>item.area>=largest*.99).sort((a,b)=>(b.session.lastUsed||0)-(a.session.lastUsed||0))[0];
  return {...chosen,direction:(chosen.depth%2===0?'right':'down') as SplitDirection};
}
