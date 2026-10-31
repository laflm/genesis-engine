import { bus } from '../../../core/events';
import { cloneCanvas, ctxOf } from '../canvas/pixels';
import type { Layer } from '../model';
import { session } from '../session';
import { registerSpriteTool, type PointerInfo } from './registry';

// Déplace le contenu du calque actif (ou de tous les calques de la frame si « Tous » est activé) au pixel près.
let start: PointerInfo | null = null;
let targets: Array<{ l: Layer; snap: HTMLCanvasElement }> = [];
let offset = { x: 0, y: 0 };

function apply(dx: number, dy: number): void {
  for (const t of targets) { const g = ctxOf(t.l.canvas); g.clearRect(0, 0, t.l.canvas.width, t.l.canvas.height); g.drawImage(t.snap, dx, dy); }
  bus.emit('pixels:changed');
}
registerSpriteTool({
  id: 'move', label: 'Déplacer', icon: '✥', shortcut: 'V',
  down(p) {
    const f = session.frame; if (!f) return;
    const ls = session.moveAllLayers ? f.layers : session.selectedLayers;
    targets = ls.filter((l) => !l.locked).map((l) => ({ l, snap: cloneCanvas(l.canvas) }));
    start = p; offset = { x: 0, y: 0 };
  },
  move(p) {
    if (!start) return;
    offset = { x: Math.round(p.x - start.x), y: Math.round(p.y - start.y) }; apply(offset.x, offset.y);
  },
  up() {
    if (!start) return;
    const ts = targets, o = offset; start = null; targets = [];
    if (!o.x && !o.y) return;
    const after = ts.map((t) => cloneCanvas(t.l.canvas));
    const set = (src: HTMLCanvasElement[]): void => ts.forEach((t, i) => { const g = ctxOf(t.l.canvas); g.clearRect(0, 0, t.l.canvas.width, t.l.canvas.height); g.drawImage(src[i]!, 0, 0); session.touch(); });
    session.history.push({ label: 'Déplacer', undo: () => set(ts.map((t) => t.snap)), redo: () => set(after) });
    session.touch();
  },
  cancel() { if (start) { apply(0, 0); start = null; targets = []; } },
});
