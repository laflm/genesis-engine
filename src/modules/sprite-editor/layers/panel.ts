import { bus } from '../../../core/events';
import { flattenFrame } from '../model';
import { session } from '../session';
import { h } from '../ui/dom';
import { addLayer, deleteLayer, mergeDown, moveLayer, setLayerProp } from './actions';

export function createLayersPanel(host: HTMLElement): void {
  const list = h('div', { class: 'layer-list' });
  const op = h('input', { type: 'range', min: 0, max: 100, class: 'op', 'aria-label': 'Opacité du calque' });
  const btn = (label: string, title: string, fn: () => void) => h('button', { class: 'btn small', title, onclick: fn }, label);
  let startOp = 1;
  op.addEventListener('pointerdown', () => { startOp = session.layer?.opacity ?? 1; });
  op.addEventListener('input', () => { const l = session.layer; if (l) { l.opacity = Number(op.value) / 100; bus.emit('pixels:changed'); } });
  op.addEventListener('change', () => { const l = session.layer; if (!l) return; const v = l.opacity; l.opacity = startOp; setLayerProp(l, 'opacity', v); });
  const render = (): void => {
    const f = session.frame, a = session.asset; list.replaceChildren();
    if (!f || !a) return;
    const act = session.layer;
    for (const l of [...f.layers].reverse()) {
      const th = flattenFrame({ layers: [{ ...l, visible: true, opacity: 1 }] }, a.w, a.h); th.className = 'thumb';
      list.append(h('div', { class: `layer${l === act ? ' active' : ''}`, onclick: () => { session.layerId = l.id; bus.emit('layers:changed'); } },
        h('button', { class: 'icon', 'aria-label': 'Visibilité', onclick: (e: Event) => { e.stopPropagation(); setLayerProp(l, 'visible', !l.visible); } }, l.visible ? '👁' : '🚫'),
        th, h('span', { class: 'name' }, l.name),
        h('button', { class: 'icon', 'aria-label': 'Verrou', onclick: (e: Event) => { e.stopPropagation(); setLayerProp(l, 'locked', !l.locked); } }, l.locked ? '🔒' : '🔓')));
    }
    op.value = String(Math.round((act?.opacity ?? 1) * 100));
  };
  host.append(h('div', { class: 'row' }, btn('＋', 'Nouveau calque', addLayer), btn('▲', 'Monter', () => moveLayer(1)), btn('▼', 'Descendre', () => moveLayer(-1)), btn('⤓ Fusion', 'Fusionner avec le calque du dessous', mergeDown), btn('🗑', 'Supprimer', deleteLayer)),
    h('label', { class: 'lbl' }, 'Opacité du calque', op), list);
  for (const e of ['layers:changed', 'frame:changed', 'asset:selected', 'history:changed'] as const) bus.on(e, render);
  let t = 0; bus.on('pixels:changed', () => { clearTimeout(t); t = window.setTimeout(render, 250); });
  render();
}
