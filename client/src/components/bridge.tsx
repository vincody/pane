import {useLayoutEffect, useRef} from 'react';
import type {NativeIcon} from './contracts';

/** Existing editor/terminal controls keep their listeners until their own migration. */
export function NativeSlot({nodes, className}: {nodes: Node[]; className?: string}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host=ref.current!;host.append(...nodes);
    return () => { for(const node of nodes)if(node.parentNode===host)host.removeChild(node); };
  }, [nodes]);
  return <div ref={ref} className={className} style={{display:'contents'}} />;
}
export function Icon({name,icon}: {name: string; icon: NativeIcon}) {
  const ref=useRef<HTMLSpanElement>(null);
  useLayoutEffect(()=>{const node=icon(name);ref.current!.replaceChildren(node);return ()=>node.remove();},[name,icon]);
  return <span ref={ref} className="react-icon" aria-hidden="true" />;
}
