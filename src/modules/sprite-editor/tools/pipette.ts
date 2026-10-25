import { bus } from '../../../core/events';
import { ctxOf } from '../canvas/pixels';
import { flattenFrame } from '../model';
import { session } from '../session';
import { registerSpriteTool, type PointerInfo } from './registry';

const hex = (n: number): string => n.toString(16).padStart(2, '0');

/** Prélève la couleur visible (tous calques) à un point de la frame. Utilisé aussi par l'appui long. */
export function pickColor(p: Pick<PointerInfo, 'x' | 'y'>): boolean {
  const f = session.frame, a = session.asset; if (!f || !a) return false;
  const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= a.w || y >= a.h) return false;
  const d = ctxOf(flattenFrame(f, a.w, a.h)).getImageData(x, y, 1, 1).data;
  if (d[3] === 0) return false;
  session.color = `#${hex(d[0]!)}${hex(d[1]!)}${hex(d[2]!)}`; bus.emit('color:changed'); return true;
}
registerSpriteTool({ id: 'pipette', label: 'Pipette', icon: '💧', shortcut: 'I', down: (p) => { pickColor(p); }, move: (p) => { pickColor(p); }, up() {}, cancel() {} });
