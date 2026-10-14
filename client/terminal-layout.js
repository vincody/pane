export function leaves(tree) { return tree?.session ? [tree.session] : tree ? [...leaves(tree.first), ...leaves(tree.second)] : []; }
export function removePane(tree, session) {
  if (!tree || tree.session === session) return null;
  if (tree.session) return tree;
  const first=removePane(tree.first,session),second=removePane(tree.second,session);
  return !first ? second : !second ? first : {...tree,first,second};
}
export function splitPane(tree, target, session, direction) {
  if (tree.session === target) return {direction,ratio:.5,first:tree,second:{session}};
  if (tree.session) return tree;
  return {...tree,first:splitPane(tree.first,target,session,direction),second:splitPane(tree.second,target,session,direction)};
}
export function swapPanes(tree, first, second) {
  if(tree.session)return {...tree,session:tree.session===first?second:tree.session===second?first:tree.session};
  return {...tree,first:swapPanes(tree.first,first,second),second:swapPanes(tree.second,first,second)};
}
export function chooseBalancedSplit(tree,measure=()=>0) {
  const candidates=[];
  function visit(node,depth=0,fraction=1){
    if(node.session){candidates.push({session:node.session,depth,area:measure(node.session)||fraction});return;}
    visit(node.first,depth+1,fraction*node.ratio);visit(node.second,depth+1,fraction*(1-node.ratio));
  }
  visit(tree);
  const minDepth=Math.min(...candidates.map(item=>item.depth));
  const tier=candidates.filter(item=>item.depth===minDepth);
  const largest=Math.max(...tier.map(item=>item.area));
  const chosen=tier.filter(item=>item.area>=largest*.99).sort((a,b)=>(b.session.lastUsed||0)-(a.session.lastUsed||0))[0];
  return {...chosen,direction:chosen.depth%2===0?'right':'down'};
}
