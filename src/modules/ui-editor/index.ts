import { registerTool } from '../../engine/registry';
import type { ToolModule } from '../../shared/types';

/**
 * STUB — UI/HUD Editor (non implémenté en v1).
 * Prévu : Personnaliser HUD et menus, export JSON.
 * Pour l'implémenter : remplir supports() (ce que l'adaptateur doit déclarer) et mount(), passer status à 'ready'.
 * Le noyau n'a pas besoin d'être modifié : ce module se branche via registerTool().
 */
export const stub: ToolModule = {
  id: 'ui-editor', label: 'UI/HUD Editor', status: 'planned',
  supports: () => false,
  mount() { throw new Error('UI/HUD Editor n\'est pas encore disponible.'); },
  unmount() {},
};
registerTool(stub);
