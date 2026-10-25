import type { ExportFile, GameAdapter, PackJson, SkinDef } from '../../../shared/types';
import { buildPatchNotes, buildReadmeUpload } from './docs';
import { buildPack } from './pack';
import type { ExportItem, Issue } from './types';
import { validateExport } from './validate';

export interface ExportPlan { files: ExportFile[]; issues: Issue[]; items: ExportItem[]; blocked: boolean }

/** Assemble l'arborescence du ZIP (pur : aucune dépendance au navigateur). */
export function planExport(
  all: ExportItem[], adapter: GameAdapter, custom: SkinDef[],
  opts: { partial: boolean; basePack?: PackJson | undefined },
): ExportPlan {
  const items = opts.partial ? all.filter((i) => i.status !== 'imported') : all;
  const issues = validateExport(items, adapter, custom);
  const enc = new TextEncoder();
  const dir = adapter.exportDir;
  const pack = buildPack(items.map((i) => i.key), adapter, custom, opts.basePack);
  const files: ExportFile[] = [
    { path: `${dir}/${adapter.packFile}`, data: enc.encode(JSON.stringify(pack, null, 2) + '\n') },
    ...items.map((i) => ({ path: `${dir}/${i.key}.png`, data: i.png })),
    { path: 'PATCH_NOTES.txt', data: enc.encode(buildPatchNotes(items, adapter, custom)) },
    { path: 'README_UPLOAD.txt', data: enc.encode(buildReadmeUpload(items, adapter, opts.partial)) },
  ];
  return { files, issues, items, blocked: issues.some((i) => i.level === 'error') };
}
