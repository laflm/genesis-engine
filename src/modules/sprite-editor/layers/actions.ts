import { bus } from '../../../core/events';
import type { Command } from '../../../core/undo';
import { cloneCanvas, ctxOf, makeCanvas } from '../canvas/pixels';
import { newLayer, type Frame, type Layer, type LayerClip } from '../model';
import { session } from '../session';
import { insertIndexAbove, moveGroup } from './order';

// Toutes les actions sur calques/frames passent par ici : chacune est annulable en UNE étape.
const done = (cmd: Command): void => { session.history.push(cmd); session.touch(); bus.emit('layers:changed'); };

export function commitPixels(layer: Layer, before: ImageData, label = 'Dessin'): void {
  const g = ctxOf(layer.canvas), after = g.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  const put = (d: ImageData): void => { ctxOf(layer.canvas).putImageData(d, 0, 0); session.touch(); };
  session.history.push({ label, undo: () => put(before), redo: () => put(after) });
  session.touch();
}

/** Exécute `mutate` (qui modifie f.layers) et enregistre l'ancien/nouvel ordre pour annuler/rétablir. */
function structural(f: Frame, label: string, mutate: () => void, extra?: { undo?: () => void; redo?: () => void }): void {
  const prev = [...f.layers]; mutate(); const next = [...f.layers];
  done({ label, undo: () => { f.layers = [...prev]; extra?.undo?.(); }, redo: () => { f.layers = [...next]; extra?.redo?.(); } });
}

// ---------- Sélection ----------
/** Clic sur un calque : simple = ce calque seul ; `toggle` = ajoute/retire du groupe ; `range` = plage depuis l'actif. */
export function selectLayer(l: Layer, mode: 'single' | 'toggle' | 'range'): void {
  const f = session.frame; if (!f) return;
  if (mode === 'toggle') {
    if (session.selectedIds.has(l.id) && l !== session.layer) session.selectedIds.delete(l.id);
    else { if (session.layer) session.selectedIds.add(session.layer.id); session.selectedIds.add(l.id); session.layerId = l.id; }
  } else if (mode === 'range' && session.layer) {
    const a = f.layers.indexOf(session.layer), b = f.layers.indexOf(l);
    session.selectedIds = new Set(f.layers.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id));
  } else { session.selectedIds.clear(); session.layerId = l.id; }
  bus.emit('layers:changed'); bus.emit('pixels:changed');
}

// ---------- Création / suppression / ordre ----------
/** Nouveau calque : JUSTE AU-DESSUS du calque actif. */
export function addLayer(): void {
  const f = session.frame, a = session.asset; if (!f || !a) return;
  const l = newLayer(a.w, a.h, `Calque ${f.layers.length + 1}`), at = insertIndexAbove(f.layers, session.layer);
  structural(f, 'Ajouter un calque', () => { f.layers.splice(at, 0, l); });
  session.layerId = l.id; session.selectedIds.clear(); bus.emit('layers:changed');
}
export function deleteLayer(): void {
  const f = session.frame; if (!f) return;
  const sel = new Set(session.selectedLayers);
  if (sel.size >= f.layers.length) { bus.emit('toast', 'Il faut garder au moins un calque'); return; }
  structural(f, 'Supprimer', () => { f.layers = f.layers.filter((l) => !sel.has(l)); });
  session.layerId = null; session.selectedIds.clear(); bus.emit('layers:changed');
}
export function moveLayer(dir: -1 | 1): void {
  const f = session.frame; if (!f) return;
  const next = moveGroup(f.layers, new Set(session.selectedLayers), dir);
  if (next.every((l, i) => l === f.layers[i])) return;
  structural(f, 'Ordre des calques', () => { f.layers = next; });
}

