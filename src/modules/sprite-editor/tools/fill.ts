import { bus } from '../../../core/events';
import { ctxOf } from '../canvas/pixels';
import { commitPixels } from '../layers/actions';
import { restoreOutside } from '../selection/selection';
import { session } from '../session';
import { registerSpriteTool } from './registry';

export function parseColor(hex: string): [number, number, number] {
  const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

/** Remplissage par diffusion (pur sur pixels RGBA). Retourne le nombre de pixels remplis. */
export function floodFill(d: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, rgb: [number, number, number], tol: number): number {
  const i0 = (sy * w + sx) * 4;
  const t = [d[i0]!, d[i0 + 1]!, d[i0 + 2]!, d[i0 + 3]!];
  if (t[3] === 255 && t[0] === rgb[0] && t[1] === rgb[1] && t[2] === rgb[2]) return 0;
  const match = (i: number): boolean => Math.max(Math.abs(d[i]! - t[0]!), Math.abs(d[i + 1]! - t[1]!), Math.abs(d[i + 2]! - t[2]!), Math.abs(d[i + 3]! - t[3]!)) <= tol;
  const seen = new Uint8Array(w * h), stack = [sy * w + sx]; seen[sy * w + sx] = 1;
  let n = 0;
  while (stack.length) {
    const p = stack.pop()!, i = p * 4;
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; n++;
    const x = p % w, y = (p / w) | 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx; if (seen[q]) continue; seen[q] = 1;
      if (match(q * 4)) stack.push(q);
    }
  }
  return n;
}

registerSpriteTool({
  id: 'fill', label: 'Remplir', icon: '🪣', shortcut: 'G',
  down(p) {
    const l = session.layer; if (!l || l.locked) return;
    const { width: w, height: h } = l.canvas, x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const g = ctxOf(l.canvas), before = g.getImageData(0, 0, w, h), img = g.getImageData(0, 0, w, h);
    if (floodFill(img.data, w, h, x, y, parseColor(session.color), session.fillTolerance)) { g.putImageData(img, 0, 0); restoreOutside(l.canvas, before); commitPixels(l, before, 'Remplissage'); bus.emit('pixels:changed'); }
  },
  move() {}, up() {}, cancel() {},
});
