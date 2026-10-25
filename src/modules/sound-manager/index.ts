import { registerTool } from '../../engine/registry';
import type { ToolModule } from '../../shared/types';

/**
 * STUB — Sound Manager (non implémenté en v1).
 * Prévu : Espaces SONS et MUSIQUES, événement → son, export JSON + fichiers.
 * Pour l'implémenter : remplir supports() (ce que l'adaptateur doit déclarer) et mount(), passer status à 'ready'.
 * Le noyau n'a pas besoin d'être modifié : ce module se branche via registerTool().
 */
export const stub: ToolModule = {
  id: 'sound-manager', label: 'Sound Manager', status: 'planned',
  supports: () => false,
  mount() { throw new Error('Sound Manager n\'est pas encore disponible.'); },
  unmount() {},
};
registerTool(stub);
