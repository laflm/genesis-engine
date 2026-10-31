import { bus } from '../../../core/events';
import { cellRect, flattenFrame, SPRITE_ANIM } from '../model';
import { copyFrame, clearFrame, pasteFrame, revertFrame } from '../layers/actions';
import { session } from '../session';
import { h } from '../ui/dom';

/** Une ligne par animation du jeu (onglets) + frames en miniatures + copier/coller. */
export function createTimeline(host: HTMLElement): void {
  const tabs = h('div', { class: 'tl-tabs' }), thumbs = h('div', { class: 'tl-frames' });
  const tool = (label: string, title: string, fn: () => void) => h('button', { class: 'btn small', title, onclick: fn }, label);
  const onion = h('button', { class: 'btn small', title: 'Onion skin (frames voisines)', onclick: () => { session.onion = !session.onion; bus.emit('view:changed'); render(); } }, '🧅');
  const orig = h('button', { class: 'btn small', title: 'Superposer l\'original importé', onclick: () => { session.showOriginal = !session.showOriginal; bus.emit('view:changed'); render(); } }, '⇄ Original');
  const actions = h('div', { class: 'tl-actions' },
    tool('⏮', 'Frame précédente', () => session.setFrame(session.frameIdx - 1)), tool('⏭', 'Frame suivante', () => session.setFrame(session.frameIdx + 1)),
    onion, orig, tool('⧉ Copier', 'Copier la frame (tous ses calques)', copyFrame), tool('⎘ Coller', 'Coller : AJOUTE les calques copiés au-dessus du calque actif, sans rien effacer', pasteFrame), tool('∅ Vider', 'Vider la frame', clearFrame),
    tool('↺ Original', 'Revenir à l\'original pour cette frame', () => {
      const a = session.asset; if (!a?.original) return;
      revertFrame(() => { const r = cellRect(a, session.adapter, session.anim, session.frameIdx); const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; c.getContext('2d')!.drawImage(a.original!, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); return c; });
    }));
  const render = (): void => {
    const a = session.asset; tabs.replaceChildren(); thumbs.replaceChildren();
    onion.classList.toggle('on', session.onion); orig.classList.toggle('on', session.showOriginal);
    if (!a) return;
    if (!a.spec.kind.startsWith('sheet')) { thumbs.append(h('span', { class: 'hint' }, 'Image unique (pas d\'animation).')); return; }
    for (const [name, d] of Object.entries(session.adapter.anims)) tabs.append(h('button', { class: `btn tab${name === session.anim ? ' active' : ''}`, onclick: () => session.setAnim(name) }, `${name} · ${d.frames}`));
    session.frames.forEach((f, i) => {
      const c = flattenFrame(f, a.w, a.h); c.className = 'frame-thumb';
      thumbs.append(h('button', { class: `fthumb${i === session.frameIdx ? ' active' : ''}`, 'aria-label': `Frame ${i + 1}`, onclick: () => session.setFrame(i) }, c, h('span', {}, String(i + 1))));
    });
  };
  host.append(tabs, thumbs, actions);
  for (const e of ['frame:changed', 'asset:selected', 'history:changed', 'layers:changed'] as const) bus.on(e, render);
  let t = 0; bus.on('pixels:changed', () => { clearTimeout(t); t = window.setTimeout(render, 200); });
  void SPRITE_ANIM; render();
}
