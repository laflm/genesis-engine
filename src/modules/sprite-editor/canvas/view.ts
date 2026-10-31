import { CONFIG } from '../../../config';
import { bus, registerDisposer } from '../../../core/events';
import { cellRect, drawFrame, SPRITE_ANIM } from '../model';
import { drawSelectionOverlay, hasSelectionVisual } from '../selection/selection';
import { session } from '../session';
import { drawFloatOverlay, getFloating } from '../tools/lift';
import { ctxOf, makeCanvas } from './pixels';
import * as vm from './viewMath';

/** Vue principale : zoom/pan, rendu de la frame, onion skin, référence, original, guides. */
export class CanvasView {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private dirty = true;
  /** Tant que l'utilisateur n'a pas zoomé/déplacé/pivoté lui-même, la frame reste ajustée à la zone (ex. barre d'options qui change de hauteur). */
  private autoFit = true;
  private lastSize = { w: 0, h: 0 };
  private checker: CanvasPattern | null = null;
  constructor(host: HTMLElement) {
    this.el = document.createElement('canvas'); this.el.className = 'main-canvas';
    host.appendChild(this.el); this.g = this.el.getContext('2d')!;
    const ro = new ResizeObserver(() => { this.resize(); }); ro.observe(host);
    let alive = true; registerDisposer(() => { alive = false; ro.disconnect(); });
    for (const e of ['pixels:changed', 'frame:changed', 'asset:selected', 'view:changed', 'layers:changed', 'tool:changed', 'selection:changed'] as const) bus.on(e, () => this.invalidate());
    const loop = (): void => { if (!alive) return; if (hasSelectionVisual()) this.dirty = true; /* fourmis animées */ if (this.dirty) { this.dirty = false; this.render(); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const c = makeCanvas(16, 16), cg = ctxOf(c);
    cg.fillStyle = '#d9d9d9'; cg.fillRect(0, 0, 16, 16); cg.fillStyle = '#f2f2f2'; cg.fillRect(0, 0, 8, 8); cg.fillRect(8, 8, 8, 8);
    this.checker = this.g.createPattern(c, 'repeat');
  }
  invalidate(): void { this.dirty = true; }
  resize(): void {
    const r = this.el.parentElement!.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.el.width = Math.max(1, Math.round(r.width * dpr)); this.el.height = Math.max(1, Math.round(r.height * dpr));
    this.el.style.width = `${r.width}px`; this.el.style.height = `${r.height}px`;
    const old = this.lastSize; this.lastSize = { w: r.width, h: r.height };
    if (this.autoFit && session.asset) this.fit();
    else if (old.w > 0) { const v = session.view; session.view = { ...v, x: v.x + (r.width - old.w) / 2, y: v.y + (r.height - old.h) / 2 }; }   // sinon : garder le centre de la vue
    this.invalidate();
  }
  get cssSize(): { w: number; h: number } { const r = this.el.getBoundingClientRect(); return { w: r.width, h: r.height }; }

  fit(): void {
    const a = session.asset; if (!a) return;
    const { w, h } = this.cssSize, z = Math.max(CONFIG.view.minZoom, Math.min(CONFIG.view.maxZoom, Math.min((w - 24) / a.w, (h - 24) / a.h)));
    session.view = { zoom: z, x: (w - a.w * z) / 2, y: (h - a.h * z) / 2, rot: 0 };
    this.autoFit = true; bus.emit('view:changed');
  }
  /** Coordonnées écran (CSS px, relatives au canvas) → coordonnées de frame. */
  toFrame(sx: number, sy: number): { x: number; y: number } {
    return vm.toFrame(session.view, sx, sy);
  }
  zoomAt(sx: number, sy: number, factor: number): void {
    this.autoFit = false; session.view = vm.zoomAt(session.view, sx, sy, factor, CONFIG.view.minZoom, CONFIG.view.maxZoom); bus.emit('view:changed');
  }
  /** Rotation de la vue (geste à deux doigts) autour d'un point d'écran. */
  rotateAt(sx: number, sy: number, d: number): void { this.autoFit = false; session.view = vm.rotateAt(session.view, sx, sy, d); bus.emit('view:changed'); }
  /** Remet la vue droite, autour du centre de la zone de dessin. */
  resetRotation(): void { const { w, h } = this.cssSize; session.view = vm.rotateAt(session.view, w / 2, h / 2, -session.view.rot); bus.emit('view:changed'); }
  /** Petite rotation résiduelle (< seuil) : on redresse pour retrouver une vue d'aplomb. */
  snapRotation(): void {
    const deg = Math.abs((session.view.rot * 180) / Math.PI) % 360, d = Math.min(deg, 360 - deg);
    if (d > 0 && d < CONFIG.view.rotateSnapDeg) this.resetRotation();
  }
  panBy(dx: number, dy: number): void { this.autoFit = false; const v = session.view; session.view = { ...v, x: v.x + dx, y: v.y + dy }; bus.emit('view:changed'); }

  private render(): void {
    const { g } = this, dpr = this.el.width / this.cssSize.w;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#2b2d33'; g.fillRect(0, 0, this.el.width, this.el.height);
    const a = session.asset, f = session.frame; if (!a || !f) return;
    const v = session.view;
    { const c = Math.cos(v.rot) * dpr * v.zoom, sn = Math.sin(v.rot) * dpr * v.zoom; g.setTransform(c, sn, -sn, c, dpr * v.x, dpr * v.y); }
    g.imageSmoothingEnabled = v.zoom < CONFIG.view.pixelGridZoom; // lissé tant qu'on ne zoome pas très fort
    if (this.checker) { g.save(); g.scale(1 / v.zoom, 1 / v.zoom); g.fillStyle = this.checker; g.fillRect(0, 0, a.w * v.zoom, a.h * v.zoom); g.restore(); }
    // Référence : le corps du joueur derrière un équipement.
    if (session.showReference && a.spec.skinRef) {
      const body = session.project.assets.get(a.spec.skinRef), bf = body?.anims[session.anim]?.[session.frameIdx];
      if (body && bf) drawFrame(g, bf, body.w, body.h, CONFIG.reference.alpha);
    }
    // Onion skin : frames voisines.
    if (session.onion && session.frames.length > 1) {
      const n = session.frames.length;
      drawFrame(g, session.frames[(session.frameIdx - 1 + n) % n]!, a.w, a.h, CONFIG.onion.prevAlpha);
      drawFrame(g, session.frames[(session.frameIdx + 1) % n]!, a.w, a.h, CONFIG.onion.nextAlpha);
    }
    drawFrame(g, f, a.w, a.h, 1, 0, 0, getFloating());
    if (session.showOriginal && a.original) {
      const r = cellRect(a, session.adapter, session.anim, session.frameIdx);
      g.globalAlpha = CONFIG.originalOverlay.alpha; g.drawImage(a.original, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); g.globalAlpha = 1;
    }
    drawSelectionOverlay(g, v.zoom, performance.now(), CONFIG.selection.antsSpeed);
    drawFloatOverlay(g, v.zoom);
    if (session.showGuides) this.guides(g, a.w, a.h, a.spec.ax, a.spec.ay, v.zoom);
  }
  private guides(g: CanvasRenderingContext2D, w: number, h: number, ax: number | undefined, ay: number | undefined, z: number): void {
    const lw = 1.5 / z; g.lineWidth = lw;
    g.strokeStyle = CONFIG.guides.gridColor; g.strokeRect(0, 0, w, h);
    const m = CONFIG.guides.safeMarginPx; g.strokeStyle = CONFIG.guides.safeColor; g.setLineDash([4 / z, 4 / z]); g.strokeRect(m, m, w - 2 * m, h - 2 * m); g.setLineDash([]);
    if (ax != null && ay != null && session.anim !== SPRITE_ANIM) {
      g.strokeStyle = CONFIG.guides.anchorColor; const s = 8;
      g.beginPath(); g.moveTo(ax - s, ay); g.lineTo(ax + s, ay); g.moveTo(ax, ay - s); g.lineTo(ax, ay + s); g.stroke();
    }
  }
}
