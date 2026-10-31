import { bus } from '../../../core/events';
import { session } from '../session';
// ===== Outils = plugins. Ajouter un outil : un fichier qui appelle registerTool(), importé dans tools/index.ts. =====
export interface PointerInfo { x: number; y: number; pressure: number; tiltX: number; tiltY: number; pointerType: string }
export interface SpriteTool {
  id: string; label: string; icon: string; shortcut?: string;
  down(p: PointerInfo): void;
  move(p: PointerInfo): void;
  up(p: PointerInfo): void;
  /** Interrompt l'action en cours sans rien valider (geste à deux doigts, appui long…). */
  cancel(): void;
  /** Appelé quand l'outil devient actif / cesse de l'être (ex. valider une transformation). */
  activate?(): void;
  deactivate?(): void;
  /** Remplit la barre de réglages sous le canvas quand l'outil est actif. */
  options?(host: HTMLElement): void;
  /** Masque couleur/pinceau/taille/opacité dans la barre quand ils n'ont pas de sens pour cet outil (plus de place pour ses options). */
  hideBrushSettings?: boolean;
}
const tools = new Map<string, SpriteTool>();
export const registerSpriteTool = (t: SpriteTool): void => { tools.set(t.id, t); };
export const getSpriteTool = (id: string): SpriteTool | undefined => tools.get(id);
export const listSpriteTools = (): SpriteTool[] => [...tools.values()];

/** Change d'outil : désactive l'ancien, active le nouveau, prévient l'interface. */
export function setActiveTool(id: string): void {
  if (!tools.has(id)) return;
  const prev = tools.get(session.toolId);
  if (prev && prev.id !== id) prev.deactivate?.();
  session.previousToolId = session.toolId;
  session.toolId = id;
  tools.get(id)?.activate?.();
  bus.emit('tool:changed');
}
