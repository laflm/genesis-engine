// Calculs purs sur pixels RGBA (testables sans navigateur).

/** Remet à leur valeur d'avant tous les pixels HORS sélection (masque : alpha >= 128 = sélectionné). */
export function restoreOutsideData(before: Uint8ClampedArray, cur: Uint8ClampedArray, mask: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < cur.length; i += 4) {
    if (mask[i + 3]! >= 128) continue;
    if (cur[i] !== before[i] || cur[i + 1] !== before[i + 1] || cur[i + 2] !== before[i + 2] || cur[i + 3] !== before[i + 3]) n++;
    cur[i] = before[i]!; cur[i + 1] = before[i + 1]!; cur[i + 2] = before[i + 2]!; cur[i + 3] = before[i + 3]!;
  }
  return n;
}

/** Rectangle englobant des pixels dont l'alpha >= `min` (null si vide). */
export function bboxOfAlpha(d: Uint8ClampedArray, w: number, h: number, min = 128): { x: number; y: number; w: number; h: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]! >= min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
