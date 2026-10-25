import { CONFIG } from '../../../config';
import { bus } from '../../../core/events';
import { session } from '../session';
import { h } from '../ui/dom';

export function hsvToHex(hh: number, s: number, v: number): string {
  const f = (n: number): number => { const k = (n + hh / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
export function hexToHsv(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const hue = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, mx === 0 ? 0 : d / mx, mx];
}

function loadSaved(): string[] {
  try { const v = JSON.parse(localStorage.getItem(CONFIG.palettes.storageKey) ?? 'null') as string[] | null; if (Array.isArray(v)) return v; } catch { /* ignore */ }
  return [...CONFIG.palettes.defaults];
}
const save = (p: string[]): void => { try { localStorage.setItem(CONFIG.palettes.storageKey, JSON.stringify(p)); } catch { /* quota */ } };

/** Sélecteur de couleur (carré saturation/luminosité + teinte) et palettes enregistrables. */
export function createPicker(host: HTMLElement): void {
  let [hue, sat, val] = hexToHsv(session.color);
  const sv = h('canvas', { class: 'sv', width: 220, height: 140 });
  const hueIn = h('input', { type: 'range', min: 0, max: 360, value: Math.round(hue), class: 'hue', 'aria-label': 'Teinte' });
  const hex = h('input', { type: 'text', class: 'hex', value: session.color, maxlength: 7, 'aria-label': 'Couleur hexadécimale' });
  const swatches = h('div', { class: 'swatches' });
  let palette = loadSaved();

  const drawSV = (): void => {
    const g = sv.getContext('2d')!, w = sv.width, hh = sv.height;
    g.fillStyle = hsvToHex(hue, 1, 1); g.fillRect(0, 0, w, hh);
    const wg = g.createLinearGradient(0, 0, w, 0); wg.addColorStop(0, '#fff'); wg.addColorStop(1, '#fff0'); g.fillStyle = wg; g.fillRect(0, 0, w, hh);
    const bg = g.createLinearGradient(0, 0, 0, hh); bg.addColorStop(0, '#0000'); bg.addColorStop(1, '#000'); g.fillStyle = bg; g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(sat * w, (1 - val) * hh, 7, 0, 7); g.stroke();
    g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.arc(sat * w, (1 - val) * hh, 8.5, 0, 7); g.stroke();
  };
  const set = (): void => { session.color = hsvToHex(hue, sat, val); hex.value = session.color; drawSV(); bus.emit('color:changed'); };
  const pickSV = (e: PointerEvent): void => { const r = sv.getBoundingClientRect(); sat = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); val = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); set(); };
  sv.style.touchAction = 'none';
  sv.addEventListener('pointerdown', (e) => { sv.setPointerCapture(e.pointerId); pickSV(e); });
  sv.addEventListener('pointermove', (e) => { if (sv.hasPointerCapture(e.pointerId)) pickSV(e); });
  hueIn.addEventListener('input', () => { hue = Number(hueIn.value); set(); });
  hex.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { [hue, sat, val] = hexToHsv(hex.value); hueIn.value = String(Math.round(hue)); set(); } });

  const renderSw = (): void => {
    swatches.replaceChildren(...palette.map((c, i) => {
      const b = h('button', { class: 'sw', style: `background:${c}`, 'aria-label': c, onclick: () => { session.color = c; [hue, sat, val] = hexToHsv(c); hueIn.value = String(Math.round(hue)); hex.value = c; drawSV(); bus.emit('color:changed'); } });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); palette.splice(i, 1); save(palette); renderSw(); });
      return b;
    }));
  };
  const add = h('button', { class: 'btn small', onclick: () => { if (!palette.includes(session.color)) { palette.push(session.color); save(palette); renderSw(); } } }, '+ Palette');
  const del = h('button', { class: 'btn small', title: 'Supprime la couleur courante de la palette', onclick: () => { palette = palette.filter((c) => c !== session.color); save(palette); renderSw(); } }, '− Retirer');
  bus.on('color:changed', () => { if (hex.value !== session.color) { hex.value = session.color; [hue, sat, val] = hexToHsv(session.color); hueIn.value = String(Math.round(hue)); drawSV(); } });
  host.append(sv, hueIn, h('div', { class: 'row' }, hex, add, del), swatches);
  renderSw(); drawSV();
}
