import type { AssetSpec, GameAdapter } from '../../../shared/types';
import { cloneCanvas, ctxOf, makeCanvas } from '../canvas/pixels';
import { cellRect, createAsset, newLayer, SPRITE_ANIM, type Asset, type Frame } from '../model';
import { expectedSheetSize, type FitMode } from './fitPlan';
import { detectBackground, removeBackground, type RGB } from './bgremove';

export interface FitOptions { mode: FitMode; smooth: boolean; singleTarget?: { anim: string; index: number } }
export interface BgOptions { enabled: boolean; color: RGB; tolerance: number; contiguous: boolean }

/** Applique la suppression de fond sur une COPIE du canvas. */
export function applyBackground(src: HTMLCanvasElement, bg: BgOptions): HTMLCanvasElement {
  const out = cloneCanvas(src);
  if (!bg.enabled) return out;
  const g = ctxOf(out), id = g.getImageData(0, 0, out.width, out.height);
  removeBackground(id.data, out.width, out.height, bg.color, bg.tolerance, bg.contiguous);
  g.putImageData(id, 0, 0);
  return out;
}
export function suggestBackground(src: HTMLCanvasElement): RGB | null {
  const id = ctxOf(src).getImageData(0, 0, src.width, src.height);
  return detectBackground(id.data, src.width, src.height);
}

/** Transforme l'image importée en sheet de la taille exacte attendue par le jeu. */
export function renderSheetFit(src: HTMLCanvasElement, spec: AssetSpec, adapter: GameAdapter, o: FitOptions): { canvas: HTMLCanvasElement; notes: string[] } {
  const { w: W, h: H } = expectedSheetSize(spec, adapter);
  const fw = spec.fw!, fh = spec.fh!, ax = spec.ax!, ay = spec.ay!;
  const out = makeCanvas(W, H), g = ctxOf(out);
  g.imageSmoothingEnabled = o.smooth; g.imageSmoothingQuality = 'high';
  const notes: string[] = [];
  const clipCell = (x: number, y: number): void => { g.beginPath(); g.rect(x, y, fw, fh); g.clip(); };
  switch (o.mode) {
    case 'exact': g.drawImage(src, 0, 0); break;
    case 'scale': g.drawImage(src, 0, 0, W, H); notes.push(`mise à l'échelle ${src.width}×${src.height} → ${W}×${H}`); break;
    case 'reslice': {
      const cols = Math.floor(src.width / fw), rows = Math.floor(src.height / fh);
      let missing = 0;
      for (const d of Object.values(adapter.anims)) for (let i = 0; i < d.frames; i++) {
        if (d.row < rows && i < cols) g.drawImage(src, i * fw, d.row * fh, fw, fh, i * fw, d.row * fh, fw, fh); else missing++;
      }
      notes.push(`redécoupage ${cols}×${rows} frames`);
      if (missing) notes.push(`${missing} frame(s) absente(s) de l'image (laissées vides)`);
      break;
    }
    case 'crop-pad': {
      const cw = Math.floor(src.width / adapter.sheetCols), ch = Math.floor(src.height / adapter.sheetRows);
      const sax = cw / 2, say = ch - (fh - ay); // ancre supposée : milieu, même marge basse que dans le jeu
      for (const d of Object.values(adapter.anims)) for (let i = 0; i < d.frames; i++) {
        g.save(); clipCell(i * fw, d.row * fh);
        g.drawImage(src, i * cw, d.row * ch, cw, ch, i * fw + ax - sax, d.row * fh + ay - say, cw, ch);
        g.restore();
      }
      notes.push(`recadrage de cellules ${cw}×${ch} vers ${fw}×${fh}, pieds alignés sur l'ancre (${ax},${ay})`);
      break;
    }
    case 'single-frame': {
      const t = o.singleTarget ?? { anim: 'idle', index: 0 };
      const d = adapter.anims[t.anim] ?? adapter.anims.idle!;
      const s = Math.min(1, fw / src.width, fh / src.height);
      const x0 = t.index * fw, y0 = d.row * fh;
      g.save(); clipCell(x0, y0);
      g.drawImage(src, x0 + ax - (src.width * s) / 2, y0 + ay - src.height * s, src.width * s, src.height * s);
      g.restore();
      notes.push(`image unique placée dans « ${t.anim} » #${t.index + 1}${s < 1 ? ` (réduite à ${Math.round(s * 100)} %)` : ''}`);
      break;
    }
    default: g.drawImage(src, 0, 0);
  }
  return { canvas: out, notes };
}

export function renderSpriteFit(src: HTMLCanvasElement, spec: AssetSpec, o: FitOptions): HTMLCanvasElement {
  if (o.mode === 'scale' && spec.recommended) {
    const out = makeCanvas(spec.recommended.w, spec.recommended.h), g = ctxOf(out);
    g.imageSmoothingEnabled = o.smooth; g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, out.width, out.height); return out;
  }
  return cloneCanvas(src);
}

/** Découpe une sheet à plat en frames éditables (1 calque « Original » par frame). */
export function sliceSheet(sheet: HTMLCanvasElement, asset: Asset, adapter: GameAdapter): void {
  for (const [anim, frames] of Object.entries(asset.anims)) frames.forEach((f, i) => {
    const r = cellRect(asset, adapter, anim, i);
    const c = makeCanvas(r.w, r.h);
    ctxOf(c).drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    f.layers = [newLayer(r.w, r.h, 'Original', c)];
  });
}

/** Construit l'asset éditable à partir d'une image déjà décodée et d'un mode d'ajustement. */
export function buildAssetFromImage(spec: AssetSpec, adapter: GameAdapter, src: HTMLCanvasElement, o: FitOptions): { asset: Asset; notes: string[] } {
  if (spec.kind === 'sheet') {
    const { canvas, notes } = renderSheetFit(src, spec, adapter, o);
    const asset = createAsset(spec, adapter, 'imported');
    sliceSheet(canvas, asset, adapter);
    asset.original = canvas;
    return { asset, notes };
  }
  const flat = renderSpriteFit(src, spec, o);
  const asset = createAsset(spec, adapter, 'imported', { w: flat.width, h: flat.height });
  const f: Frame = { layers: [newLayer(flat.width, flat.height, 'Original', cloneCanvas(flat))] };
  asset.anims[SPRITE_ANIM] = [f];
  asset.original = flat;
  return { asset, notes: o.mode === 'scale' ? [`mise à l'échelle → ${flat.width}×${flat.height}`] : [] };
}
