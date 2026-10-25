import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { bboxOfAlpha } from '../selection/maskMath';
import { clearSelection, getSelection } from '../selection/selection';
import { cloneCanvas, ctxOf, makeCanvas } from '../canvas/pixels';
import type { Floating, Layer } from '../model';
import { session } from '../session';
import { h } from '../ui/dom';
import { registerSpriteTool, setActiveTool, type PointerInfo } from './registry';
import { angleFromDrag, corners, hitTest, rotateHandle, scaleFromDrag, type HitKind, type Pt, type TF } from './transformMath';

interface Active { layer: Layer; before: ImageData; float: HTMLCanvasElement; tf: TF }
let act: Active | null = null;
let drag: { kind: Exclude<HitKind, null>; p0: Pt; tf0: TF } | null = null;
let syncUI: (() => void) | null = null;

const redraw = (): void => { bus.emit('pixels:changed'); syncUI?.(); };

/** Soulève le contenu (sélection, ou tout le calque) dans une image flottante modifiable. */
function lift(): boolean {
  const l = session.layer, a = session.asset;
  if (!l || !a || l.locked) { bus.emit('toast', l?.locked ? 'Calque verrouillé' : 'Aucun calque'); return false; }
  const g = ctxOf(l.canvas), { width: W, height: H } = l.canvas, before = g.getImageData(0, 0, W, H);
  const sel = getSelection();
  let b: { x: number; y: number; w: number; h: number } | null;
  const float: HTMLCanvasElement = makeCanvas(1, 1);
  if (sel) {
    b = sel.bounds;
    float.width = b.w; float.height = b.h;
    const fg = ctxOf(float); fg.drawImage(l.canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    fg.globalCompositeOperation = 'destination-in'; fg.drawImage(sel.mask, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    g.globalCompositeOperation = 'destination-out'; g.drawImage(sel.mask, 0, 0); g.globalCompositeOperation = 'source-over';
  } else {
    b = bboxOfAlpha(before.data, W, H, 1);
    if (!b) { bus.emit('toast', 'Rien à transformer sur ce calque'); return false; }
    float.width = b.w; float.height = b.h;
    ctxOf(float).drawImage(l.canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    g.clearRect(0, 0, W, H);
  }
  act = { layer: l, before, float, tf: { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, scale: 1, angle: 0, flipX: false, flipY: false } };
  return true;
}

function paintFloat(g: CanvasRenderingContext2D, a: Active): void {
  const { tf } = a;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.translate(tf.cx, tf.cy); g.rotate(tf.angle); g.scale(tf.scale * (tf.flipX ? -1 : 1), tf.scale * (tf.flipY ? -1 : 1));
  g.drawImage(a.float, -tf.w / 2, -tf.h / 2);
}

/** Pour la vue : image flottante à insérer juste après son calque. */
export function floatingFor(): Floating | undefined {
  const a = act; return a ? { layer: a.layer, draw: (g) => { g.save(); paintFloat(g, a); g.restore(); } } : undefined;
}
export const isTransforming = (): boolean => act !== null;

/** Poignées (coins, rotation) et cadre de la transformation en cours. */
export function drawTransformOverlay(g: CanvasRenderingContext2D, zoom: number): void {
  if (!act) return;
  const tf = act.tf, c = corners(tf), r = rotateHandle(tf, CONFIG.transform.rotateOffsetPx / zoom), top = { x: (c[0]!.x + c[1]!.x) / 2, y: (c[0]!.y + c[1]!.y) / 2 };
  g.save(); g.lineWidth = 1.5 / zoom; g.strokeStyle = '#4da3ff'; g.fillStyle = '#fff';
  g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(r.x, r.y); g.stroke();
  for (const p of [...c, r]) { g.beginPath(); g.arc(p.x, p.y, 7 / zoom, 0, Math.PI * 2); g.fill(); g.stroke(); }
  g.restore();
}

/** Valide : dessine l'image flottante sur le calque et enregistre UNE commande annulable. */
export function commitTransform(): void {
  const a = act; if (!a) return; act = null; drag = null;
  const g = ctxOf(a.layer.canvas), { width: W, height: H } = a.layer.canvas;
  g.save(); paintFloat(g, a); g.restore();
  const after = g.getImageData(0, 0, W, H), before = a.before, layer = a.layer;
  const put = (d: ImageData): void => { ctxOf(layer.canvas).putImageData(d, 0, 0); session.touch(); };
  session.history.push({ label: 'Transformer', undo: () => put(before), redo: () => put(after) });
  clearSelection(); session.touch(); syncUI?.();
}
export function cancelTransform(): void {
  const a = act; if (!a) return; act = null; drag = null;
  ctxOf(a.layer.canvas).putImageData(a.before, 0, 0); bus.emit('pixels:changed'); syncUI?.();
}
/** Termine proprement et revient à l'outil précédent. */
function finish(apply: boolean): void {
  if (apply) commitTransform(); else cancelTransform();
  setActiveTool(session.previousToolId === 'transform' ? 'select' : session.previousToolId);
}
export const applyTransformKey = (): void => { if (act) finish(true); };
export const cancelTransformKey = (): void => { if (act) finish(false); };

registerSpriteTool({
  id: 'transform', label: 'Transformer', icon: '⟳', shortcut: 'T',
  activate() { if (!act && !lift()) { setActiveTool(session.previousToolId === 'transform' ? 'select' : session.previousToolId); return; } redraw(); },
  deactivate() { commitTransform(); },
  down(p: PointerInfo) {
    if (!act) return;
    const z = session.view.zoom, kind = hitTest(act.tf, p.x, p.y, CONFIG.transform.handlePx / z, CONFIG.transform.rotateOffsetPx / z);
    if (kind) drag = { kind, p0: { x: p.x, y: p.y }, tf0: { ...act.tf } };
  },
  move(p: PointerInfo) {
    if (!act || !drag) return;
    const { tf0, p0 } = drag, c = { x: tf0.cx, y: tf0.cy }, q = { x: p.x, y: p.y };
    if (drag.kind === 'move') { act.tf.cx = tf0.cx + (q.x - p0.x); act.tf.cy = tf0.cy + (q.y - p0.y); }
    else if (drag.kind === 'rotate') act.tf.angle = angleFromDrag(tf0.angle, c, p0, q);
    else act.tf.scale = scaleFromDrag(tf0.scale, c, p0, q, CONFIG.transform.minScale, CONFIG.transform.maxScale);
    redraw();
  },
  up() { drag = null; },
  cancel() { if (act && drag) { act.tf = { ...drag.tf0 }; drag = null; redraw(); } },
  options(host) {
    const deg = h('input', { type: 'range', min: -180, max: 180, step: 1, value: 0, 'aria-label': 'Rotation (degrés)' });
    const degLbl = h('span', { class: 'val' }, '0°');
    const sc = h('input', { type: 'range', min: 10, max: 400, step: 1, value: 100, 'aria-label': 'Échelle (%)' });
    const scLbl = h('span', { class: 'val' }, '100 %');
    const norm = (r: number): number => { let d = (r * 180) / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360; return Math.round(d); };
    syncUI = () => { const t = act?.tf; deg.value = String(t ? norm(t.angle) : 0); degLbl.textContent = `${deg.value}°`; sc.value = String(t ? Math.round(t.scale * 100) : 100); scLbl.textContent = `${sc.value} %`; };
    deg.addEventListener('input', () => { if (act) { act.tf.angle = (Number(deg.value) * Math.PI) / 180; degLbl.textContent = `${deg.value}°`; bus.emit('pixels:changed'); } });
    sc.addEventListener('input', () => { if (act) { act.tf.scale = Math.max(CONFIG.transform.minScale, Number(sc.value) / 100); scLbl.textContent = `${sc.value} %`; bus.emit('pixels:changed'); } });
    const step = (d: number): void => { if (act) { act.tf.angle += (d * Math.PI) / 180; redraw(); } };
    const b = (label: string, fn: () => void, title: string, cls = '') => h('button', { class: `btn small ${cls}`, title, onclick: fn }, label);
    host.append(h('label', {}, 'Rotation ', deg, degLbl), b('−15°', () => step(-CONFIG.transform.stepDeg), 'Pivoter de −15°'), b('+15°', () => step(CONFIG.transform.stepDeg), 'Pivoter de +15°'),
      h('label', {}, 'Échelle ', sc, scLbl),
      b('⇋', () => { if (act) { act.tf.flipX = !act.tf.flipX; redraw(); } }, 'Miroir horizontal'), b('⇅', () => { if (act) { act.tf.flipY = !act.tf.flipY; redraw(); } }, 'Miroir vertical'),
      b('✓ Appliquer', () => finish(true), 'Valider (Entrée)', 'primary'), b('✕ Annuler', () => finish(false), 'Annuler la transformation (Échap)'));
    syncUI();
  },
});

// Tout changement de contexte valide la transformation pour ne rien perdre.
bus.on('frame:changed', () => commitTransform());
bus.on('asset:selected', () => { act = null; drag = null; });
export const transformReset = (): void => { act = null; drag = null; };
void cloneCanvas;
