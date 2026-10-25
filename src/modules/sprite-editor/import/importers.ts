import { readZip } from '../../../core/zip';
import type { PackJson } from '../../../shared/types';
import { baseName, type RawEntry } from './matcher';
import { pngSize } from './png';

// ===== Importers = plugins. Ajouter un format = un objet Importer + registerImporter() (voir GUIDE). =====
export interface ImportCtx {
  entries: Array<RawEntry & { width: number; height: number }>;
  pack: PackJson | undefined;
  ignored: string[];
  warnings: string[];
  /** Redonne un fichier (ex. contenu d'un ZIP) au système pour qu'un autre importer le traite. */
  expand(name: string, bytes: Uint8Array): Promise<void>;
}
export interface Importer {
  id: string;
  label: string;
  accepts(name: string): boolean;
  read(name: string, bytes: Uint8Array, ctx: ImportCtx): Promise<void>;
}

const importers: Importer[] = [];
export const registerImporter = (i: Importer): void => { importers.push(i); };
export const listImporters = (): Importer[] => [...importers];

const pngImporter: Importer = {
  id: 'png', label: 'Image PNG',
  accepts: (n) => /\.png$/i.test(n),
  async read(name, bytes, ctx) {
    const s = pngSize(bytes);
    if (!s) { ctx.ignored.push(`${baseName(name)} : PNG invalide ou corrompu.`); return; }
    ctx.entries.push({ name, bytes, width: s.w, height: s.h });
  },
};

const zipImporter: Importer = {
  id: 'zip', label: 'Archive ZIP',
  accepts: (n) => /\.zip$/i.test(n),
  async read(name, bytes, ctx) {
    let files;
    try { files = await readZip(bytes); } catch (e) { ctx.ignored.push(`${baseName(name)} : ${(e as Error).message}`); return; }
    for (const f of files) await ctx.expand(f.path, f.data);
  },
};

const packImporter: Importer = {
  id: 'pack', label: 'pack.json',
  accepts: (n) => /(^|[\\/])pack\.json$/i.test(n),
  async read(name, bytes, ctx) {
    try {
      const j = JSON.parse(new TextDecoder().decode(bytes)) as PackJson;
      if (typeof j !== 'object' || j === null) throw new Error('contenu inattendu');
      ctx.pack = { sheets: { ...ctx.pack?.sheets, ...j.sheets }, sprites: { ...ctx.pack?.sprites, ...j.sprites } };
    } catch (e) { ctx.ignored.push(`${baseName(name)} : pack.json illisible (${(e as Error).message}).`); }
  },
};

[pngImporter, zipImporter, packImporter].forEach(registerImporter);

export interface RawImport {
  entries: ImportCtx['entries'];
  pack: PackJson | undefined;
  /** nom de fichier (minuscule) -> clé, d'après pack.json. */
  packMap: Map<string, string>;
  ignored: string[];
  warnings: string[];
}

export async function collectImport(files: RawEntry[]): Promise<RawImport> {
  const ctx: ImportCtx = {
    entries: [], pack: undefined, ignored: [], warnings: [],
    async expand(name, bytes) {
      if (depth > 3) { ctx.ignored.push(`${baseName(name)} : ZIP imbriqués trop profondément.`); return; }
      const imp = importers.find((i) => i.accepts(name));
      if (!imp) { ctx.ignored.push(`${baseName(name)} : format non pris en charge (PNG, ZIP ou pack.json attendus).`); return; }
      depth++; try { await imp.read(name, bytes, ctx); } finally { depth--; }
    },
  };
  let depth = 0;
  for (const f of files) await ctx.expand(f.name, f.bytes);
  const packMap = new Map<string, string>();
  for (const sec of ['sheets', 'sprites'] as const) for (const [k, f] of Object.entries(ctx.pack?.[sec] ?? {})) packMap.set(baseName(f).toLowerCase(), k);
  return { entries: ctx.entries, pack: ctx.pack, packMap, ignored: ctx.ignored, warnings: ctx.warnings };
}
