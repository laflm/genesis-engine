import { CONFIG } from '../../../config';
import { ctxOf, makeCanvas } from '../canvas/pixels';
import type { Layer } from '../model';
import type { BrushDef } from './registry';

/**
 * Un trait en cours. Les tampons sont accumulés dans deux calques temporaires (contour / remplissage) puis
 * composés sur une copie de l'état initial du calque : l'opacité s'applique au TRAIT entier (pas de cumul).
 */
export class Stroke {
  private base: HTMLCanvasElement;
  private outBuf: HTMLCanvasElement;
  private fillBuf: HTMLCanvasElement;
  private last: { x: number; y: number; p: number } | null = null;
  readonly before: ImageData;
  constructor(private layer: Layer, private brush: BrushDef, private color: string, private size: number, private opacity: number) {
    const { width: w, height: h } = layer.canvas;
    this.before = ctxOf(layer.canvas).getImageData(0, 0, w, h);
    this.base = makeCanvas(w, h); ctxOf(this.base).putImageData(this.before, 0, 0);
    this.outBuf = makeCanvas(w, h); this.fillBuf = makeCanvas(w, h);
  }
  private stamp(x: number, y: number, p: number): void {
    const r = this.brush.radius(this.size, p);
    const o = Math.max(CONFIG.brush.inkOutlineMinPx, this.size * CONFIG.brush.inkOutlineRatio);
    if (this.brush.outline) { const g = ctxOf(this.outBuf); g.fillStyle = CONFIG.brush.inkOutlineColor; g.beginPath(); g.arc(x, y, r + o, 0, Math.PI * 2); g.fill(); }
    const f = ctxOf(this.fillBuf); f.fillStyle = this.brush.erase ? '#000' : this.color; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill();
  }
  add(x: number, y: number, p: number): void {
    const step = Math.max(0.5, this.size * CONFIG.brush.spacing);
    if (!this.last) this.stamp(x, y, p);
    else {
      const dx = x - this.last.x, dy = y - this.last.y, d = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(d / step));
      for (let i = 1; i <= n; i++) this.stamp(this.last.x + (dx * i) / n, this.last.y + (dy * i) / n, this.last.p + ((p - this.last.p) * i) / n);
    }
    this.last = { x, y, p };
    this.render();
  }
  private render(): void {
    const g = ctxOf(this.layer.canvas), { width: w, height: h } = this.layer.canvas;
    g.clearRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(this.base, 0, 0);
    g.globalAlpha = this.opacity;
    if (this.brush.erase) { g.globalCompositeOperation = 'destination-out'; g.drawImage(this.fillBuf, 0, 0); }
    else { if (this.brush.outline) g.drawImage(this.outBuf, 0, 0); g.drawImage(this.fillBuf, 0, 0); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  /** Annule le trait sans laisser de trace. */
  abort(): void { ctxOf(this.layer.canvas).putImageData(this.before, 0, 0); }
}
