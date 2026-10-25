import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { pickColor } from '../tools/pipette';
import { getSpriteTool, type PointerInfo } from '../tools';
import { session } from '../session';
import type { CanvasView } from './view';

interface Pt { x: number; y: number; type: string; t0: number; x0: number; y0: number }

/**
 * Gestes : Pencil/souris = outil ; deux doigts = pan + pincer ; tap 2 doigts = annuler ; tap 3 doigts = rétablir ;
 * appui long = pipette ; palm rejection (les doigts sont ignorés pour dessiner tant que le Pencil est actif).
 */
export function attachInput(view: CanvasView): void {
  const el = view.el;
  el.style.touchAction = 'none';
  const pts = new Map<number, Pt>();
  let drawingId: number | null = null;
  let penSeenAt = -1e9;
  let gestureStart = 0, gestureMax = 0, gestureMoved = 0;
  let pinch: { d: number; cx: number; cy: number } | null = null;
  let longTimer = 0;
  let spaceDown = false;
  let panning: { x: number; y: number } | null = null;

  const local = (e: PointerEvent): { sx: number; sy: number } => { const r = el.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  const info = (e: PointerEvent): PointerInfo => { const { sx, sy } = local(e); const p = view.toFrame(sx, sy); return { ...p, pressure: e.pressure || 0.5, tiltX: e.tiltX, tiltY: e.tiltY, pointerType: e.pointerType }; };
  const tool = () => getSpriteTool(session.toolId);
  const touchPts = (): Pt[] => [...pts.values()].filter((p) => p.type === 'touch');
  const cancelDraw = (): void => { clearTimeout(longTimer); if (drawingId !== null) { tool()?.cancel(); drawingId = null; } };
  const mayDraw = (e: PointerEvent): boolean =>
    e.pointerType !== 'touch' || (CONFIG.gestures.touchDrawsWithoutPen && performance.now() - penSeenAt > CONFIG.gestures.penRejectPalmMs);

  el.addEventListener('pointerdown', (e) => {
    try { el.setPointerCapture(e.pointerId); } catch { /* événement synthétique */ }
    const { sx, sy } = local(e);
    pts.set(e.pointerId, { x: sx, y: sy, type: e.pointerType, t0: performance.now(), x0: sx, y0: sy });
    if (e.pointerType === 'pen') { penSeenAt = performance.now(); if (touchPts().length) { /* paume : on ignore les doigts */ } }
    if (e.pointerType === 'mouse' && (spaceDown || e.button === 1)) { panning = { x: sx, y: sy }; return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const nTouch = touchPts().length;
    if (nTouch >= 2) {
      cancelDraw();
      if (nTouch === 2) { gestureStart = performance.now(); gestureMax = 2; gestureMoved = 0; }
      gestureMax = Math.max(gestureMax, nTouch);
      const [a, b] = touchPts() as [Pt, Pt]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    if (!mayDraw(e)) return;
    drawingId = e.pointerId;
    tool()?.down(info(e));
    // Appui long immobile : pipette (le trait provisoire est annulé).
    if (session.toolId === 'brush' || session.toolId === 'eraser') {
      longTimer = window.setTimeout(() => {
        const p = pts.get(e.pointerId); if (!p || drawingId !== e.pointerId) return;
        if (Math.hypot(p.x - p.x0, p.y - p.y0) > CONFIG.brush.longPressMovePx) return;
        cancelDraw();
        const pi = info(e); if (pickColor(pi)) bus.emit('toast', `Couleur ${session.color}`);
      }, CONFIG.brush.longPressMs);
    }
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const { sx, sy } = local(e);
    const dx = sx - p.x, dy = sy - p.y;
    p.x = sx; p.y = sy;
    if (panning) { view.panBy(dx, dy); return; }
    const touches = touchPts();
    if (touches.length >= 2 && e.pointerType === 'touch') {
      const [a, b] = touches as [Pt, Pt], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (pinch) { view.zoomAt(cx, cy, d / pinch.d); view.panBy(cx - pinch.cx, cy - pinch.cy); gestureMoved += Math.abs(dx) + Math.abs(dy); }
      pinch = { d, cx, cy }; return;
    }
    if (drawingId === e.pointerId) {
      if (Math.hypot(sx - p.x0, sy - p.y0) > CONFIG.brush.longPressMovePx) clearTimeout(longTimer);
      const evs = e.getCoalescedEvents?.() ?? [];
      for (const ce of evs.length ? evs : [e]) tool()?.move(info(ce));
    }
  });

  const end = (e: PointerEvent): void => {
    const p = pts.get(e.pointerId); if (!p) return;
    const wasTouch = e.pointerType === 'touch';
    if (panning) { panning = null; pts.delete(e.pointerId); return; }
    if (drawingId === e.pointerId) { clearTimeout(longTimer); if (e.type === 'pointercancel') tool()?.cancel(); else tool()?.up(info(e)); drawingId = null; }
    pts.delete(e.pointerId);
    if (wasTouch && gestureMax >= 2 && touchPts().length === 0) {
      const quick = performance.now() - gestureStart < CONFIG.gestures.tapMaxMs && gestureMoved < CONFIG.gestures.tapMaxMovePx;
      if (quick) { if (gestureMax === 2) session.undo(); else if (gestureMax === 3) session.redo(); bus.emit('pixels:changed'); }
      gestureMax = 0; pinch = null;
    }
    if (touchPts().length < 2) pinch = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { sx, sy } = local(e as unknown as PointerEvent);
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0 && !e.shiftKey && e.deltaMode === 0 && !e.deltaX) view.zoomAt(sx, sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    else view.panBy(-e.deltaX, -e.deltaY);
  }, { passive: false });

  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) { spaceDown = true; e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
  // Safari iPad : pas de zoom de page involontaire.
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
}
