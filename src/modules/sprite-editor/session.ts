import { CONFIG } from '../../config';
import { bus } from '../../core/events';
import { History } from '../../core/undo';
import type { GameAdapter } from '../../shared/types';
import { SPRITE_ANIM, type Asset, type Frame, type Layer } from './model';
import { Project } from './project';

/** État vivant de l'éditeur. Les modules lisent/écrivent ici et réagissent via le bus d'événements. */
export class Session {
  project: Project;
  history = new History(() => bus.emit('history:changed'));
  assetKey: string | null = null;
  anim = 'idle';
  frameIdx = 0;
  layerId: number | null = null;
  toolId = 'brush';
  previousToolId = 'brush';
  brushId = 'ink';
  color: string = CONFIG.brush.defaultColor;
  size: number = CONFIG.brush.defaultSize;
  opacity: number = CONFIG.brush.defaultOpacity;
  fillTolerance: number = CONFIG.fill.tolerance;
  onion = false;
  showOriginal = false;
  showGuides = true;
  showReference = true;
  moveAllLayers = false;
  mode: string = CONFIG.modes[0].id;
  clipboard: Frame | null = null;
  /** Appelés avant annuler/rétablir (ex. valider une transformation en cours). */
  beforeHistory: Array<() => void> = [];
  view: { zoom: number; x: number; y: number } = { zoom: CONFIG.view.defaultZoom, x: 0, y: 0 };

  constructor(public adapter: GameAdapter, project?: Project) { this.project = project ?? new Project(adapter); }

  get asset(): Asset | undefined { return this.assetKey ? this.project.assets.get(this.assetKey) : undefined; }
  get frames(): Frame[] { return this.asset?.anims[this.anim] ?? []; }
  get frame(): Frame | undefined { return this.frames[this.frameIdx]; }
  get layer(): Layer | undefined {
    const f = this.frame; if (!f) return undefined;
    return f.layers.find((l) => l.id === this.layerId) ?? f.layers[f.layers.length - 1];
  }

  undo(): boolean { this.beforeHistory.forEach((f) => f()); return this.history.undo(); }
  redo(): boolean { this.beforeHistory.forEach((f) => f()); return this.history.redo(); }

  select(key: string | null): void {
    this.assetKey = key;
    const a = key ? this.project.ensure(key) : undefined;
    this.anim = a ? (a.anims[this.anim] ? this.anim : Object.keys(a.anims)[0]!) : this.anim;
    this.frameIdx = 0; this.layerId = null;
    bus.emit('asset:selected'); bus.emit('project:changed');
  }
  setAnim(anim: string): void { this.anim = anim; this.frameIdx = 0; this.layerId = null; bus.emit('frame:changed'); }
  setFrame(i: number): void {
    const n = this.frames.length; if (!n) return;
    this.frameIdx = (i + n) % n; this.layerId = null; bus.emit('frame:changed');
  }
  /** Marque l'asset comme modifié (impacte l'export partiel) et prévient les autres modules. */
  touch(a: Asset | undefined = this.asset): void {
    if (a && a.status === 'imported') a.status = 'edited';
    bus.emit('pixels:changed'); bus.emit('project:changed');
  }
  isSprite(): boolean { return this.anim === SPRITE_ANIM; }
}

export let session: Session;
export const setSession = (s: Session): void => { session = s; };
