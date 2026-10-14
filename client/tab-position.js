const positions = new Map();
let next = 0;
export function forgetTabPosition(key){positions.delete(key);}
export function positionTab(node, key) {
  if (!positions.has(key)) positions.set(key, ++next);
  node.style.order = String(positions.get(key));
}
export function reorderFilePositions(keys) {
  const slots = keys.map(key => positions.get(`file:${key}`)).filter(value => value !== undefined).sort((a,b) => a-b);
  keys.forEach((key,index) => { if (slots[index] !== undefined) positions.set(`file:${key}`,slots[index]); });
}
export function setupUnifiedTabOrder(strip,onOrder){
  let source;
  const key=node=>node.dataset.sessionId?`terminal:${node.dataset.sessionId}`:`file:${node.dataset.tabKey}`;
  const selector='[data-tab-key],[data-session-id]';
  const clear=()=>strip.querySelectorAll('.tab-drop-before,.tab-drop-after').forEach(node=>node.classList.remove('tab-drop-before','tab-drop-after'));
  strip.addEventListener('dragstart',event=>{const node=event.target.closest(selector);if(node&&!event.target.closest('button,input'))source=key(node);});
  strip.addEventListener('dragover',event=>{if(!source)return;const node=event.target.closest(selector);if(!node||key(node)===source)return;event.preventDefault();clear();node.classList.add(event.clientX>node.getBoundingClientRect().left+node.offsetWidth/2?'tab-drop-after':'tab-drop-before');});
  strip.addEventListener('drop',event=>{
    const target=event.target.closest(selector);if(!source||!target)return;event.preventDefault();event.stopPropagation();
    const nodes=[...strip.querySelectorAll(selector)];const order=nodes.map(key).sort((a,b)=>positions.get(a)-positions.get(b));
    const moving=source;source=null;if(moving===key(target)){clear();return;}
    order.splice(order.indexOf(moving),1);order.splice(order.indexOf(key(target))+(event.clientX>target.getBoundingClientRect().left+target.offsetWidth/2?1:0),0,moving);
    order.forEach((id,index)=>positions.set(id,index+1));next=Math.max(next,order.length);
    for(const node of nodes)positionTab(node,key(node));onOrder(order.filter(id=>id.startsWith('file:')).map(id=>id.slice(5)));clear();
  });
  document.addEventListener('dragend',()=>{source=null;clear();});
}
