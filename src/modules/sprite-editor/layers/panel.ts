import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { flattenFrame, type Layer } from '../model';
import { session } from '../session';
import { h } from '../ui/dom';
import { addLayer, copyLayers, deleteLayer, duplicateLayers, mergeDown, moveLayer, pasteLayers, selectLayer, setLayersProp } from './actions';

/**
 * Panneau des calques. L'en-tête (boutons, opacité, mode de fusion) reste COLLÉ en haut quand la liste défile.
 * Sélection multiple : bouton ☑ (tactile), Ctrl/Cmd+clic (ajouter) ou Maj+clic (plage) sur ordinateur.
 */
export function createLayersPanel(host: HTMLElement): void {
  const list = h('div', { class: 'layer-list' });
  const op = h('input', { type: 'range', min: 0, max: 100, class: 'op', 'aria-label': 'Opacité du calque' });
  const blendSel = h('select', { 'aria-label': 'Mode de fusion', class: 'blend-sel' }, ...CONFIG.blendModes.map((m) => h('option', { value: m.id }, m.label)));
  const count = h('span', { class: 'sel-count hint' });
  const btn = (label: string, title: string, fn: () => void, cls = '') => h('button', { class: `btn small ${cls}`, title, 'aria-label': title, onclick: fn }, label);
  const multiBtn = btn('☑', 'Sélection multiple : touche plusieurs calques pour les déplacer, copier, fusionner ou supprimer ensemble', () => { session.multiSelect = !session.multiSelect; if (!session.multiSelect) session.selectedIds.clear(); render(); });

  blendSel.addEventListener('change', () => setLayersProp(session.selectedLayers, 'blend', blendSel.value as GlobalCompositeOperation));
  let startOps: Array<[Layer, number]> = [];
  op.addEventListener('pointerdown', () => { startOps = session.selectedLayers.map((l) => [l, l.opacity]); });
  op.addEventListener('input', () => { session.selectedLayers.forEach((l) => { l.opacity = Number(op.value) / 100; }); bus.emit('pixels:changed'); });
  op.addEventListener('change', () => {
    const v = Number(op.value) / 100, ls = session.selectedLayers; ls.forEach((l) => { const o = startOps.find(([x]) => x === l); l.opacity = o ? o[1] : l.opacity; });
    setLayersProp(ls, 'opacity', v); bus.emit('pixels:changed');
  });

  const head = h('div', { class: 'layers-head' },
    h('div', { class: 'row' }, btn('＋', 'Nouveau calque (au-dessus du calque actif)', addLayer), btn('⧉', 'Dupliquer les calques sélectionnés', duplicateLayers),
      btn('⎘ Copier', 'Copier les calques sélectionnés', copyLayers), btn('📋 Coller', 'Coller au-dessus du calque actif (n\'efface rien)', pasteLayers)),
    h('div', { class: 'row' }, btn('▲', 'Monter', () => moveLayer(1)), btn('▼', 'Descendre', () => moveLayer(-1)), btn('⤓ Fusion', 'Fusionner les calques sélectionnés (ou avec celui du dessous)', mergeDown), btn('🗑', 'Supprimer les calques sélectionnés', deleteLayer), multiBtn, count),
    h('label', { class: 'lbl' }, 'Opacité', op), h('label', { class: 'lbl' }, 'Mode de fusion', blendSel));

  const render = (): void => {
    const f = session.frame, a = session.asset; list.replaceChildren();
    multiBtn.classList.toggle('on', session.multiSelect);
    if (!f || !a) return;
    const act = session.layer, sel = new Set(session.selectedLayers);
    count.textContent = sel.size > 1 ? `${sel.size} sélectionnés` : '';
    for (const l of [...f.layers].reverse()) {
      const th = flattenFrame({ layers: [{ ...l, visible: true, opacity: 1, blend: 'source-over' }] }, a.w, a.h); th.className = 'thumb';
      // Visibilité / verrou : s'appliquent à tout le groupe si le calque touché en fait partie.
      const group = (): Layer[] => (sel.has(l) ? [...sel] : [l]);
      list.append(h('div', {
        class: `layer${l === act ? ' active' : ''}${sel.has(l) && sel.size > 1 ? ' sel' : ''}`,
        onclick: (e: MouseEvent) => selectLayer(l, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey || session.multiSelect ? 'toggle' : 'single'),
      },
        h('button', { class: 'icon', 'aria-label': 'Visibilité', onclick: (e: Event) => { e.stopPropagation(); setLayersProp(group(), 'visible', !l.visible); } }, l.visible ? '👁' : '🚫'),
        th, h('span', { class: 'name' }, l.name),
        h('button', { class: 'icon', 'aria-label': 'Verrou', onclick: (e: Event) => { e.stopPropagation(); setLayersProp(group(), 'locked', !l.locked); } }, l.locked ? '🔒' : '🔓')));
    }
    op.value = String(Math.round((act?.opacity ?? 1) * 100)); blendSel.value = act?.blend ?? 'source-over';
  };
  host.append(head, list);
  for (const e of ['layers:changed', 'frame:changed', 'asset:selected', 'history:changed'] as const) bus.on(e, render);
  let t = 0; bus.on('pixels:changed', () => { clearTimeout(t); t = window.setTimeout(render, 250); });
  render();
}
