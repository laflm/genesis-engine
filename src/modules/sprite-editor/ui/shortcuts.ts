import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { session } from '../session';

/** Raccourcis clavier (ordinateur). Les touches viennent de CONFIG.shortcuts. */
export function bindShortcuts(): void {
  const S = CONFIG.shortcuts;
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement; if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    const combo = `${mod ? 'ctrl+' : ''}${e.shiftKey && mod ? 'shift+' : ''}${k}`;
    const tool = (id: string): void => { session.toolId = id; bus.emit('tool:changed'); };
    if (combo === S.undo) session.history.undo();
    else if (combo === S.redo || (mod && k === 'y')) session.history.redo();
    else if (mod) return;
    else if (k === S.brush) tool('brush'); else if (k === S.eraser) tool('eraser'); else if (k === S.fill) tool('fill');
    else if (k === S.pipette) tool('pipette'); else if (k === S.move) tool('move');
    else if (k === S.sizeDown) session.size = Math.max(CONFIG.brush.minSize, session.size - 1);
    else if (k === S.sizeUp) session.size = Math.min(CONFIG.brush.maxSize, session.size + 1);
    else if (k === S.prevFrame) session.setFrame(session.frameIdx - 1); else if (k === S.nextFrame) session.setFrame(session.frameIdx + 1);
    else return;
    e.preventDefault(); bus.emit('pixels:changed'); bus.emit('history:changed');
  });
}
