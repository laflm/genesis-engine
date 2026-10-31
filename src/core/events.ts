import type { ImportReport } from '../shared/types';

/** Catalogue des événements de l'application (bus typé). Ajouter un événement = une ligne ici. */
export interface AppEvents {
  'project:changed': void;
  'asset:selected': void;
  'frame:changed': void;
  'layers:changed': void;
  'pixels:changed': void;
  'tool:changed': void;
  'selection:changed': void;
  /** Émis avant annuler/rétablir : les outils « flottants » valident leur action en cours. */
  'history:before': void;
  'color:changed': void;
  'history:changed': void;
  'view:changed': void;
  'mode:changed': void;
  'import:report': ImportReport;
  toast: string;
}

type Handler<P> = (payload: P) => void;

// ----- Nettoyage : tout ce qui est créé pendant `collectDisposers` (abonnements au bus, écouteurs window, boucles) est
// défait en un appel. Sans cela, reconstruire l'interface (ouverture d'un projet) empilerait les écouteurs : un Ctrl+Z
// annulerait alors plusieurs actions. -----
let collector: Array<() => void> | null = null;
/** Enregistre une fonction de nettoyage dans la portée en cours (sans effet hors portée). */
export const registerDisposer = (fn: () => void): void => { collector?.push(fn); };
export function collectDisposers(fn: () => void): () => void {
  const prev = collector, mine: Array<() => void> = []; collector = mine;
  try { fn(); } finally { collector = prev; }
  return () => { mine.splice(0).forEach((d) => d()); };
}
/** Écouteur sur un EventTarget global, retiré automatiquement avec la portée. */
export function listen<K extends string>(target: EventTarget, type: K, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
  target.addEventListener(type, fn, opts); registerDisposer(() => target.removeEventListener(type, fn, opts));
}

export class Bus<E extends object> {
  private map = new Map<keyof E, Set<Handler<never>>>();
  on<K extends keyof E>(k: K, fn: Handler<E[K]>): () => void {
    let set = this.map.get(k);
    if (!set) this.map.set(k, (set = new Set()));
    set.add(fn as Handler<never>);
    const off = (): void => { set.delete(fn as Handler<never>); };
    registerDisposer(off);
    return off;
  }
  emit<K extends keyof E>(k: K, ...args: E[K] extends void ? [] : [E[K]]): void {
    this.map.get(k)?.forEach((fn) => (fn as Handler<unknown>)(args[0]));
  }
}

export const bus = new Bus<AppEvents>();
