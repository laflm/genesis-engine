import { registerTool } from '../../engine/registry';
import type { ToolModule } from '../../shared/types';

/**
 * STUB — Level Editor (non implémenté en v1).
 * Prévu : Placer et déplacer les éléments, éditer LEVELS/stages, export JSON.
 * Pour l'implémenter : remplir supports() (ce que l'adaptateur doit déclarer) et mount(), passer status à 'ready'.
 * Le noyau n'a pas besoin d'être modifié : ce module se branche via registerTool().
 */
export const stub: ToolModule = {
  id: 'level-editor', label: 'Level Editor', status: 'planned',
  supports: () => false,
  mount() { throw new Error('Level Editor n\'est pas encore disponible.'); },
  unmount() {},
};
registerTool(stub);
