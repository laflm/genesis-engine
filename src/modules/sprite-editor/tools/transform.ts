import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { session } from '../session';
import { h } from '../ui/dom';
import { cancelLifted, commitLifted, liftContent, setFloatSession, type Lifted } from './lift';
import { registerSpriteTool, setActiveTool, type PointerInfo } from './registry';
import { angleFromDrag, corners, hitTest, rotateHandle, scaleFromDrag, type HitKind, type Pt, type TF } from './transformMath';

let act: { lifted: Lifted; tf: TF } | null = null;
let drag: { kind: Exclude<HitKind, null>; p0: Pt; tf0: TF } | null = null;
let syncUI: (() => void) | null = null;
const redraw = (): void => { bus.emit('pixels:changed'); syncUI?.(); };

function paintFloat(g: CanvasRenderingContext2D, lifted: Lifted, tf: TF): void {
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.translate(tf.cx, tf.cy); g.rotate(tf.angle); g.scale(tf.scale * (tf.flipX ? -1 : 1), tf.scale * (tf.flipY ? -1 : 1));
  g.drawImage(lifted.float, -tf.w / 2, -tf.h / 2);
}
function overlay(g: CanvasRenderingContext2D, zoom: number): void {
  if (!act) return;
  const tf = act.tf, c = corners(tf), r = rotateHandle(tf, CONFIG.transform.rotateOffsetPx / zoom), top = { x: (c[0]!.x + c[1]!.x) / 2, y: (c[0]!.y + c[1]!.y) / 2 };
  g.save(); g.lineWidth = 1.5 / zoom; g.strokeStyle = '#4da3ff'; g.fillStyle = '#fff';
  g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(r.x, r.y); g.stroke();
  for (const p of [...c, r]) { g.beginPath(); g.arc(p.x, p.y, 7 / zoom, 0, Math.PI * 2); g.fill(); g.stroke(); }
  g.restore();
}

/** Soulève le contenu et démarre la transformation. */
function begin(): boolean {
  const lifted = liftContent(); if (!lifted) return false;
  const b = lifted.bounds;
  act = { lifted, tf: { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, scale: 1, angle: 0, flipX: false, flipY: false } };
  setFloatSession({
    floating: () => ({ layer: act!.lifted.layer, draw: (g) => { g.save(); paintFloat(g, act!.lifted, act!.tf); g.restore(); } }),
    overlay, apply: () => finish(true), cancel: () => finish(false),
  });
  return true;
}
export function commitTransform(): void {
  const a = act; if (!a) return; act = null; drag = null; setFloatSession(null);
  commitLifted(a.lifted, (g) => paintFloat(g, a.lifted, a.tf)); syncUI?.();
}
export function cancelTransform(): void {
  const a = act; if (!a) return; act = null; drag = null; setFloatSession(null); cancelLifted(a.lifted); syncUI?.();
}
/** Termine proprement et revient à l'outil précédent. */
function finish(apply: boolean): void {
  if (apply) commitTransform(); else cancelTransform();
  setActiveTool(session.previousToolId === 'transform' ? 'select' : session.previousToolId);
}

registerSpriteTool({
  id: 'transform', label: 'Transformer', icon: '⟳', shortcut: 'T', hideBrushSettings: true,
  activate() { if (!act && !begin()) { setActiveTool(session.previousToolId === 'transform' ? 'select' : session.previousToolId); return; } redraw(); },
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

// Changer de frame valide la transformation pour ne rien perdre.
bus.on('frame:changed', () => commitTransform());
bus.on('asset:selected', () => { act = null; drag = null; setFloatSession(null); });
