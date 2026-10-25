import type { AssetSpec, GameAdapter, SkinDef } from '../../shared/types';

/** Spec d'un skin créé par l'utilisateur (absent de l'adaptateur → PATCH_NOTES nécessaire). */
export function customSkinSpec(s: SkinDef): AssetSpec {
  return { key: s.key, kind: 'sheet', group: 'skin', label: `${s.label} (nouveau)`, fileName: `${s.key}.png`, packSection: 'sheets', fw: s.fw, fh: s.fh, ax: s.ax, ay: s.ay };
}

/** Cherche une spec dans l'adaptateur puis dans les skins personnalisés du projet. */
export function specOf(adapter: GameAdapter, custom: SkinDef[], key: string): AssetSpec | undefined {
  const s = adapter.spec(key);
  if (s) return s;
  const c = custom.find((k) => k.key === key);
  return c ? customSkinSpec(c) : undefined;
}
