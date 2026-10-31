import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { ctxOf, makeCanvas } from '../canvas/pixels';
import { session } from '../session';
import { h } from '../ui/dom';
import { dragFree, dragRatio, handlePoints, hitHandle8, HANDLES8, latticeGrid, perspectiveNodes, pointInPolygon, quadValid, rectNodes, rectQuad, renderMesh, smoothGrid, type Handle8, type P, type Rect } from './deformMath';
import { cancelLifted, commitLifted, liftContent, setFloatSession, type Lifted } from './lift';
import { registerSpriteTool, setActiveTool, type PointerInfo } from './registry';

// Outil Déformer : libre, proportionnel, perspective, warp. Tous les modes passent par le même maillage (deformMath.ts).
type Mode = 'free' | 'ratio' | 'perspective' | 'warp';
const GROUP: Record<Mode, 'rect' | 'quad' | 'grid'> = { free: 'rect', ratio: 'rect', perspective: 'quad', warp: 'grid' };
const MODES: Array<{ id: Mode; label: string; title: string }> = [
  { id: 'free', label: 'Libre', title: 'Redimensionnement libre : chaque bord ou coin se déplace séparément' },
  { id: 'ratio', label: 'Ratio', title: 'Redimensionnement proportionnel : garde le rapport largeur/hauteur' },
  { id: 'perspective', label: 'Perspective', title: 'Perspective : déplace les 4 coins indépendamment' },
  { id: 'warp', label: 'Warp', title: 'Déformation libre : grille de points de contrôle lissée' },
];
type Drag =
  | { kind: 'handle'; h: Handle8; rect0: Rect } | { kind: 'corner'; i: number } | { kind: 'node'; i: number }
  | { kind: 'move'; p0: P; rect0: Rect; quad0: P[]; grid0: P[] };
interface D {
  lifted: Lifted; src: Uint8ClampedArray; sw: number; sh: number; mode: Mode;
  base: Rect; rect: Rect; quad: P[]; grid: P[]; dirty: boolean;
  res: { canvas: HTMLCanvasElement; ox: number; oy: number } | null; drag: Drag | null;
}
let d: D | null = null;
let refreshUI: (() => void) | null = null;
const N = CONFIG.deform.warpGrid;

function nodes(s: D): { nodes: P[]; cols: number; rows: number } | null {
  switch (GROUP[s.mode]) {
    case 'rect': return { nodes: rectNodes(s.rect), cols: 2, rows: 2 };
    case 'quad': return perspectiveNodes(s.sw, s.sh, s.quad, CONFIG.deform.perspectiveSub);
    default: { const sub = CONFIG.deform.warpSub; return { nodes: smoothGrid(s.grid, N, sub), cols: sub + 1, rows: sub + 1 }; }
  }
}
/** Recalcule l'image déformée. ss = 1 pendant le glissé (rapide), 2 au relâchement (bords lissés). */
function refresh(ss: number): void {
  if (!d) return;
  const m = nodes(d); if (!m) return;
  const r = renderMesh(d.src, d.sw, d.sh, m.nodes, m.cols, m.rows, ss); if (!r) return;   // résultat invalide : on garde le dernier bon
  const c = makeCanvas(r.w, r.h); ctxOf(c).putImageData(new ImageData(r.data as unknown as Uint8ClampedArray<ArrayBuffer>, r.w, r.h), 0, 0);
  d.res = { canvas: c, ox: r.ox, oy: r.oy }; bus.emit('pixels:changed');
}
/** « Cuit » la déformation actuelle dans l'image source pour pouvoir enchaîner un autre mode par-dessus. */
function bake(): void {
  if (!d || !d.dirty) return;
  const m = nodes(d); if (!m) return;
  const r = renderMesh(d.src, d.sw, d.sh, m.nodes, m.cols, m.rows, 2); if (!r) return;
  d.src = r.data; d.sw = r.w; d.sh = r.h; d.base = { x: r.ox, y: r.oy, w: r.w, h: r.h };
  resetParams(d); refresh(1);
}
function resetParams(s: D): void { s.rect = { ...s.base }; s.quad = rectQuad(s.base); s.grid = latticeGrid(s.base, N); s.dirty = false; }
function setMode(m: Mode): void {
  if (!d) return;
  if (GROUP[m] !== GROUP[d.mode]) bake();
  d.mode = m; bus.emit('pixels:changed'); refreshUI?.();
}

