// ===== Pinceaux = plugins. Ajouter un pinceau : créer un fichier qui appelle registerBrush(), l'importer dans index.ts. =====
export interface BrushDef {
  id: string;
  label: string;
  /** Dessine un contour noir épais autour du trait (style du jeu). */
  outline: boolean;
  /** Gomme : retire des pixels au lieu d'en ajouter. */
  erase: boolean;
  /** Rayon du tampon (px) selon la taille réglée et la pression (0..1). */
  radius(size: number, pressure: number): number;
}
const brushes = new Map<string, BrushDef>();
export const registerBrush = (b: BrushDef): void => { brushes.set(b.id, b); };
export const getBrush = (id: string): BrushDef => brushes.get(id) ?? [...brushes.values()][0]!;
export const listBrushes = (): BrushDef[] => [...brushes.values()];
