// Moteur de déformation (pur : aucun accès au DOM, testable en Node).
// Tout passe par un MAILLAGE : une grille de nœuds (positions d'arrivée) dont chaque case est découpée en 2 triangles,
// remplis par interpolation barycentrique de l'image d'origine (bilinéaire).
//   Libre / Proportionnel = maillage 2×2 (exact) ; Perspective = homographie échantillonnée ; Warp = grille lissée (Catmull-Rom).
export interface P { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

// ---------- Perspective ----------
/** Homographie 3×3 (h22 = 1) qui envoie les 4 points `src` sur les 4 points `dst`. null si dégénérée. */
export function homography(src: P[], dst: P[]): number[] | null {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!, { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u], [0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  for (let c = 0; c < 8; c++) {              // élimination de Gauss avec pivot partiel
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-12) return null;
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r]![c]! / A[c]![c]!; for (let k = c; k < 9; k++) A[r]![k]! -= f * A[c]![k]!; }
  }
  return [...Array.from({ length: 8 }, (_, i) => A[i]![8]! / A[i]![i]!), 1];
}
export function applyH(h: number[], x: number, y: number): P {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return { x: (h[0]! * x + h[1]! * y + h[2]!) / w, y: (h[3]! * x + h[4]! * y + h[5]!) / w };
}
/** Le quadrilatère (haut-gauche, haut-droit, bas-droit, bas-gauche) est-il convexe et non aplati ? */
export function quadValid(q: P[], minArea = 4): boolean {
  let sign = 0, area = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!, c = q[(i + 2) % 4]!;
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) return false;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2 >= minArea;
}
/** Nœuds (ligne par ligne) d'un maillage (sub+1)² dont les 4 coins sont envoyés sur `quad` par la perspective. */
export function perspectiveNodes(w: number, h: number, quad: P[], sub: number): { nodes: P[]; cols: number; rows: number } | null {
  const H = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], quad); if (!H) return null;
  const nodes: P[] = [];
  for (let j = 0; j <= sub; j++) for (let i = 0; i <= sub; i++) nodes.push(applyH(H, (i / sub) * w, (j / sub) * h));
  return { nodes, cols: sub + 1, rows: sub + 1 };
}

// ---------- Warp ----------
function catmull(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const t2 = t * t, t3 = t2 * t, f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}
function sample1D(pts: P[], u: number): P {          // u ∈ [0,1] le long d'une rangée de points de contrôle
  const n = pts.length, s = Math.min(n - 2, Math.max(0, Math.floor(u * (n - 1)))), t = u * (n - 1) - s, g = (i: number): P => pts[Math.max(0, Math.min(n - 1, i))]!;
  return catmull(g(s - 1), g(s), g(s + 1), g(s + 2), t);
}
/** Grille de contrôle n×n (ligne par ligne) → maillage lisse (sub+1)² passant par les points de contrôle (bicubique). */
export function smoothGrid(ctrl: P[], n: number, sub: number): P[] {
  const out: P[] = [];
  for (let j = 0; j <= sub; j++) {
    const v = j / sub, col: P[] = [];
    for (let i = 0; i < n; i++) col.push(sample1D(Array.from({ length: n }, (_, r) => ctrl[r * n + i]!), v));
    for (let i = 0; i <= sub; i++) out.push(sample1D(col, i / sub));
  }
  return out;
}

// ---------- Rendu du maillage ----------
export interface Raster { data: Uint8ClampedArray; w: number; h: number; ox: number; oy: number }

/**
 * Remplit le maillage avec l'image `src` (RGBA non prémultiplié, sw×sh). `nodes` = positions d'arrivée, ligne par ligne ;
 * le nœud (i,j) correspond au point (i/(cols-1)·sw, j/(rows-1)·sh) de l'image. `ss` = suréchantillonnage (2 = bords lissés).
 * Retourne null si le résultat est vide ou démesuré.
 */
