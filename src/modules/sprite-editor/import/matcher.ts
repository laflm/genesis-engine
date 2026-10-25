import type { GameAdapter } from '../../../shared/types';

export interface RawEntry { name: string; bytes: Uint8Array }
export type MatchHow = 'exact' | 'pack' | 'alias' | 'ambiguous' | 'none';
export interface MatchResult {
  entry: RawEntry; width: number; height: number;
  key: string | null; how: MatchHow;
  /** Clés proposées quand la correspondance est ambiguë ou absente. */
  candidates: string[];
  note?: string;
}

const SUFFIXES = /(_sheet|_spritesheet|_spr|_sprite|_final|_copy|_new|_v\d+|_edit|_edited)$/;
const PREFIXES = /^(sheet_|sprite_)/;

export function baseName(path: string): string { return path.split(/[\\/]/).pop() ?? path; }

/** "Item-Sword (1).PNG" -> "item_sword" ; "hero_sheet.png" -> "hero". */
export function normalizeName(file: string): string {
  let s = baseName(file).toLowerCase().replace(/\.png$/, '').replace(/\s*\(\d+\)\s*$/, '');
  s = s.replace(/[\s\-.]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  for (let i = 0; i < 6; i++) {
    const n = s.replace(SUFFIXES, '').replace(PREFIXES, '');
    if (n === s) break;
    s = n;
  }
  return s;
}

export function matchEntries(
  entries: Array<RawEntry & { width: number; height: number }>,
  adapter: GameAdapter,
  packMap?: Map<string, string>,
  extraKeys: string[] = [],
): MatchResult[] {
  const keys = new Set([...adapter.specs.map((s) => s.key), ...extraKeys]);
  const results = entries.map<MatchResult>((e) => {
    const base = baseName(e.name).toLowerCase();
    const norm = normalizeName(e.name);
    const base0 = { entry: e, width: e.width, height: e.height };
    const fromPack = packMap?.get(base);
    if (fromPack && keys.has(fromPack)) return { ...base0, key: fromPack, how: 'pack', candidates: [] };
    if (keys.has(norm)) return { ...base0, key: norm, how: base.replace(/\.png$/, '') === norm ? 'exact' : 'alias', candidates: [] };
    const guesses = [adapter.itemSheetPrefix + norm, adapter.iconPrefix + norm].filter((k) => keys.has(k));
    if (guesses.length === 1) return { ...base0, key: guesses[0]!, how: 'alias', candidates: [], note: `« ${norm} » interprété comme ${guesses[0]}` };
    if (guesses.length > 1) return { ...base0, key: null, how: 'ambiguous', candidates: guesses, note: 'Plusieurs clés possibles : choisis la bonne.' };
    const fuzzy = norm.length >= 3 ? [...keys].filter((k) => k.includes(norm) || norm.includes(k)).slice(0, 5) : [];
    return { ...base0, key: null, how: 'none', candidates: fuzzy };
  });
  return resolveDuplicates(results);
}

/** Si deux fichiers visent la même clé, on garde le plus fiable (exact/pack avant alias) et on signale l'autre. */
export function resolveDuplicates(results: MatchResult[]): MatchResult[] {
  const rank: Record<MatchHow, number> = { exact: 0, pack: 0, alias: 1, ambiguous: 2, none: 3 };
  const best = new Map<string, number>();
  results.forEach((r, i) => {
    if (!r.key) return;
    const cur = best.get(r.key);
    if (cur === undefined || rank[r.how] < rank[results[cur]!.how]) best.set(r.key, i);
  });
  return results.map((r, i) =>
    r.key && best.get(r.key) !== i
      ? { ...r, key: null, how: 'none' as const, candidates: [r.key], note: `Doublon : un autre fichier vise déjà « ${r.key} ».` }
      : r);
}
