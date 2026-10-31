// Géométrie de la vue (zoom + rotation + déplacement). Pure : testable sans navigateur.
// Écran = (x, y) + R(rot) · (zoom · point de la frame).
export interface V { zoom: number; x: number; y: number; rot: number }
export interface Pt { x: number; y: number }

export function toFrame(v: V, sx: number, sy: number): Pt {
  const dx = sx - v.x, dy = sy - v.y, c = Math.cos(-v.rot), s = Math.sin(-v.rot);
  return { x: (dx * c - dy * s) / v.zoom, y: (dx * s + dy * c) / v.zoom };
}
export function toScreen(v: V, fx: number, fy: number): Pt {
  const c = Math.cos(v.rot), s = Math.sin(v.rot), x = fx * v.zoom, y = fy * v.zoom;
  return { x: v.x + x * c - y * s, y: v.y + x * s + y * c };
}
/** Change le zoom en gardant FIXE le point de la frame situé sous (sx, sy). */
export function zoomAt(v: V, sx: number, sy: number, factor: number, min: number, max: number): V {
  const f0 = toFrame(v, sx, sy), z = Math.max(min, Math.min(max, v.zoom * factor));
  const p = toScreen({ ...v, zoom: z, x: 0, y: 0 }, f0.x, f0.y);
  return { ...v, zoom: z, x: sx - p.x, y: sy - p.y };
}
/** Pivote la vue de `d` radians autour du point d'écran (sx, sy), qui reste fixe. */
export function rotateAt(v: V, sx: number, sy: number, d: number): V {
  const f0 = toFrame(v, sx, sy), nv = { ...v, rot: v.rot + d, x: 0, y: 0 }, p = toScreen(nv, f0.x, f0.y);
  return { ...nv, x: sx - p.x, y: sy - p.y };
}
/** Différence d'angle ramenée dans ]-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d;
}
