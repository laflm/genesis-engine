import { bus } from '../../../core/events';
import { bboxOfAlpha } from '../selection/maskMath';
import { clearSelection, getSelection } from '../selection/selection';
import { ctxOf, makeCanvas } from '../canvas/pixels';
import type { Floating, Layer } from '../model';
import { session } from '../session';

/** Contenu « soulevé » d'un calque (sélection ou calque entier), à transformer/déformer avant de le reposer. */
export interface Lifted { layer: Layer; before: ImageData; float: HTMLCanvasElement; bounds: { x: number; y: number; w: number; h: number } }

/** Retire du calque actif la sélection (ou tout le contenu s'il n'y en a pas) et la renvoie sous forme d'image flottante. */
export function liftContent(): Lifted | null {
  const l = session.layer, a = session.asset;
  if (!l || !a || l.locked) { bus.emit('toast', l?.locked ? 'Calque verrouillé' : 'Aucun calque'); return null; }
  const g = ctxOf(l.canvas), { width: W, height: H } = l.canvas, before = g.getImageData(0, 0, W, H);
  const sel = getSelection(), float = makeCanvas(1, 1);
  let b: { x: number; y: number; w: number; h: number } | null;
  if (sel) {
    b = sel.bounds; float.width = b.w; float.height = b.h;
    const fg = ctxOf(float); fg.drawImage(l.canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    fg.globalCompositeOperation = 'destination-in'; fg.drawImage(sel.mask, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    g.globalCompositeOperation = 'destination-out'; g.drawImage(sel.mask, 0, 0); g.globalCompositeOperation = 'source-over';
  } else {
    b = bboxOfAlpha(before.data, W, H, 1);
    if (!b) { bus.emit('toast', 'Rien à transformer sur ce calque'); return null; }
    float.width = b.w; float.height = b.h; ctxOf(float).drawImage(l.canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    g.clearRect(0, 0, W, H);
  }
  return { layer: l, before, float, bounds: b };
}

/** Repose le contenu (via `paint`) et enregistre UNE commande annulable. */
export function commitLifted(l: Lifted, paint: (g: CanvasRenderingContext2D) => void): void {
  const g = ctxOf(l.layer.canvas), { width: W, height: H } = l.layer.canvas;
  g.save(); paint(g); g.restore();
  const after = g.getImageData(0, 0, W, H), before = l.before, layer = l.layer;
  const put = (d: ImageData): void => { ctxOf(layer.canvas).putImageData(d, 0, 0); session.touch(); };
  session.history.push({ label: 'Transformer', undo: () => put(before), redo: () => put(after) });
  clearSelection(); session.touch();
}
export function cancelLifted(l: Lifted): void { ctxOf(l.layer.canvas).putImageData(l.before, 0, 0); bus.emit('pixels:changed'); }

// ----- Une seule action « flottante » à la fois (Transformer ou Déformer) : la vue et les raccourcis passent par ici. -----
export interface FloatSession { floating(): Floating; overlay(g: CanvasRenderingContext2D, zoom: number): void; apply(): void; cancel(): void }
let cur: FloatSession | null = null;
export const setFloatSession = (s: FloatSession | null): void => { cur = s; bus.emit('pixels:changed'); };
export const getFloating = (): Floating | undefined => cur?.floating();
export const drawFloatOverlay = (g: CanvasRenderingContext2D, zoom: number): void => { cur?.overlay(g, zoom); };
export const isFloating = (): boolean => cur !== null;
export const applyFloating = (): void => { cur?.apply(); };
export const cancelFloating = (): void => { cur?.cancel(); };

// Annuler/rétablir ou changer de frame valide d'abord l'action en cours (rien n'est perdu).
bus.on('history:before', () => { cur?.apply(); });