/** Fusionne les calques sélectionnés dans le plus bas d'entre eux ; avec un seul calque : fusion avec celui du dessous. */
export function mergeDown(): void {
  const f = session.frame; if (!f) return;
  let sel = f.layers.filter((l) => session.selectedLayers.includes(l));
  if (sel.length < 2) { const i = f.layers.indexOf(sel[0]!); if (i < 1) return; sel = [f.layers[i - 1]!, sel[0]!]; }
  const target = sel[0]!, rest = sel.slice(1);
  const beforeC = cloneCanvas(target.canvas), g = ctxOf(target.canvas);
  for (const l of rest) { g.globalAlpha = l.opacity; g.globalCompositeOperation = l.blend; g.drawImage(l.canvas, 0, 0); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const afterC = cloneCanvas(target.canvas);
  const set = (src: HTMLCanvasElement): void => { const c = ctxOf(target.canvas); c.clearRect(0, 0, src.width, src.height); c.drawImage(src, 0, 0); };
  structural(f, 'Fusionner', () => { f.layers = f.layers.filter((l) => !rest.includes(l)); },
    { undo: () => set(beforeC), redo: () => set(afterC) });
  session.layerId = target.id; session.selectedIds.clear(); bus.emit('layers:changed');
}

/** Propriété (visibilité, verrou, opacité, mode de fusion, nom) appliquée à un ou plusieurs calques en une étape. */
export function setLayersProp<K extends 'visible' | 'locked' | 'opacity' | 'name' | 'blend'>(ls: Layer[], k: K, v: Layer[K]): void {
  const olds = ls.map((l) => l[k]); if (olds.every((o) => o === v)) return;
  ls.forEach((l) => { l[k] = v; });
  done({ label: 'Propriété du calque', undo: () => ls.forEach((l, i) => { l[k] = olds[i]!; }), redo: () => ls.forEach((l) => { l[k] = v; }) });
}
export const setLayerProp = <K extends 'visible' | 'locked' | 'opacity' | 'name' | 'blend'>(l: Layer, k: K, v: Layer[K]): void => setLayersProp([l], k, v);

// ---------- Copier / coller (calques et frames) ----------
function clipFrom(ls: Layer[]): LayerClip | null {
  const a = session.asset; if (!a || !ls.length) return null;
  return { w: a.w, h: a.h, ax: a.spec.ax, ay: a.spec.ay, layers: ls.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked, blend: l.blend, canvas: cloneCanvas(l.canvas) })) };
}
/** Copie les calques sélectionnés. */
export function copyLayers(): void {
  const c = clipFrom(session.selectedLayers); if (!c) return;
  session.clipboard = c; bus.emit('toast', c.layers.length > 1 ? `${c.layers.length} calques copiés` : 'Calque copié');
}
/** Copie TOUS les calques de la frame. */
export function copyFrame(): void {
  const f = session.frame; const c = f ? clipFrom(f.layers) : null; if (!c) return;
  session.clipboard = c; bus.emit('toast', 'Frame copiée');
}
/**
 * Colle en AJOUTANT les calques copiés au-dessus du calque actif : les calques existants ne sont jamais effacés.
 * Si la taille diffère, le contenu est aligné sur l'ancre (pieds) quand les deux en ont une, sinon centré.
 */
export function pasteLayers(): void {
  const f = session.frame, a = session.asset, c = session.clipboard; if (!f || !a || !c) { bus.emit('toast', 'Rien à coller : copie d\'abord des calques ou une frame'); return; }
  const useAnchor = c.ax !== undefined && c.ay !== undefined && a.spec.ax !== undefined && a.spec.ay !== undefined;
  const dx = Math.round(useAnchor ? a.spec.ax! - c.ax! : (a.w - c.w) / 2), dy = Math.round(useAnchor ? a.spec.ay! - c.ay! : (a.h - c.h) / 2);
  let at = insertIndexAbove(f.layers, session.layer);
  const made = c.layers.map((cl) => {
    const cv = makeCanvas(a.w, a.h); ctxOf(cv).drawImage(cl.canvas, dx, dy);
    const l = newLayer(a.w, a.h, cl.name, cv); l.visible = cl.visible; l.opacity = cl.opacity; l.locked = cl.locked; l.blend = cl.blend; return l;
  });
  structural(f, 'Coller', () => { f.layers.splice(at, 0, ...made); at += made.length; });
  session.selectedIds = new Set(made.map((l) => l.id)); session.layerId = made[made.length - 1]!.id;
  bus.emit('layers:changed');
  if (dx || dy) bus.emit('toast', 'Taille différente : contenu aligné automatiquement');
}
export const pasteFrame = pasteLayers;
/** Duplique les calques sélectionnés juste au-dessus. */
export function duplicateLayers(): void { const keep = session.clipboard; copyLayers(); pasteLayers(); session.clipboard = keep ?? session.clipboard; }

export function clearFrame(): void {
  const f = session.frame, a = session.asset; if (!f || !a) return;
  structural(f, 'Vider la frame', () => { f.layers = [newLayer(a.w, a.h, 'Calque 1')]; });
}
/** Retour à l'original : recopie la frame d'origine (si l'asset a été importé). */
export function revertFrame(getOriginal: () => HTMLCanvasElement | null): void {
  const f = session.frame, a = session.asset, o = getOriginal(); if (!f || !a || !o) return;
  const c = makeCanvas(a.w, a.h); ctxOf(c).drawImage(o, 0, 0);
  structural(f, 'Retour à l\'original', () => { f.layers = [newLayer(a.w, a.h, 'Original', c)]; });
}
