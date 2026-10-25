import { Stroke } from '../brushes/stroke';
import { getBrush } from '../brushes';
import { commitPixels } from '../layers/actions';
import { bus } from '../../../core/events';
import { session } from '../session';
import { registerSpriteTool, type PointerInfo, type SpriteTool } from './registry';

function make(id: string, label: string, icon: string, shortcut: string, brushId: () => string): SpriteTool {
  let stroke: Stroke | null = null;
  const press = (p: PointerInfo): number => (p.pointerType === 'pen' ? Math.max(0.05, p.pressure) : 1);
  return {
    id, label, icon, shortcut,
    down(p) {
      const l = session.layer;
      if (!l || l.locked || !l.visible) { bus.emit('toast', l?.locked ? 'Calque verrouillé' : 'Calque masqué'); return; }
      stroke = new Stroke(l, getBrush(brushId()), session.color, session.size, session.opacity);
      stroke.add(p.x, p.y, press(p)); bus.emit('pixels:changed');
    },
    move(p) { if (stroke) { stroke.add(p.x, p.y, press(p)); bus.emit('pixels:changed'); } },
    up() { if (!stroke) return; const l = session.layer!; commitPixels(l, stroke.before, 'Trait'); stroke = null; },
    cancel() { if (stroke) { stroke.abort(); stroke = null; bus.emit('pixels:changed'); } },
  };
}
registerSpriteTool(make('brush', 'Pinceau', '✏️', 'B', () => (session.brushId === 'eraser' ? 'ink' : session.brushId)));
registerSpriteTool(make('eraser', 'Gomme', '🧽', 'E', () => 'eraser'));
