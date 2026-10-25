import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { CanvasView } from '../canvas/view';
import { attachInput } from '../canvas/input';
import { openExportDialog, openProjectDialog } from '../export/ui';
import { importFiles, pickAndImport } from '../import/ui';
import { createLayersPanel } from '../layers/panel';
import { createPicker } from '../palette/picker';
import { createPreview } from '../preview/preview';
import { openTestGame } from '../preview/testgame';
import { session } from '../session';
import { createTimeline } from '../timeline/timeline';
import { getSpriteTool, listSpriteTools, setActiveTool } from '../tools';
import { listBrushes } from '../brushes';
import { h, modal, toast } from './dom';
import { bindShortcuts } from './shortcuts';

/** Construit toute l'interface du Sprite Editor dans `host`. */
export function buildShell(host: HTMLElement): void {
  host.replaceChildren();
  const adapter = session.adapter;
  const top = h('div', { class: 'topbar' }), left = h('div', { class: 'toolbar' }), center = h('div', { class: 'center' });
  const side = h('aside', { class: 'side' }), bottom = h('div', { class: 'bottom' });
  const stage = h('div', { class: 'stage' });
  center.append(stage);

  // ---- Barre du haut ----
  const modes = h('div', { class: 'modes' });
  const assetBtn = h('button', { class: 'btn asset-btn', onclick: openAssetPicker }, 'Choisir un sprite…');
  const undo = h('button', { class: 'btn icon', 'aria-label': 'Annuler', onclick: () => { session.undo(); bus.emit('pixels:changed'); } }, '↶');
  const redo = h('button', { class: 'btn icon', 'aria-label': 'Rétablir', onclick: () => { session.redo(); bus.emit('pixels:changed'); } }, '↷');
  const panelBtn = h('button', { class: 'btn icon panel-toggle', 'aria-label': 'Panneaux', onclick: () => side.classList.toggle('open') }, '☰');
  top.append(h('span', { class: 'brand' }, `GENESIS · ${adapter.name}`), modes, assetBtn, undo, redo,
    h('button', { class: 'btn', onclick: () => void pickAndImport() }, '⬆ Importer'), h('button', { class: 'btn', onclick: openExportDialog }, '⬇ Exporter'),
    h('button', { class: 'btn', onclick: () => void openTestGame() }, '▶ Tester'), h('button', { class: 'btn', onclick: openProjectDialog }, '📁'), panelBtn);

  const renderModes = (): void => {
    modes.replaceChildren(...CONFIG.modes.map((m) => h('button', { class: `btn tab${m.id === session.mode ? ' active' : ''}`, onclick: () => setMode(m.id) }, m.label)));
  };
  const setMode = (id: string): void => {
    session.mode = id; const retouch = id === 'retouch'; session.onion = retouch; session.showOriginal = false;
    renderModes(); bus.emit('mode:changed'); bus.emit('view:changed'); openAssetPicker();
  };

  // ---- Barre d'outils ----
  const renderTools = (): void => {
    left.replaceChildren(...listSpriteTools().map((t) => h('button', { class: `btn tool${t.id === session.toolId ? ' active' : ''}`, title: `${t.label} (${t.shortcut ?? ''})`, 'aria-label': t.label, onclick: () => setActiveTool(t.id) }, t.icon)),
      h('button', { class: 'btn tool', title: 'Ajuster la vue', 'aria-label': 'Ajuster la vue', onclick: () => view.fit() }, '⛶'),
      h('button', { class: `btn tool${session.showGuides ? ' active' : ''}`, title: 'Guides (grille, ancre, zone sûre)', 'aria-label': 'Guides', onclick: () => { session.showGuides = !session.showGuides; bus.emit('tool:changed'); bus.emit('view:changed'); } }, '▦'),
      h('button', { class: `btn tool${session.moveAllLayers ? ' active' : ''}`, title: 'Déplacer : tous les calques', 'aria-label': 'Déplacer tous les calques', onclick: () => { session.moveAllLayers = !session.moveAllLayers; bus.emit('tool:changed'); } }, '⧉'));
  };

  // ---- Réglages de pinceau (sous le canvas) ----
  const sizeIn = h('input', { type: 'range', min: CONFIG.brush.minSize, max: CONFIG.brush.maxSize, value: session.size, 'aria-label': 'Taille' });
  const opIn = h('input', { type: 'range', min: 5, max: 100, value: Math.round(session.opacity * 100), 'aria-label': 'Opacité' });
  const sizeLbl = h('span', {}, String(session.size));
  sizeIn.addEventListener('input', () => { session.size = Number(sizeIn.value); sizeLbl.textContent = sizeIn.value; });
  opIn.addEventListener('input', () => { session.opacity = Number(opIn.value) / 100; });
  const brushSel = h('select', { 'aria-label': 'Pinceau' }, ...listBrushes().filter((b) => !b.erase).map((b) => h('option', { value: b.id }, b.label)));
  brushSel.addEventListener('change', () => { session.brushId = brushSel.value; });
  const swatch = h('span', { class: 'cur-color' });
  bus.on('color:changed', () => { swatch.style.background = session.color; }); swatch.style.background = session.color;
  const optionsHost = h('div', { class: 'tool-options' });
  const renderOptions = (): void => { optionsHost.replaceChildren(); getSpriteTool(session.toolId)?.options?.(optionsHost); };
  const settings = h('div', { class: 'settings' }, swatch, brushSel, h('label', {}, 'Taille ', sizeIn, sizeLbl), h('label', {}, 'Opacité ', opIn), optionsHost);

  // ---- Panneaux ----
  const tabs = h('div', { class: 'tabs' }), panes = h('div', { class: 'panes' });
  const mk = (id: string, label: string, el: HTMLElement): void => {
    el.classList.add('pane'); panes.append(el);
    tabs.append(h('button', { class: 'btn tab', 'data-pane': id, onclick: () => { tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.pane === id)); panes.querySelectorAll('.pane').forEach((p) => p.classList.toggle('show', p === el)); } }, label));
  };
  const pLayers = h('div'), pColor = h('div'), pPrev = h('div');
  mk('layers', 'Calques', pLayers); mk('color', 'Couleur', pColor); mk('prev', 'Aperçu', pPrev);
  side.append(tabs, panes);
  (tabs.firstElementChild as HTMLButtonElement).click();

  host.append(top, left, center, side, bottom);
  center.append(settings);
  const view = new CanvasView(stage);
  attachInput(view);
  createLayersPanel(pLayers); createPicker(pColor); createPreview(pPrev); createTimeline(bottom);
  bindShortcuts();
  renderModes(); renderTools();

  // ---- Réactions ----
  const sync = (): void => {
    undo.toggleAttribute('disabled', !session.history.canUndo); redo.toggleAttribute('disabled', !session.history.canRedo);
    const a = session.asset; assetBtn.textContent = a ? `${a.spec.label} · ${a.key}` : 'Choisir un sprite…';
  };
  bus.on('history:changed', sync); bus.on('asset:selected', () => { sync(); view.resize(); view.fit(); }); bus.on('project:changed', sync);
  bus.on('tool:changed', () => { renderTools(); renderOptions(); }); bus.on('toast', toast);
  new ResizeObserver(() => view.resize()).observe(stage);
  // Glisser-déposer de fichiers sur toute l'application.
  host.addEventListener('dragover', (e) => e.preventDefault());
  host.addEventListener('drop', (e) => { e.preventDefault(); const fs = [...(e.dataTransfer?.files ?? [])]; if (fs.length) void importFiles(fs); });
  renderOptions(); sync(); view.resize();
  if (!session.asset) { const first = [...session.project.assets.keys()][0]; if (first) session.select(first); else openAssetPicker(); }

  // ---- Sélecteur d'asset (selon le mode) ----
  function openAssetPicker(): void {
    const groups: readonly string[] = CONFIG.modes.find((m) => m.id === session.mode)?.groups ?? [];
    const search = h('input', { type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher' });
    const list = h('div', { class: 'asset-list' });
    let box: ReturnType<typeof modal> | null = null;
    const render = (): void => {
      const q = search.value.toLowerCase();
      const specs = [...adapter.specs, ...session.project.customSkins.map((s) => session.project.spec(s.key)!)].filter((s) => groups.includes(s.group) && (!q || s.key.includes(q) || s.label.toLowerCase().includes(q)));
      const retouch = session.mode === 'retouch';
      list.replaceChildren(...specs.filter((s) => !retouch || session.project.assets.has(s.key)).map((s) => {
        const st = session.project.assets.get(s.key)?.status;
        return h('button', { class: 'asset-row', onclick: () => { session.select(s.key); box?.close(); } }, h('strong', {}, s.label), h('small', {}, s.key), st ? h('span', { class: `badge ${st}` }, st === 'imported' ? 'importé' : st === 'edited' ? 'modifié' : 'créé') : null);
      }), ...(retouch && !session.project.assets.size ? [h('p', { class: 'hint' }, 'Importe d\'abord des PNG (⬆ Importer) : ils apparaîtront ici pour la retouche.')] : []));
    };
    search.addEventListener('input', render);
    const extra = session.mode === 'skins' ? h('button', { class: 'btn', onclick: () => newSkinDialog(() => { box?.close(); }) }, '＋ Nouveau skin') : null;
    box = modal('Choisir un sprite', h('div', {}, search, extra, list), [{ label: 'Fermer', onClick: () => {} }]);
    render();
  }
  function newSkinDialog(done: () => void): void {
    const f = (label: string, v: string | number, type = 'text') => h('input', { type, value: v, 'aria-label': label });
    const key = f('Clé', 'nouveau_skin'), name = f('Nom', 'Nouveau skin'), fw = f('Largeur', 200, 'number'), fh = f('Hauteur', 200, 'number'), ax = f('Ancre X', 100, 'number'), ay = f('Ancre Y', 180, 'number');
    modal('Nouveau skin', h('div', { class: 'form' }, h('p', { class: 'hint' }, 'Un nouveau skin demande une ligne SHEETDIM côté jeu : elle sera écrite dans PATCH_NOTES.txt à l\'export.'),
      h('label', {}, 'Clé (minuscules, _) ', key), h('label', {}, 'Nom ', name), h('label', {}, 'Frame L × H ', fw, fh), h('label', {}, 'Ancre (pieds) X, Y ', ax, ay)), [
      { label: 'Annuler', onClick: () => {} },
      { label: 'Créer', primary: true, onClick: () => {
        try {
          if (!adapter.validation.keyPattern.test(key.value)) throw new Error('Clé invalide : minuscules, chiffres et _ seulement.');
          session.project.addCustomSkin({ key: key.value, label: name.value, fw: Number(fw.value), fh: Number(fh.value), ax: Number(ax.value), ay: Number(ay.value) });
          done(); session.select(key.value);
        } catch (e) { toast((e as Error).message); return false; }
      } }]);
  }
}