function begin(): boolean {
  const lifted = liftContent(); if (!lifted) return false;
  const b = lifted.bounds, src = ctxOf(lifted.float).getImageData(0, 0, b.w, b.h).data;
  d = { lifted, src, sw: b.w, sh: b.h, mode: d?.mode ?? 'free', base: { ...b }, rect: { ...b }, quad: rectQuad(b), grid: latticeGrid(b, N), dirty: false, res: null, drag: null };
  refresh(1);
  setFloatSession({
    floating: () => ({ layer: d!.lifted.layer, draw: (g) => { const r = d!.res; if (r) { g.imageSmoothingEnabled = false; g.drawImage(r.canvas, r.ox, r.oy); } } }),
    overlay, apply: () => finish(true), cancel: () => finish(false),
  });
  return true;
}
function commit(): void {
  const s = d; if (!s) return; refresh(2); d = null; setFloatSession(null);
  const r = s.res; commitLifted(s.lifted, (g) => { if (r) g.drawImage(r.canvas, r.ox, r.oy); }); refreshUI?.();
}
function cancel(): void { const s = d; if (!s) return; d = null; setFloatSession(null); cancelLifted(s.lifted); refreshUI?.(); }
function finish(apply: boolean): void {
  const mode = d?.mode;
  if (apply) commit(); else cancel();
  if (mode) lastMode = mode;
  setActiveTool(session.previousToolId === 'deform' ? 'select' : session.previousToolId);
}
let lastMode: Mode = 'free';

function overlay(g: CanvasRenderingContext2D, zoom: number): void {
  if (!d) return;
  const r = 7 / zoom; g.save(); g.lineWidth = 1.5 / zoom; g.strokeStyle = '#4da3ff'; g.fillStyle = '#fff';
  const dot = (p: P, square = false): void => { g.beginPath(); if (square) g.rect(p.x - r, p.y - r, 2 * r, 2 * r); else g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); g.stroke(); };
  const grp = GROUP[d.mode];
  if (grp === 'rect') { g.strokeRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h); const pts = handlePoints(d.rect); for (const k of HANDLES8) dot(pts[k], d.mode === 'ratio'); }
  else if (grp === 'quad') { g.beginPath(); d.quad.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke(); d.quad.forEach((p) => dot(p)); }
  else {
    g.globalAlpha = 0.7; g.beginPath();
    for (let j = 0; j < N; j++) { g.moveTo(d.grid[j * N]!.x, d.grid[j * N]!.y); for (let i = 1; i < N; i++) g.lineTo(d.grid[j * N + i]!.x, d.grid[j * N + i]!.y); }
    for (let i = 0; i < N; i++) { g.moveTo(d.grid[i]!.x, d.grid[i]!.y); for (let j = 1; j < N; j++) g.lineTo(d.grid[j * N + i]!.x, d.grid[j * N + i]!.y); }
    g.stroke(); g.globalAlpha = 1; d.grid.forEach((p) => dot(p));
  }
  g.restore();
}

const nearest = (pts: P[], p: P, tol: number): number => { let bi = -1, bd = tol; pts.forEach((q, i) => { const dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd <= bd) { bd = dd; bi = i; } }); return bi; };
const bboxOf = (pts: P[]): Rect => { const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };

