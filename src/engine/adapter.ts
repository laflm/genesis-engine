import type { AdapterData, AssetSpec, GameAdapter } from '../shared/types';

/** Dérive les AssetSpec (clés, tailles, fichiers d'export) à partir des données déclaratives. */
export function createAdapter(d: AdapterData): GameAdapter {
  const specs: AssetSpec[] = [];
  const sheetCols = Math.max(...Object.values(d.anims).map((a) => a.frames));
  const sheetRows = Object.keys(d.anims).length;

  for (const s of d.skins) {
    specs.push({ key: s.key, kind: 'sheet', group: 'skin', label: s.label, fileName: `${s.key}.png`, packSection: 'sheets', fw: s.fw, fh: s.fh, ax: s.ax, ay: s.ay });
  }
  const body = d.skins.find((s) => s.key === d.playerSkin);
  if (!body) throw new Error(`playerSkin inconnu : ${d.playerSkin}`);
  for (const it of d.items) {
    if (it.slot) {
      const key = d.itemSheetPrefix + it.id;
      specs.push({ key, kind: 'sheet', group: 'item', label: it.name, fileName: `${key}.png`, packSection: 'sheets', fw: body.fw, fh: body.fh, ax: body.ax, ay: body.ay, skinRef: body.key, slot: it.slot });
    }
  }
  for (const f of d.fixedSprites) {
    specs.push({ key: f.key, kind: 'sprite', group: 'fixed', label: f.label, fileName: `${f.key}.png`, packSection: 'sprites', ...(f.recommended ? { recommended: f.recommended } : {}) });
  }
  for (const it of d.items) {
    const key = d.iconPrefix + it.id;
    specs.push({ key, kind: 'icon', group: 'icon', label: `Icône · ${it.name}`, fileName: `${key}.png`, packSection: 'sprites', recommended: d.iconSize, ...(it.slot ? { slot: it.slot } : {}) });
  }
  const bySpec = new Map(specs.map((s) => [s.key, s]));
  const bySkin = new Map(d.skins.map((s) => [s.key, s]));
  return { ...d, specs, sheetCols, sheetRows, spec: (k) => bySpec.get(k), skin: (k) => bySkin.get(k) };
}
