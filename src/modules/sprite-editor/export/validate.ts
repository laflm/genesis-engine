import { CONFIG } from '../../../config';
import type { GameAdapter, SkinDef } from '../../../shared/types';
import { specOf } from '../specs';
import type { ExportItem, Issue } from './types';

/** Validation avant export : renvoie des problèmes bloquants (error) ou non (warning). */
export function validateExport(items: ExportItem[], adapter: GameAdapter, custom: SkinDef[]): Issue[] {
  const issues: Issue[] = [];
  if (!items.length) issues.push({ level: 'error', message: 'Rien à exporter : importe ou dessine au moins un sprite.' });
  for (const it of items) {
    const { key } = it;
    if (!adapter.validation.keyPattern.test(key) || key !== key.trim()) {
      issues.push({ level: 'error', key, message: `Nom invalide « ${key} » : minuscules, chiffres et _ uniquement, sans espaces.` });
      continue;
    }
    const spec = specOf(adapter, custom, key);
    if (!spec) { issues.push({ level: 'error', key, message: `Clé inconnue « ${key} » : absente de l'adaptateur du jeu.` }); continue; }
    if (spec.kind === 'sheet') {
      const w = adapter.sheetCols * spec.fw!, h = adapter.sheetRows * spec.fh!;
      if (it.width !== w || it.height !== h) issues.push({ level: 'error', key, message: `Dimensions ${it.width}×${it.height} au lieu de ${w}×${h} (${adapter.sheetCols}×${adapter.sheetRows} frames de ${spec.fw}×${spec.fh}).` });
      if (it.allEmpty) issues.push({ level: 'warning', key, message: 'La sheet est entièrement transparente.' });
      else for (const a of it.emptyAnims) issues.push({ level: 'warning', key, message: `Animation « ${a} » vide : le jeu affichera du vide pendant cette animation.` });
    } else {
      if (it.allEmpty) issues.push({ level: 'warning', key, message: 'L\'image est entièrement transparente.' });
      if (spec.recommended) {
        const r = spec.recommended;
        if (Math.abs(it.width / it.height - r.w / r.h) / (r.w / r.h) > 0.05) issues.push({ level: 'warning', key, message: `Ratio ${it.width}×${it.height} différent de ${r.w}×${r.h} : image déformée dans le jeu.` });
      }
    }
    if (it.bytes > adapter.validation.maxFileBytes) issues.push({ level: 'error', key, message: `Fichier trop lourd (${(it.bytes / 1e6).toFixed(2)} Mo, limite ${(adapter.validation.maxFileBytes / 1e6).toFixed(1)} Mo).` });
    else if (it.bytes > CONFIG.export.warnFileBytes) issues.push({ level: 'warning', key, message: `Fichier lourd (${(it.bytes / 1e6).toFixed(2)} Mo) : chargement plus lent sur mobile.` });
  }
  return issues;
}
