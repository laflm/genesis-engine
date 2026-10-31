import { CONFIG } from '../../../config';
import { bus, listen } from '../../../core/events';
import { clearSelection, invertSelection, selectAll } from '../selection/selection';
import { session } from '../session';
import { applyFloating, cancelFloating, isFloating } from '../tools/lift';
import { listSpriteTools, setActiveTool } from '../tools';

/** Raccourcis clavier (ordinateur). Les touches viennent de CONFIG.shortcuts. */
export function bindShortcuts(): void {
  const S = CONFIG.shortcuts;
  listen(window, 'keydown', (ev) => {
    const e = ev as KeyboardEvent;
    const t = e.target as HTMLElement; if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    const combo = `${mod ? 'ctrl+' : ''}${e.shiftKey && mod ? 'shift+' : ''}${k}`;
    const a = session.asset;
    if (combo === S.undo) session.undo();
    else if (combo === S.redo || (mod && k === 'y')) session.redo();
    else if (combo === S.deselect) clearSelection();
    else if (combo === S.selectAll) { if (a) selectAll(a.w, a.h); }
    else if (combo === S.invertSelection) { if (a) invertSelection(a.w, a.h); }
    else if (mod) return;
    else if (k === S.applyTransform && isFloating()) applyFloating();
    else if (k === S.cancelTransform && isFloating()) cancelFloating();
    else if (k === S.sizeDown) session.size = Math.max(CONFIG.brush.minSize, session.size - 1);
    else if (k === S.sizeUp) session.size = Math.min(CONFIG.brush.maxSize, session.size + 1);
    else if (k === S.prevFrame) session.setFrame(session.frameIdx - 1); else if (k === S.nextFrame) session.setFrame(session.frameIdx + 1);
    else { const t = listSpriteTools().find((x) => x.shortcut?.toLowerCase() === k); if (!t) return; setActiveTool(t.id); }   // le raccourci de chaque outil est déclaré par l'outil lui-même
    e.preventDefault(); bus.emit('pixels:changed'); bus.emit('history:changed');
  });
}
