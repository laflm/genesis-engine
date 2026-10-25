import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { commitPixels } from '../layers/actions';
import { restoreOutside } from '../selection/selection';
import { ctxOf, makeCanvas } from '../canvas/pixels';
import type { Layer } from '../model';
import { session } from '../session';
import { h } from '../ui/dom';
import { registerSpriteTool, type PointerInfo } from './registry';

// Fondu de couleurs (« smudge ») : le pinceau transporte la couleur sous le doigt et la mélange à ce qu'il traverse.
const masks = new Map<number, HTMLCanvasElement>();
/** Disque à bord doux (alpha 1 au centre, 0 au bord). */
function softMask(d: number): HTMLCanvasElement {
  let m = masks.get(d); if (m) return m;
  m = makeCanvas(d, d); const g = ctxOf(m), r = d / 2, grad = g.createRadialGradient(r, r, r * CONFIG.blend.hardness, r, r, r);
  grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#fff0'); g.fillStyle = grad; g.fillRect(0, 0, d, d);
  masks.set(d, m); return m;
}
interface St { layer: Layer; before: ImageData; last: { x: number; y: number }; patch: HTMLCanvasElement; d: number }
let st: St | null = null;

/** Carré de côté d centré en (x, y) : décalage NÉGATIF pour ramener ce carré en (0, 0). */
function region(layer: Layer, x: number, y: number, d: number): HTMLCanvasElement {
  const c = makeCanvas(d, d); ctxOf(c).drawImage(layer.canvas, -Math.round(x - d / 2), -Math.round(y - d / 2)); return c;
}
function stampAt(s: St, x: number, y: number): void {
  const strength = Math.min(1, session.opacity * CONFIG.blend.strengthScale + 0.05);
  // 1. ramasse un peu de ce qui est SOUS le pinceau (avant de déposer, sinon on se re-mélange à soi-même) ;
  const pg = ctxOf(s.patch); pg.globalAlpha = 1 - CONFIG.blend.carry; pg.drawImage(region(s.layer, x, y, s.d), 0, 0); pg.globalAlpha = 1;
  // 2. dépose la couleur transportée, à bord doux.
  const dep = makeCanvas(s.d, s.d), dg = ctxOf(dep); dg.drawImage(s.patch, 0, 0); dg.globalCompositeOperation = 'destination-in'; dg.drawImage(softMask(s.d), 0, 0);
  const g = ctxOf(s.layer.canvas); g.globalAlpha = strength; g.drawImage(dep, Math.round(x - s.d / 2), Math.round(y - s.d / 2)); g.globalAlpha = 1;
  restoreOutside(s.layer.canvas, s.before);   // la sélection limite la zone modifiée
}

registerSpriteTool({
  id: 'blend', label: 'Fondu (mélange les couleurs)', icon: '👆', shortcut: 'U',
  down(p: PointerInfo) {
    const l = session.layer; if (!l || l.locked || !l.visible) { bus.emit('toast', 'Calque verrouillé ou masqué'); return; }
    const d = Math.max(4, Math.round(session.size));
    st = { layer: l, before: ctxOf(l.canvas).getImageData(0, 0, l.canvas.width, l.canvas.height), last: { x: p.x, y: p.y }, patch: region(l, p.x, p.y, d), d };
  },
  move(p: PointerInfo) {
    if (!st) return;
    const step = Math.max(1, (st.d / 2) * CONFIG.blend.spacing), dx = p.x - st.last.x, dy = p.y - st.last.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
    for (let i = 1; i <= n; i++) stampAt(st, st.last.x + (dx * i) / n, st.last.y + (dy * i) / n);
    st.last = { x: p.x, y: p.y }; bus.emit('pixels:changed');
  },
  up() { if (!st) return; commitPixels(st.layer, st.before, 'Fondu'); st = null; },
  cancel() { if (st) { ctxOf(st.layer.canvas).putImageData(st.before, 0, 0); st = null; bus.emit('pixels:changed'); } },
  options(host) { host.append(h('small', { class: 'hint' }, 'Glisse d\'une couleur vers une autre pour les mélanger. Taille = diamètre, Opacité = force du mélange.')); },
});
