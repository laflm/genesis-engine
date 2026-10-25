import { CONFIG } from '../config';

export interface Command { label: string; undo(): void; redo(): void }

/** Historique d'annulation/rétablissement générique (aucune dépendance au dessin). */
export class History {
  private past: Command[] = [];
  private future: Command[] = [];
  constructor(private onChange: () => void = () => {}, private depth: number = CONFIG.undoDepth) {}

  /** Enregistre une commande DÉJÀ exécutée. */
  push(cmd: Command): void {
    this.past.push(cmd);
    if (this.past.length > this.depth) this.past.shift();
    this.future = [];
    this.onChange();
  }
  undo(): boolean {
    const c = this.past.pop();
    if (!c) return false;
    c.undo(); this.future.push(c); this.onChange(); return true;
  }
  redo(): boolean {
    const c = this.future.pop();
    if (!c) return false;
    c.redo(); this.past.push(c); this.onChange(); return true;
  }
  clear(): void { this.past = []; this.future = []; this.onChange(); }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get size(): number { return this.past.length; }
}
