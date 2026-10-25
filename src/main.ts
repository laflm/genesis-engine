import './ui/style.css';
import { CONFIG } from './config';
import { getAdapter, listAdapters, listTools } from './engine/registry';
import { registerAllGames } from './games';
import './modules/level-editor';
import './modules/sound-manager';
import './modules/sprite-editor';
import './modules/ui-editor';
import { h } from './modules/sprite-editor/ui/dom';

registerAllGames();
const root = document.getElementById('app')!;
const LAST = 'genesis.lastGame';

/** Écran de démarrage : on choisit un jeu ; l'outil se charge avec l'adaptateur de CE jeu. */
async function openGame(id: string): Promise<void> {
  const adapter = getAdapter(id); if (!adapter) return;
  try { localStorage.setItem(LAST, id); } catch { /* mode privé */ }
  const tool = listTools().find((t) => t.status === 'ready' && t.supports(adapter));
  if (!tool) return;
  root.className = 'workspace'; root.replaceChildren();
  await tool.mount(root, adapter);
}

function startScreen(): void {
  root.className = 'start'; root.replaceChildren(
    h('h1', {}, CONFIG.appName), h('p', {}, 'Choisis le jeu à modifier.'),
    h('div', { class: 'cards' }, ...listAdapters().map((a) => h('button', { class: 'card', 'data-game': a.id, onclick: () => void openGame(a.id) }, h('strong', {}, a.name), h('small', {}, `${a.skins.length} skins · ${a.items.length} items`)))),
    h('p', { class: 'hint' }, 'Outils : ' + listTools().map((t) => `${t.label}${t.status === 'ready' ? '' : ' (bientôt)'}`).join(' · ')));
}

const wanted = new URLSearchParams(location.hash.slice(1)).get('game');
if (wanted && getAdapter(wanted)) void openGame(wanted); else startScreen();

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/^(localhost|127\.)/.test(location.hostname + '.') ) {
  navigator.serviceWorker.register(CONFIG.pwa.serviceWorker).catch(() => {});
}
