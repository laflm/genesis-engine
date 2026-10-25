import type { AssetSpec, GameAdapter } from '../../../shared/types';

export type FitMode = 'exact' | 'reslice' | 'crop-pad' | 'scale' | 'single-frame' | 'keep';

export interface FitOption { mode: FitMode; label: string; detail: string }
export interface FitDiagnosis {
  ok: boolean;
  expected: { w: number; h: number } | null;
  actual: { w: number; h: number };
  message: string;
  options: FitOption[];
  recommended: FitMode;
}

/** Dimensions attendues d'une sheet : colonnes max × fw, lignes d'animation × fh. */
export function expectedSheetSize(spec: AssetSpec, adapter: GameAdapter): { w: number; h: number } {
  return { w: adapter.sheetCols * (spec.fw ?? 0), h: adapter.sheetRows * (spec.fh ?? 0) };
}

/** Compare une image importée aux dimensions du jeu et propose des corrections (jamais de refus silencieux). */
export function diagnose(spec: AssetSpec, adapter: GameAdapter, w: number, h: number): FitDiagnosis {
  const actual = { w, h };
  if (spec.kind === 'sheet') {
    const fw = spec.fw!, fh = spec.fh!;
    const exp = expectedSheetSize(spec, adapter);
    if (w === exp.w && h === exp.h) return { ok: true, expected: exp, actual, message: 'Dimensions conformes.', options: [], recommended: 'exact' };
    const options: FitOption[] = [];
    const gridOk = w % fw === 0 && h % fh === 0;
    if (gridOk) options.push({ mode: 'reslice', label: 'Redécouper par taille de frame', detail: `Grille de ${w / fw}×${h / fh} frames de ${fw}×${fh} : chaque ligne = une animation.` });
    const cw = Math.floor(w / adapter.sheetCols), ch = Math.floor(h / adapter.sheetRows);
    options.push({ mode: 'crop-pad', label: 'Recadrer / ajouter des marges (ancre aux pieds)', detail: `Découpe en ${adapter.sheetCols}×${adapter.sheetRows} cellules de ${cw}×${ch}, recadrées à ${fw}×${fh} avec alignement sur l'ancre (${spec.ax},${spec.ay}).` });
    options.push({ mode: 'scale', label: 'Mettre à l\'échelle', detail: `Étire toute l'image vers ${exp.w}×${exp.h}.` });
    options.push({ mode: 'single-frame', label: 'Image unique → une frame', detail: `Place l'image entière dans une frame (${fw}×${fh}), pieds sur l'ancre ; à ajuster avec l'outil Déplacer.` });
    const single = w <= fw && h <= fh;
    // Ratio identique à celui d'une sheet du jeu = image réduite/agrandie uniformément → mise à l'échelle.
    const sameRatio = Math.abs(w / h - exp.w / exp.h) / (exp.w / exp.h) < 0.01;
    const recommended: FitMode = single ? 'single-frame' : sameRatio ? 'scale' : gridOk ? 'reslice' : 'crop-pad';
    return {
      ok: false, expected: exp, actual,
      message: `Dimensions attendues ${exp.w}×${exp.h} (${adapter.sheetCols}×${adapter.sheetRows} frames de ${fw}×${fh}), reçu ${w}×${h}.`,
      options, recommended,
    };
  }
  // Sprites fixes et icônes : le jeu les étire dans un rectangle fixe → seul le ratio compte.
  const rec = spec.recommended;
  if (!rec) return { ok: true, expected: null, actual, message: 'Aucune taille imposée par le jeu.', options: [], recommended: 'keep' };
  if (w === rec.w && h === rec.h) return { ok: true, expected: rec, actual, message: 'Dimensions conformes.', options: [], recommended: 'exact' };
  const ratioDiff = Math.abs(w / h - rec.w / rec.h) / (rec.w / rec.h);
  const msg = ratioDiff > 0.05
    ? `Ratio différent : le jeu affichera l'image déformée (attendu ≈ ${rec.w}×${rec.h}, reçu ${w}×${h}).`
    : `Taille différente de ${rec.w}×${rec.h} mais ratio compatible : le jeu l'étire sans déformation.`;
  return {
    ok: ratioDiff <= 0.05, expected: rec, actual, message: msg,
    options: [
      { mode: 'keep', label: 'Garder tel quel', detail: 'Importe l\'image sans modification.' },
      { mode: 'scale', label: `Mettre à l'échelle ${rec.w}×${rec.h}`, detail: 'Redimensionne l\'image (peut déformer si le ratio diffère).' },
    ],
    recommended: 'keep',
  };
}

/** Retourne la liste (anim, frame) à produire pour une sheet. */
export function frameCells(adapter: GameAdapter): Array<{ anim: string; row: number; index: number }> {
  const out: Array<{ anim: string; row: number; index: number }> = [];
  for (const [anim, d] of Object.entries(adapter.anims)) for (let i = 0; i < d.frames; i++) out.push({ anim, row: d.row, index: i });
  return out;
}
