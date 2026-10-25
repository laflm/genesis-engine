import { bus } from '../../../core/events';
import { ctxOf, makeCanvas } from '../canvas/pixels';
import { bboxOfAlpha, restoreOutsideData } from './maskMath';

export type PathFn = (g: CanvasRenderingContext2D) => void;
/** Sélection : masque (alpha) de la taille de la frame + contours pour l'affichage (« fourmis »). */
export interface Selection {
  mask: HTMLCanvasElement;
  data: Uint8ClampedArray;
  bounds: { x: number; y: number; w: number; h: number };
  paths: PathFn[];
}

let current: Selection | null = null;
let preview: PathFn | null = null;
export const getSelection = (): Selection | null => current;
export const setPreview = (p: PathFn | null): void => { preview = p; bus.emit('selection:changed'); };

export function clearSelection(): void { if (current || preview) { current = null; preview = null; bus.emit('selection:changed'); } }

/** Construit une sélection en remplissant `fill` (forme) sur un masque w×h. Retourne null si la zone est vide. */
export function makeSelection(w: number, h: number, fill: PathFn): Selection | null {
  const mask = makeCanvas(w, h), g = ctxOf(mask);
  g.fillStyle = '#fff'; g.beginPath(); fill(g); g.fill();
  const data = g.getImageData(0, 0, w, h).data, bounds = bboxOfAlpha(data, w, h);
  return bounds ? { mask, data, bounds, paths: [fill] } : null;
}
export function setSelection(s: Selection | null): void { current = s; preview = null; bus.emit('selection:changed'); }

export function selectAll(w: number, h: number): void { setSelection(makeSelection(w, h, (g) => g.rect(0, 0, w, h))); }
export function invertSelection(w: number, h: number): void {
  if (!current) { selectAll(w, h); return; }
  const mask = makeCanvas(w, h), g = ctxOf(mask);
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-out'; g.drawImage(current.mask, 0, 0);
  const data = g.getImageData(0, 0, w, h).data, bounds = bboxOfAlpha(data, w, h);
  setSelection(bounds ? { mask, data, bounds, paths: [(c) => c.rect(0, 0, w, h), ...current.paths] } : null);
}

/** À appeler après toute modification d'un calque : les pixels hors sélection reprennent leur valeur d'avant. */
export function restoreOutside(canvas: HTMLCanvasElement, before: ImageData): void {
  if (!current) return;
  const g = ctxOf(canvas), cur = g.getImageData(0, 0, canvas.width, canvas.height);
  if (restoreOutsideData(before.data, cur.data, current.data)) g.putImageData(cur, 0, 0);
}

/** Contour animé (blanc + noir pointillé) de la sélection et de l'aperçu en cours de tracé. */
export function drawSelectionOverlay(g: CanvasRenderingContext2D, zoom: number, t: number, speed: number): void {
  const paths = [...(current?.paths ?? []), ...(preview ? [preview] : [])];
  if (!paths.length) return;
  g.save(); g.lineWidth = 1.5 / zoom;
  for (const p of paths) { g.beginPath(); p(g); g.setLineDash([]); g.strokeStyle = '#fff'; g.stroke(); g.setLineDash([4 / zoom, 4 / zoom]); g.lineDashOffset = -((t / 1000) * speed) / zoom; g.strokeStyle = '#000'; g.stroke(); }
  g.restore();
}
export const hasSelectionVisual = (): boolean => !!current || !!preview;

bus.on('asset:selected', clearSelection);
