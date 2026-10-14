import {required} from '../../lib/dom.ts';
export function setupPanelResize() {
  const app = required('#app');
  const geometry=document.documentElement;
  const panels = [['.sidebar', 'left'], ['#files-sidebar', 'right']];
  for (const [selector, side] of panels) {
    const panel = required(selector);
    const variable = `--${side}-panel-width`;
    const key = `ai-web.${side}-panel-width`;
    let saved=0; try { saved = Number(localStorage.getItem(key)); } catch {}
    if (saved >= 220 && saved <= 420) geometry.style.setProperty(variable, `${saved}px`);
    const handle = document.createElement('div'); handle.className = `panel-resizer ${side}`;
    handle.tabIndex = 0; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', side === 'left' ? 'Resize workspace sidebar' : 'Resize Files sidebar');
    handle.setAttribute('aria-valuemin', '220'); handle.setAttribute('aria-valuemax', '420');
    handle.title = 'Drag to resize · Arrow keys to adjust · Double-click to reset'; panel.append(handle);
    const value = () => Math.round(panel.getBoundingClientRect().width);
    const updateAria = () => handle.setAttribute('aria-valuenow', String(value()));
    const set = (width:number) => { width = Math.max(220, Math.min(420, width)); geometry.style.setProperty(variable, `${width}px`); handle.setAttribute('aria-valuenow', String(Math.round(width))); };
    const persist = () => { try { localStorage.setItem(key, String(value())); } catch {} };
    const reset = () => { geometry.style.removeProperty(variable); try { localStorage.removeItem(key); } catch {} };
    let drag:{start:number;x:number;width:number;pointer:number}|null=null, frame:number|null=null;
    const flush = () => { frame = null; if (drag) set(drag.width + (drag.x - drag.start) * (side === 'left' ? 1 : -1)); };
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      event.preventDefault(); drag = { start: event.clientX, x: event.clientX, width: value(), pointer: event.pointerId };
      handle.setPointerCapture(event.pointerId); app.classList.add('resizing-panels'); handle.classList.add('dragging');
    });
    handle.addEventListener('pointermove', event => { if (!drag || event.pointerId !== drag.pointer) return; drag.x = event.clientX; if (!frame) frame = requestAnimationFrame(flush); });
    const finish = () => { if (!drag) return; if (frame) cancelAnimationFrame(frame); flush(); persist(); drag = null; app.classList.remove('resizing-panels'); handle.classList.remove('dragging'); };
    handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish); handle.addEventListener('lostpointercapture', finish);
    handle.addEventListener('dblclick', reset);
    handle.addEventListener('keydown', event => {
      if (event.key === 'Home') { event.preventDefault(); reset(); return; }
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const direction = event.key === 'ArrowRight' ? 1 : -1;
      set(value() + direction * (side === 'left' ? 1 : -1) * (event.shiftKey ? 40 : 10));
      setTimeout(persist, 280);
    });
    new ResizeObserver(updateAria).observe(panel); updateAria();
  }
}
