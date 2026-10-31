import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { clearSelection, invertSelection, makeSelection, selectAll, setPreview, setSelection, type PathFn } from '../selection/selection';
import { h } from '../ui/dom';
import { session } from '../session';
import { registerSpriteTool, setActiveTool, type PointerInfo } from './registry';

export type SelectShape = 'rect' | 'ellipse' | 'lasso';
let shape: SelectShape = 'rect';
let start: PointerInfo | null = null;
let pts: Array<{ x: number; y: number }> = [];

/** Forme de sélection pour un glissé (rectangle/ellipse alignés sur les pixels, lasso = polygone libre). */
function shapePath(a: { x: number; y: number }, b: { x: number; y: number }): PathFn {
  if (shape === 'lasso') { const poly = pts.slice(); return (g) => { poly.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }; }
  const x0 = Math.floor(Math.min(a.x, b.x)), y0 = Math.floor(Math.min(a.y, b.y)), x1 = Math.ceil(Math.max(a.x, b.x)), y1 = Math.ceil(Math.max(a.y, b.y));
  return shape === 'rect' ? (g) => g.rect(x0, y0, x1 - x0, y1 - y0) : (g) => g.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(0.5, (x1 - x0) / 2), Math.max(0.5, (y1 - y0) / 2), 0, 0, Math.PI * 2);
}
const size = (): { w: number; h: number } => ({ w: session.asset?.w ?? 0, h: session.asset?.h ?? 0 });

registerSpriteTool({
  id: 'select', label: 'Sélection', icon: '⬚', shortcut: 'S', hideBrushSettings: true,
  down(p) { start = p; pts = [{ x: p.x, y: p.y }]; },
  move(p) {
    if (!start) return;
    if (shape === 'lasso') pts.push({ x: p.x, y: p.y });
    setPreview(shapePath(start, p));
  },
  up(p) {
    if (!start) return;
    const moved = Math.hypot(p.x - start.x, p.y - start.y) * session.view.zoom;
    const { w, h } = size();
    if (moved < CONFIG.selection.tapMaxPx) { setPreview(null); clearSelection(); }   // simple tap = désélectionner
    else { const s = makeSelection(w, h, shapePath(start, p)); setSelection(s); if (!s) bus.emit('toast', 'Sélection vide'); }
    start = null; pts = [];
  },
  cancel() { start = null; pts = []; setPreview(null); },
  options(host) {
    const sel = h('select', { 'aria-label': 'Forme de sélection' },
      h('option', { value: 'rect' }, 'Rectangle'), h('option', { value: 'ellipse' }, 'Ellipse'), h('option', { value: 'lasso' }, 'Lasso (main levée)'));
    sel.value = shape; sel.addEventListener('change', () => { shape = sel.value as SelectShape; });
    const b = (label: string, fn: () => void, title: string) => h('button', { class: 'btn small', title, onclick: fn }, label);
    host.append(sel, b('Tout', () => { const { w, h: hh } = size(); selectAll(w, hh); }, 'Tout sélectionner (Ctrl+A)'),
      b('Inverser', () => { const { w, h: hh } = size(); invertSelection(w, hh); }, 'Inverser (Ctrl+I)'),
      b('Aucune', () => clearSelection(), 'Désélectionner (Ctrl+D)'),
      b('↻ Transformer', () => setActiveTool('transform'), 'Déplacer / pivoter / redimensionner la sélection'));
  },
});
