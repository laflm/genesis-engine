import type { GameAdapter, PackJson, SkinDef } from '../../../shared/types';
import { specOf } from '../specs';

/** Construit pack.json : l'ancien pack importé (si présent) + les clés exportées. Tri alphabétique stable. */
export function buildPack(keys: string[], adapter: GameAdapter, custom: SkinDef[], base?: PackJson): PackJson {
  const sheets: Record<string, string> = { ...base?.sheets };
  const sprites: Record<string, string> = { ...base?.sprites };
  for (const k of keys) {
    const s = specOf(adapter, custom, k);
    if (!s) continue;
    (s.packSection === 'sheets' ? sheets : sprites)[k] = s.fileName;
  }
  const sort = (o: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return { sheets: sort(sheets), sprites: sort(sprites) };
}