export function renderMesh(src: Uint8ClampedArray, sw: number, sh: number, nodes: P[], cols: number, rows: number, ss = 1, maxDim = 4096): Raster | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) { if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return null; x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const ox = Math.floor(x0), oy = Math.floor(y0), W = Math.ceil(x1) - ox, H = Math.ceil(y1) - oy;
  if (W < 1 || H < 1 || W > maxDim || H > maxDim) return null;
  const BW = W * ss, BH = H * ss, hi = new Float32Array(BW * BH * 4);
  // source prémultipliée (le mélange bilinéaire de couleurs non prémultipliées crée des halos)
  const pre = new Float32Array(sw * sh * 4);
  for (let i = 0; i < sw * sh; i++) { const a = src[i * 4 + 3]! / 255; pre[i * 4] = src[i * 4]! * a; pre[i * 4 + 1] = src[i * 4 + 1]! * a; pre[i * 4 + 2] = src[i * 4 + 2]! * a; pre[i * 4 + 3] = src[i * 4 + 3]!; }
  const tex = (u: number, v: number, o: number): void => {          // bilinéaire, bords répétés
    const fx = Math.min(sw - 1, Math.max(0, u - 0.5)), fy = Math.min(sh - 1, Math.max(0, v - 0.5));
    const ix = Math.min(sw - 2 < 0 ? 0 : sw - 2, Math.floor(fx)), iy = Math.min(sh - 2 < 0 ? 0 : sh - 2, Math.floor(fy)), tx = fx - ix, ty = fy - iy;
    const ix2 = Math.min(sw - 1, ix + 1), iy2 = Math.min(sh - 1, iy + 1);
    for (let k = 0; k < 4; k++) {
      const a = pre[(iy * sw + ix) * 4 + k]!, b = pre[(iy * sw + ix2) * 4 + k]!, c = pre[(iy2 * sw + ix) * 4 + k]!, d = pre[(iy2 * sw + ix2) * 4 + k]!;
      hi[o + k] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  };
  const tri = (a: P, b: P, c: P, sa: P, sb: P, sc: P): void => {
    const ax = (a.x - ox) * ss, ay = (a.y - oy) * ss, bx = (b.x - ox) * ss, by = (b.y - oy) * ss, cx = (c.x - ox) * ss, cy = (c.y - oy) * ss;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) return;
    const px0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), px1 = Math.min(BW - 1, Math.ceil(Math.max(ax, bx, cx)));
    const py0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), py1 = Math.min(BH - 1, Math.ceil(Math.max(ay, by, cy)));
    const eps = -1e-4;
    for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
      const X = px + 0.5, Y = py + 0.5;
      const l0 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / den, l1 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / den, l2 = 1 - l0 - l1;
      if (l0 < eps || l1 < eps || l2 < eps) continue;
      tex(l0 * sa.x + l1 * sb.x + l2 * sc.x, l0 * sa.y + l1 * sb.y + l2 * sc.y, (py * BW + px) * 4);
    }
  };
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const n = (ii: number, jj: number): P => nodes[jj * cols + ii]!, s = (ii: number, jj: number): P => ({ x: (ii / (cols - 1)) * sw, y: (jj / (rows - 1)) * sh });
    tri(n(i, j), n(i + 1, j), n(i, j + 1), s(i, j), s(i + 1, j), s(i, j + 1));
    tri(n(i + 1, j), n(i + 1, j + 1), n(i, j + 1), s(i + 1, j), s(i + 1, j + 1), s(i, j + 1));
  }
  // réduction ss×ss puis dé-prémultiplication
  const out = new Uint8ClampedArray(W * H * 4), k2 = ss * ss;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) { const o = ((y * ss + sy) * BW + x * ss + sx) * 4; r += hi[o]!; g += hi[o + 1]!; b += hi[o + 2]!; a += hi[o + 3]!; }
    a /= k2; const o = (y * W + x) * 4;
    if (a > 0.5) { out[o] = ((r / k2) * 255) / a; out[o + 1] = ((g / k2) * 255) / a; out[o + 2] = ((b / k2) * 255) / a; out[o + 3] = a; }   // dé-prémultiplication
  }
  return { data: out, w: W, h: H, ox, oy };
}

