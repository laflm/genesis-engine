import { storage } from '../../core/storage';
import { CONFIG } from '../../config';
import { bus } from '../../core/events';
import { registerTool } from '../../engine/registry';
import type { GameAdapter, ToolModule } from '../../shared/types';
import './brushes';
import './tools';
import { deserializeProject, serializeProject } from './project-io';
import { flattenFrame } from './model';
import { Session, session, setSession } from './session';
import { buildShell } from './ui/shell';

let timer = 0;
/** Sauvegarde automatique : l'état est sérialisé dans IndexedDB après chaque modification (anti-rebond). */
function autosave(): void {
  clearTimeout(timer);
  timer = window.setTimeout(async () => {
    const startedAt = Date.now();   // l'état sauvegardé est celui du DÉBUT de la sérialisation
    try { await storage.put(`${CONFIG.storage.projectKey}:${session.adapter.id}`, await serializeProject(session.project));
      (window as unknown as { __genesisSavedAt: number }).__genesisSavedAt = startedAt; } catch (e) { (window as unknown as { __genesisSaveError: string }).__genesisSaveError = String(e); /* quota / navigation privée */ }
  }, CONFIG.autosaveMs);
}

export const spriteEditor: ToolModule = {
  id: 'sprite-editor', label: 'Sprite Editor', status: 'ready',
  supports: () => true,
  async mount(host: HTMLElement, adapter: GameAdapter) {
    let s = new Session(adapter);
    try {
      const saved = await storage.get<Uint8Array>(`${CONFIG.storage.projectKey}:${adapter.id}`);
      if (saved) s = new Session(adapter, await deserializeProject(saved, adapter));
    } catch { /* projet illisible : on repart de zéro */ }
    setSession(s);
    // Poignée de debug pour les bots de test (tests/bot/e2e.py).
    Object.defineProperty(window, '__genesis', { configurable: true, get: () => ({ session, flattenFrame }) });
    buildShell(host);
    bus.on('project:changed', autosave); bus.on('pixels:changed', autosave); bus.on('layers:changed', autosave);
    // Le Session peut être remplacé (ouverture d'un projet) : on reconstruit alors l'interface.
    bus.on('project:changed', () => { if (host.dataset.sid !== String(sidOf(session))) { host.dataset.sid = String(sidOf(session)); buildShell(host); } });
    host.dataset.sid = String(sidOf(session));
  },
  unmount() { /* l'interface est remplacée par le prochain outil */ },
};
const ids = new WeakMap<object, number>(); let nid = 1;
const sidOf = (o: object): number => { let v = ids.get(o); if (!v) { v = nid++; ids.set(o, v); } return v; };

registerTool(spriteEditor);
