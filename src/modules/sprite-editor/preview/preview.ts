import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import type { AnimState } from '../../../shared/types';
import { drawFrame, type Asset } from '../model';
import { session } from '../session';
import { h } from '../ui/dom';

type Pose = 'idle' | 'walk' | 'attack' | 'hurt';
const POSES: Record<Pose, (t: number) => AnimState> = {
  idle: () => ({ swing: 0, hit: 0, vx: 0 }),
  walk: () => ({ swing: 0, hit: 0, vx: 100 }),
  // swing décroît de 0,25 à 0 comme dans le jeu, en boucle.
  attack: (t) => ({ swing: Math.max(0.001, CONFIG.preview.maxSwing - ((t % 0.45) / 0.45) * CONFIG.preview.maxSwing), hit: 0, vx: 0 }),
  hurt: () => ({ swing: 0, hit: 1, vx: 0 }),
};

/** Aperçu en direct : même choix d'animation que le jeu, corps + équipements superposés dans l'ordre des layers. */
export function createPreview(host: HTMLElement): { redraw(): void } {
  const adapter = session.adapter;
  let pose: Pose = 'idle';
  const equip: Record<string, string> = {};
  const cv = h('canvas', { class: 'preview-canvas', width: CONFIG.preview.canvasPx, height: CONFIG.preview.canvasPx });
  const zoomIn = h('input', { type: 'range', min: Math.round(CONFIG.preview.zoomMin * 100), max: Math.round(CONFIG.preview.zoomMax * 100), value: 100, 'aria-label': 'Zoom de l\'aperçu' });
  const bodySel = h('select', { 'aria-label': 'Corps' });
  const poseBar = h('div', { class: 'row' }, ...(Object.keys(POSES) as Pose[]).map((p) => h('button', { class: 'btn small pose', 'data-pose': p, onclick: () => { pose = p; syncPose(); } }, p)));
  const slots = h('div', { class: 'equip' });
  const syncPose = (): void => poseBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-pose') === pose));

  const rebuild = (): void => {
    const skins = [...session.project.assets.values()].filter((a) => a.spec.group === 'skin');
    const cur = bodySel.value; bodySel.replaceChildren(...skins.map((s) => h('option', { value: s.key }, s.spec.label)));
    if (skins.some((s) => s.key === cur)) bodySel.value = cur;
    slots.replaceChildren(...adapter.slots.map((slot) => {
      const items = [...session.project.assets.values()].filter((a) => a.spec.group === 'item' && a.spec.slot === slot);
      const sel = h('select', { 'aria-label': slot }, h('option', { value: '' }, `${slot} : —`), ...items.map((i) => h('option', { value: i.key, selected: equip[slot] === i.key }, i.spec.label)));
      sel.addEventListener('change', () => { if (sel.value) equip[slot] = sel.value; else delete equip[slot]; });
      return sel;
    }));
  };
  let last = performance.now(), t = 0;
  const drawSheet = (g: CanvasRenderingContext2D, a: Asset, anim: string, fr: number): void => {
    const f = a.anims[anim]?.[fr]; if (!f) return;
    drawFrame(g, f, a.w, a.h, 1, -(a.spec.ax ?? a.w / 2), -(a.spec.ay ?? a.h));
  };
  const loop = (now: number): void => {
    t += (now - last) / 1000; last = now;
    const g = cv.getContext('2d')!, W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = CONFIG.preview.background; g.fillRect(0, 0, W, H);
    const body = session.project.assets.get(bodySel.value);
    if (body && body.spec.kind === 'sheet') {
      // Échelle = la FRAME ENTIÈRE tient dans le canvas (tête, armes et attaque comprises) ; le curseur ajuste ensuite.
      const m = CONFIG.preview.marginPx, fit = Math.min((W - 2 * m) / body.w, (H - 2 * m) / body.h), s = fit * (Number(zoomIn.value) / 100);
      const ax = body.spec.ax ?? body.w / 2, ay = body.spec.ay ?? body.h;
      const ox = W / 2 - (body.w / 2 - ax) * s, oy = H / 2 - (body.h / 2 - ay) * s;   // point d'ancrage (pieds) à l'écran
      g.strokeStyle = '#00000022'; g.lineWidth = 1; g.strokeRect(W / 2 - (body.w * s) / 2, H / 2 - (body.h * s) / 2, body.w * s, body.h * s);
      g.fillStyle = '#0002'; g.beginPath(); g.ellipse(ox, oy, 38 * s, 9 * s, 0, 0, Math.PI * 2); g.fill();   // ombre au sol
      const st = POSES[pose](t), anim = adapter.selectAnimation(st), fr = adapter.frameFor(anim, t, st.swing);
      g.setTransform(s, 0, 0, s, ox, oy); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      // Le corps d'abord, puis les équipements dans l'ordre de l'adaptateur (layerOrder).
      drawSheet(g, body, anim, fr);
      for (const slot of adapter.layerOrder) { const it = equip[slot] ? session.project.assets.get(equip[slot]!) : undefined; if (it) drawSheet(g, it, anim, fr); }
    }
    requestAnimationFrame(loop);
  };
  host.append(h('div', { class: 'row' }, h('label', {}, 'Corps ', bodySel)), poseBar, cv, h('label', { class: 'lbl' }, 'Zoom', zoomIn), slots);
  for (const e of ['project:changed', 'asset:selected'] as const) bus.on(e, rebuild);
  rebuild(); syncPose(); requestAnimationFrame(loop);
  return { redraw: rebuild };
}
