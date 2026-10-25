// Géométrie pure de l'outil Transformer (rotation, échelle, symétries autour du centre).
export interface TF { cx: number; cy: number; w: number; h: number; scale: number; angle: number; flipX: boolean; flipY: boolean }
export interface Pt { x: number; y: number }

const rot = (x: number, y: number, a: number): Pt => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
const sx = (t: TF): number => t.scale * (t.flipX ? -1 : 1);
const sy = (t: TF): number => t.scale * (t.flipY ? -1 : 1);

/** Point de la frame → coordonnées de l'image flottante, relatives à son centre (avant échelle/rotation). */
export function toLocal(t: TF, px: number, py: number): Pt {
  const r = rot(px - t.cx, py - t.cy, -t.angle);
  return { x: r.x / sx(t), y: r.y / sy(t) };
}
/** Coordonnées locales → point de la frame. */
export function toFrame(t: TF, lx: number, ly: number): Pt {
  const r = rot(lx * sx(t), ly * sy(t), t.angle);
  return { x: t.cx + r.x, y: t.cy + r.y };
}
/** Coins dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche (de l'image d'origine). */
export function corners(t: TF): Pt[] {
  const hw = t.w / 2, hh = t.h / 2;
  return [toFrame(t, -hw, -hh), toFrame(t, hw, -hh), toFrame(t, hw, hh), toFrame(t, -hw, hh)];
}
/** Poignée de rotation : au-dessus du bord haut, `offset` unités de frame plus loin. */
export function rotateHandle(t: TF, offset: number): Pt {
  const r = rot(0, -(t.h / 2) * t.scale - offset, t.angle);
  return { x: t.cx + r.x, y: t.cy + r.y };
}

export type HitKind = 'rotate' | 'scale' | 'move' | null;
/** `tol` et `rotOffset` sont en unités de frame (px écran / zoom). */
export function hitTest(t: TF, px: number, py: number, tol: number, rotOffset: number): HitKind {
  const d = (a: Pt): number => Math.hypot(a.x - px, a.y - py);
  if (d(rotateHandle(t, rotOffset)) <= tol) return 'rotate';
  if (corners(t).some((c) => d(c) <= tol)) return 'scale';
  const l = toLocal(t, px, py);
  return Math.abs(l.x) <= t.w / 2 && Math.abs(l.y) <= t.h / 2 ? 'move' : null;
}
export function scaleFromDrag(start: number, c: Pt, p0: Pt, p: Pt, min: number, max: number): number {
  const d0 = Math.hypot(p0.x - c.x, p0.y - c.y) || 1;
  return Math.max(min, Math.min(max, start * (Math.hypot(p.x - c.x, p.y - c.y) / d0)));
}
export function angleFromDrag(start: number, c: Pt, p0: Pt, p: Pt): number {
  return start + Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(p0.y - c.y, p0.x - c.x);
}
