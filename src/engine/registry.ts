import { createAdapter } from './adapter';
import type { AdapterData, GameAdapter, ToolModule } from '../shared/types';

// Registre des jeux (adaptateurs) et des outils. Le noyau ne connaît AUCUN jeu en dur :
// chaque adaptateur s'enregistre lui-même (voir src/games/index.ts).
const adapters = new Map<string, GameAdapter>();
const tools = new Map<string, ToolModule>();

export const registerAdapter = (d: AdapterData): GameAdapter => { const a = createAdapter(d); adapters.set(a.id, a); return a; };
export const getAdapter = (id: string): GameAdapter | undefined => adapters.get(id);
export const listAdapters = (): GameAdapter[] => [...adapters.values()];

export const registerTool = (t: ToolModule): void => { tools.set(t.id, t); };
export const listTools = (): ToolModule[] => [...tools.values()];
export const getTool = (id: string): ToolModule | undefined => tools.get(id);
