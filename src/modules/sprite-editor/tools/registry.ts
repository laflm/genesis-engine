// ===== Outils = plugins. Ajouter un outil : un fichier qui appelle registerTool(), importé dans tools/index.ts. =====
export interface PointerInfo { x: number; y: number; pressure: number; tiltX: number; tiltY: number; pointerType: string }
export interface SpriteTool {
  id: string; label: string; icon: string; shortcut?: string;
  down(p: PointerInfo): void;
  move(p: PointerInfo): void;
  up(p: PointerInfo): void;
  /** Interrompt l'action en cours sans rien valider (geste à deux doigts, appui long…). */
  cancel(): void;
}
const tools = new Map<string, SpriteTool>();
export const registerSpriteTool = (t: SpriteTool): void => { tools.set(t.id, t); };
export const getSpriteTool = (id: string): SpriteTool | undefined => tools.get(id);
export const listSpriteTools = (): SpriteTool[] => [...tools.values()];
