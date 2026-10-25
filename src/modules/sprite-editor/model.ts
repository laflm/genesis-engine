import type { AssetSpec, GameAdapter } from '../../shared/types';
import { canvasToPng, cloneCanvas, ctxOf, isEmptyCanvas, makeCanvas } from './canvas/pixels';
import type { AssetStatus, ExportItem } from './export/types';

// ===== Modèle : Asset (une clé du jeu) → animations → frames → calques (canvas). =====
export interface Layer { id: number; name: string; visible: boolean; opacity: number; locked: boolean; canvas: HTMLCanvasElement }
export interface Frame { layers: Layer[] }
export interface Asset {
  key: string; spec: AssetSpec;
  /** Taille d'une frame (sheets) ou de l'image (sprites/icônes). */
  w: number; h: number;
  anims: Record<string, Frame[]>;
  /** Image d'origine à plat (référence : comparaison, retour à l'original). */
  original: HTMLCanvasElement | null;
  status: AssetStatus;
}
export const SPRITE_ANIM = '_';

let nextId = 1;
export const bumpLayerId = (n: number): void => { if (n >= nextId) nextId = n + 1; };
export function newLayer(w: number, h: number, name: string, canvas?: HTMLCanvasElement): Layer {
  return { id: nextId++, name, visible: true, opacity: 1, locked: false, canvas: canvas ?? makeCanvas(w, h) };
}
export const newFrame = (w: number, h: number): Frame => ({ layers: [newLayer(w, h, 'Calque 1')] });

export function createAsset(spec: AssetSpec, adapter: GameAdapter, status: AssetStatus, size?: { w: number; h: number }): Asset {
  if (spec.kind === 'sheet') {
    const anims: Record<string, Frame[]> = {};
    for (const [a, d] of Object.entries(adapter.anims)) anims[a] = Array.from({ length: d.frames }, () => newFrame(spec.fw!, spec.fh!));
    return { key: spec.key, spec, w: spec.fw!, h: spec.fh!, anims, original: null, status };
  }
  const s = size ?? spec.recommended ?? { w: 64, h: 64 };
  return { key: spec.key, spec, w: s.w, h: s.h, anims: { [SPRITE_ANIM]: [newFrame(s.w, s.h)] }, original: null, status };
}

export const animNames = (a: Asset): string[] => Object.keys(a.anims);

/** Rectangle d'une frame dans la sheet à plat. */
export function cellRect(a: Asset, adapter: GameAdapter, anim: string, idx: number): { x: number; y: number; w: number; h: number } {
  if (a.spec.kind !== 'sheet') return { x: 0, y: 0, w: a.w, h: a.h };
  const d = adapter.anims[anim]!;
  return { x: idx * a.w, y: d.row * a.h, w: a.w, h: a.h };
}

/** Dessine les calques visibles d'une frame sur `g` (sans copie intermédiaire si alpha = 1). */
export function drawFrame(g: CanvasRenderingContext2D, f: Frame, w: number, h: number, alpha = 1, dx = 0, dy = 0): void {
  if (alpha >= 1) {
    for (const l of f.layers) if (l.visible && l.opacity > 0) { g.globalAlpha = l.opacity; g.drawImage(l.canvas, dx, dy); }
    g.globalAlpha = 1; return;
  }
  const tmp = flattenFrame(f, w, h);
  g.globalAlpha = alpha; g.drawImage(tmp, dx, dy); g.globalAlpha = 1;
}
export function flattenFrame(f: Frame, w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h); drawFrame(ctxOf(c), f, w, h); return c;
}

/** Sheet complète à plat (taille attendue par le jeu). */
export function flattenAsset(a: Asset, adapter: GameAdapter): HTMLCanvasElement {
  if (a.spec.kind !== 'sheet') return flattenFrame(a.anims[SPRITE_ANIM]![0]!, a.w, a.h);
  const out = makeCanvas(adapter.sheetCols * a.w, adapter.sheetRows * a.h);
  const g = ctxOf(out);
  for (const [anim, frames] of Object.entries(a.anims)) frames.forEach((f, i) => { const r = cellRect(a, adapter, anim, i); drawFrame(g, f, a.w, a.h, 1, r.x, r.y); });
  return out;
}

export function emptyAnims(a: Asset): string[] {
  return Object.entries(a.anims).filter(([, fs]) => fs.every((f) => f.layers.every((l) => isEmptyCanvas(l.canvas)))).map(([k]) => k);
}

export async function assetToExportItem(a: Asset, adapter: GameAdapter): Promise<ExportItem> {
  const flat = flattenAsset(a, adapter);
  const png = await canvasToPng(flat);
  const empties = emptyAnims(a);
  return { key: a.key, width: flat.width, height: flat.height, emptyAnims: empties, allEmpty: empties.length === Object.keys(a.anims).length, bytes: png.length, status: a.status, png };
}

export function cloneFrame(f: Frame): Frame {
  return { layers: f.layers.map((l) => ({ ...l, id: nextId++, canvas: cloneCanvas(l.canvas) })) };
}
