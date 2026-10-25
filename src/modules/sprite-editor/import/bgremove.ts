// Suppression de fond sur des pixels RGBA bruts (pur, testable sans navigateur).
export interface RGB { r: number; g: number; b: number }

/** Si les 4 coins sont opaques et de même couleur (± tolérance), renvoie cette couleur ; sinon null. */
export function detectBackground(d: Uint8ClampedArray, w: number, h: number, tol = 12): RGB | null {
  const at = (x: number, y: number): RGB & { a: number } => { const i = (y * w + x) * 4; return { r: d[i]!, g: d[i + 1]!, b: d[i + 2]!, a: d[i + 3]! }; };
  const cs = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  if (cs.some((c) => c.a < 250)) return null;
  const ref = cs[0]!;
  if (cs.some((c) => Math.max(Math.abs(c.r - ref.r), Math.abs(c.g - ref.g), Math.abs(c.b - ref.b)) > tol)) return null;
  return { r: ref.r, g: ref.g, b: ref.b };
}

/**
 * Rend transparents les pixels proches de `color`. En mode `contiguous` (défaut) seuls les pixels
 * reliés aux bords sont effacés : les zones blanches INTÉRIEURES (yeux, reflets) sont conservées.
 * Retourne le nombre de pixels effacés. Modifie `d` en place.
 */
export function removeBackground(d: Uint8ClampedArray, w: number, h: number, color: RGB, tol: number, contiguous = true): number {
  const near = (i: number): boolean =>
    d[i + 3]! > 0 && Math.max(Math.abs(d[i]! - color.r), Math.abs(d[i + 1]! - color.g), Math.abs(d[i + 2]! - color.b)) <= tol;
  let n = 0;
  if (!contiguous) {
    for (let i = 0; i < d.length; i += 4) if (near(i)) { d[i + 3] = 0; n++; }
    return n;
  }
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number): void => { const p = y * w + x; if (!seen[p] && near(p * 4)) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop()!;
    d[p * 4 + 3] = 0; n++;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return n;
}