registerSpriteTool({
  id: 'deform', label: 'Déformer (libre, ratio, perspective, warp)', icon: '◭', shortcut: 'D', hideBrushSettings: true,
  activate() { if (!d && !begin()) { setActiveTool(session.previousToolId === 'deform' ? 'select' : session.previousToolId); return; } d!.mode = lastMode; refreshUI?.(); },
  deactivate() { if (d) { lastMode = d.mode; commit(); } },
  down(p: PointerInfo) {
    if (!d) return;
    const tol = CONFIG.transform.handlePx / session.view.zoom, q = { x: p.x, y: p.y }, grp = GROUP[d.mode];
    const move = (): Drag => ({ kind: 'move', p0: q, rect0: { ...d!.rect }, quad0: d!.quad.map((x) => ({ ...x })), grid0: d!.grid.map((x) => ({ ...x })) });
    if (grp === 'rect') { const hh = hitHandle8(d.rect, p.x, p.y, tol); d.drag = hh ? { kind: 'handle', h: hh, rect0: { ...d.rect } } : pointInPolygon(rectQuad(d.rect), p.x, p.y) ? move() : null; }
    else if (grp === 'quad') { const i = nearest(d.quad, q, tol); d.drag = i >= 0 ? { kind: 'corner', i } : pointInPolygon(d.quad, p.x, p.y) ? move() : null; }
    else { const i = nearest(d.grid, q, tol); const b = bboxOf(d.grid); d.drag = i >= 0 ? { kind: 'node', i } : pointInPolygon(rectQuad(b), p.x, p.y) ? move() : null; }
  },
  move(p: PointerInfo) {
    if (!d?.drag) return;
    const q = { x: p.x, y: p.y }, dr = d.drag, min = CONFIG.deform.minSizePx;
    if (dr.kind === 'handle') d.rect = d.mode === 'ratio' ? dragRatio(dr.rect0, dr.h, q, min) : dragFree(dr.rect0, dr.h, q, min);
    else if (dr.kind === 'corner') { const nq = d.quad.map((x, i) => (i === dr.i ? q : x)); if (quadValid(nq)) d.quad = nq; else return; }
    else if (dr.kind === 'node') d.grid = d.grid.map((x, i) => (i === dr.i ? q : x));
    else { const dx = q.x - dr.p0.x, dy = q.y - dr.p0.y; d.rect = { ...dr.rect0, x: dr.rect0.x + dx, y: dr.rect0.y + dy }; d.quad = dr.quad0.map((x) => ({ x: x.x + dx, y: x.y + dy })); d.grid = dr.grid0.map((x) => ({ x: x.x + dx, y: x.y + dy })); }
    d.dirty = true; refresh(1);
  },
  up() { if (d?.drag) { d.drag = null; refresh(2); } },
  cancel() { if (d?.drag) { d.drag = null; refresh(2); } },
  options(host) {
    const modeBtns = MODES.map((m) => h('button', { class: 'btn small', 'aria-label': m.label, title: m.title, 'data-mode': m.id, onclick: () => setMode(m.id) }, m.label));
    refreshUI = () => modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === d?.mode));
    const b = (label: string, fn: () => void, title: string, cls = '') => h('button', { class: `btn small ${cls}`, title, onclick: fn }, label);
    host.append(...modeBtns, b('↺ Réinit.', () => { if (d) { d.src = ctxOf(d.lifted.float).getImageData(0, 0, d.lifted.bounds.w, d.lifted.bounds.h).data; d.sw = d.lifted.bounds.w; d.sh = d.lifted.bounds.h; d.base = { ...d.lifted.bounds }; resetParams(d); refresh(2); } }, 'Annuler toute la déformation (sans quitter l\'outil)'),
      b('✓ Appliquer', () => finish(true), 'Valider (Entrée)', 'primary'), b('✕ Annuler', () => finish(false), 'Annuler (Échap)'));
    refreshUI();
  },
});
bus.on('frame:changed', () => { if (d) commit(); });
bus.on('asset:selected', () => { d = null; setFloatSession(null); });
