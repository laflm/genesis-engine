import { readZip, writeZip, type ZipEntry } from '../../core/zip';
import type { GameAdapter, PackJson, SkinDef } from '../../shared/types';
import { canvasToPng, decodeImage } from './canvas/pixels';
import { bumpLayerId, createAsset, type Asset, type Frame, type Layer } from './model';
import type { AssetStatus } from './export/types';
import { Project } from './project';

// Fichier projet (.genesis = ZIP) : project.json + un PNG par calque + les originaux. Édition non destructive conservée.
const VERSION = 1;
interface LayerMeta { id: number; name: string; visible: boolean; opacity: number; locked: boolean; file: string }
interface AssetMeta { key: string; status: AssetStatus; w: number; h: number; original: string | null; anims: Record<string, LayerMeta[][]> }
interface ProjectMeta { version: number; gameId: string; name: string; customSkins: SkinDef[]; basePack: PackJson | null; assets: AssetMeta[] }

export async function serializeProject(p: Project): Promise<Uint8Array> {
  const files: ZipEntry[] = [];
  const metas: AssetMeta[] = [];
  let n = 0;
  for (const a of p.assets.values()) {
    const anims: AssetMeta['anims'] = {};
    for (const [anim, frames] of Object.entries(a.anims)) {
      anims[anim] = [];
      for (const f of frames) {
        const ls: LayerMeta[] = [];
        for (const l of f.layers) { const file = `layers/${n++}.png`; files.push({ path: file, data: await canvasToPng(l.canvas) }); ls.push({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked, file }); }
        anims[anim]!.push(ls);
      }
    }
    let original: string | null = null;
    if (a.original) { original = `originals/${a.key}.png`; files.push({ path: original, data: await canvasToPng(a.original) }); }
    metas.push({ key: a.key, status: a.status, w: a.w, h: a.h, original, anims });
  }
  const meta: ProjectMeta = { version: VERSION, gameId: p.adapter.id, name: p.name, customSkins: p.customSkins, basePack: p.basePack ?? null, assets: metas };
  files.unshift({ path: 'project.json', data: new TextEncoder().encode(JSON.stringify(meta)) });
  return writeZip(files);
}

export async function deserializeProject(bytes: Uint8Array, adapter: GameAdapter): Promise<Project> {
  const entries = await readZip(bytes);
  const byPath = new Map(entries.map((e) => [e.path, e.data]));
  const raw = byPath.get('project.json');
  if (!raw) throw new Error('Ce fichier n\'est pas un projet GENESIS (project.json manquant).');
  const meta = JSON.parse(new TextDecoder().decode(raw)) as ProjectMeta;
  if (meta.version > VERSION) throw new Error('Projet créé par une version plus récente de GENESIS Engine.');
  if (meta.gameId !== adapter.id) throw new Error(`Ce projet est pour le jeu « ${meta.gameId} », pas « ${adapter.id} ».`);
  const p = new Project(adapter);
  p.name = meta.name; p.customSkins = meta.customSkins; p.basePack = meta.basePack ?? undefined;
  for (const am of meta.assets) {
    const spec = p.spec(am.key);
    if (!spec) continue;
    const a: Asset = createAsset(spec, adapter, am.status, { w: am.w, h: am.h });
    for (const [anim, frames] of Object.entries(am.anims)) {
      const out: Frame[] = [];
      for (const lms of frames) {
        const layers: Layer[] = [];
        for (const lm of lms) {
          const d = byPath.get(lm.file); if (!d) continue;
          bumpLayerId(lm.id);
          layers.push({ id: lm.id, name: lm.name, visible: lm.visible, opacity: lm.opacity, locked: lm.locked, canvas: await decodeImage(d) });
        }
        out.push({ layers });
      }
      a.anims[anim] = out;
    }
    if (am.original) { const d = byPath.get(am.original); if (d) a.original = await decodeImage(d); }
    p.assets.set(a.key, a);
  }
  return p;
}