// ---------- Poignées et glissés des modes Libre / Proportionnel ----------
export type Handle8 = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l';
export const HANDLES8: Handle8[] = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'];
export function handlePoints(r: Rect): Record<Handle8, P> {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, x1 = r.x + r.w, y1 = r.y + r.h;
  return { tl: { x: r.x, y: r.y }, t: { x: cx, y: r.y }, tr: { x: x1, y: r.y }, r: { x: x1, y: cy }, br: { x: x1, y: y1 }, b: { x: cx, y: y1 }, bl: { x: r.x, y: y1 }, l: { x: r.x, y: cy } };
}
export function hitHandle8(r: Rect, px: number, py: number, tol: number): Handle8 | null {
  const pts = handlePoints(r); let best: Handle8 | null = null, bd = tol;
  for (const k of HANDLES8) { const d = Math.hypot(pts[k].x - px, pts[k].y - py); if (d <= bd) { bd = d; best = k; } }
  return best;
}
/** Redimensionnement LIBRE : chaque bord suit le doigt séparément. */
export function dragFree(r0: Rect, h: Handle8, p: P, min = 2): Rect {
  let x0 = r0.x, x1 = r0.x + r0.w, y0 = r0.y, y1 = r0.y + r0.h;
  if (h.includes('l')) x0 = Math.min(p.x, x1 - min);
  if (h.includes('r')) x1 = Math.max(p.x, x0 + min);
  if (h === 't' || h === 'tl' || h === 'tr') y0 = Math.min(p.y, y1 - min);
  if (h === 'b' || h === 'bl' || h === 'br') y1 = Math.max(p.y, y0 + min);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** Redimensionnement PROPORTIONNEL : le rapport largeur/hauteur est conservé, le côté opposé reste fixe. */
export function dragRatio(r0: Rect, h: Handle8, p: P, min = 2): Rect {
  const left = h.includes('l'), right = h.includes('r'), top = h === 't' || h === 'tl' || h === 'tr', bottom = h === 'b' || h === 'bl' || h === 'br';
  const minS = Math.max(min / r0.w, min / r0.h);
  if ((left || right) && (top || bottom)) {      // coin : le coin opposé est l'ancre
    const ax = left ? r0.x + r0.w : r0.x, ay = top ? r0.y + r0.h : r0.y;
    const s = Math.max(minS, Math.max(Math.abs(p.x - ax) / r0.w, Math.abs(p.y - ay) / r0.h));
    const w = r0.w * s, hh = r0.h * s; return { x: left ? ax - w : ax, y: top ? ay - hh : ay, w, h: hh };
  }
  if (left || right) {                            // bord vertical : ancre = bord opposé, centré verticalement
    const ax = left ? r0.x + r0.w : r0.x, s = Math.max(minS, Math.abs(p.x - ax) / r0.w), w = r0.w * s, hh = r0.h * s, cy = r0.y + r0.h / 2;
    return { x: left ? ax - w : ax, y: cy - hh / 2, w, h: hh };
  }
  const ay = top ? r0.y + r0.h : r0.y, s = Math.max(minS, Math.abs(p.y - ay) / r0.h), w = r0.w * s, hh = r0.h * s, cx = r0.x + r0.w / 2;
  return { x: cx - w / 2, y: top ? ay - hh : ay, w, h: hh };
}
export const rectNodes = (r: Rect): P[] => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }];
export const rectQuad = (r: Rect): P[] => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
/** Grille de contrôle n×n régulière sur un rectangle. */
export function latticeGrid(r: Rect, n: number): P[] {
  const g: P[] = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.push({ x: r.x + (i / (n - 1)) * r.w, y: r.y + (j / (n - 1)) * r.h });
  return g;
}
export function pointInPolygon(poly: P[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
