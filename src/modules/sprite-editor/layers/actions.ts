import { bus } from '../../../core/events';
import type { Command } from '../../../core/undo';
import { cloneCanvas, ctxOf, makeCanvas } from '../canvas/pixels';
import { cloneFrame, newLayer, type Frame, type Layer } from '../model';
import { session } from '../session';

// Toutes les actions sur calques/frames passent par ici : chacune est annulable.
const done = (cmd: Command): void => { session.history.push(cmd); session.touch(); bus.emit('layers:changed'); };

export function commitPixels(layer: Layer, before: ImageData, label = 'Dessin'): void {
  const g = ctxOf(layer.canvas), after = g.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  const put = (d: ImageData): void => { ctxOf(layer.canvas).putImageData(d, 0, 0); session.touch(); };
  session.history.push({ label, undo: () => put(before), redo: () => put(after) });
  session.touch();
}

export function addLayer(): void {
  const f = session.frame, a = session.asset; if (!f || !a) return;
  const l = newLayer(a.w, a.h, `Calque ${f.layers.length + 1}`);
  f.layers.push(l); session.layerId = l.id;
  done({ label: 'Ajouter un calque', undo: () => { f.layers.splice(f.layers.indexOf(l), 1); }, redo: () => { f.layers.push(l); } });
}
export function deleteLayer(): void {
  const f = session.frame, l = session.layer; if (!f || !l || f.layers.length < 2) return;
  const i = f.layers.indexOf(l); f.layers.splice(i, 1); session.layerId = null;
  done({ label: 'Supprimer le calque', undo: () => { f.layers.splice(i, 0, l); }, redo: () => { f.layers.splice(f.layers.indexOf(l), 1); } });
}
export function moveLayer(dir: -1 | 1): void {
  const f = session.frame, l = session.layer; if (!f || !l) return;
  const i = f.layers.indexOf(l), j = i + dir; if (j < 0 || j >= f.layers.length) return;
  const swap = (a: number, b: number): void => { const t = f.layers[a]!; f.layers[a] = f.layers[b]!; f.layers[b] = t; };
  swap(i, j); done({ label: 'Ordre des calques', undo: () => swap(j, i), redo: () => swap(i, j) });
}
/** Fusionne le calque actif avec celui du dessous. */
export function mergeDown(): void {
  const f = session.frame, l = session.layer; if (!f || !l) return;
  const i = f.layers.indexOf(l); if (i < 1) return;
  const below = f.layers[i - 1]!;
  const beforeBelow = cloneCanvas(below.canvas);
  const g = ctxOf(below.canvas); g.globalAlpha = l.opacity; g.globalCompositeOperation = l.blend; g.drawImage(l.canvas, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const afterBelow = cloneCanvas(below.canvas);
  f.layers.splice(i, 1); session.layerId = below.id;
  const set = (src: HTMLCanvasElement): void => { const c = ctxOf(below.canvas); c.clearRect(0, 0, src.width, src.height); c.drawImage(src, 0, 0); };
  done({ label: 'Fusionner', undo: () => { set(beforeBelow); f.layers.splice(i, 0, l); }, redo: () => { set(afterBelow); f.layers.splice(f.layers.indexOf(l), 1); } });
}
/** Propriétés (visibilité, verrou, opacité) : annulables aussi. */
export function setLayerProp<K extends 'visible' | 'locked' | 'opacity' | 'name' | 'blend'>(l: Layer, k: K, v: Layer[K]): void {
  const old = l[k]; if (old === v) return; l[k] = v;
  done({ label: 'Propriété du calque', undo: () => { l[k] = old; }, redo: () => { l[k] = v; } });
}

// ---- Frames ----
function replaceFrame(target: Frame, next: Frame, label: string): void {
  const prev = target.layers; target.layers = next.layers;
  done({ label, undo: () => { target.layers = prev; }, redo: () => { target.layers = next.layers; } });
}
export function copyFrame(): void { const f = session.frame; if (f) { session.clipboard = cloneFrame(f); bus.emit('toast', 'Frame copiée'); } }
export function pasteFrame(): void {
  const f = session.frame, c = session.clipboard; if (!f || !c) return;
  const a = session.asset!; if (c.layers[0] && (c.layers[0].canvas.width !== a.w || c.layers[0].canvas.height !== a.h)) { bus.emit('toast', 'Taille de frame différente : collage impossible'); return; }
  replaceFrame(f, cloneFrame(c), 'Coller la frame');
}
export function clearFrame(): void {
  const f = session.frame, a = session.asset; if (!f || !a) return;
  replaceFrame(f, { layers: [newLayer(a.w, a.h, 'Calque 1')] }, 'Vider la frame');
}
/** Retour à l'original : recopie la frame d'origine (si l'asset a été importé). */
export function revertFrame(getOriginal: () => HTMLCanvasElement | null): void {
  const f = session.frame, a = session.asset, o = getOriginal(); if (!f || !a || !o) return;
  const c = makeCanvas(a.w, a.h); ctxOf(c).drawImage(o, 0, 0);
  replaceFrame(f, { layers: [newLayer(a.w, a.h, 'Original', c)] }, 'Retour à l\'original');
}
