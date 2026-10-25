import type { ImportReport } from '../shared/types';

/** Catalogue des événements de l'application (bus typé). Ajouter un événement = une ligne ici. */
export interface AppEvents {
  'project:changed': void;
  'asset:selected': void;
  'frame:changed': void;
  'layers:changed': void;
  'pixels:changed': void;
  'tool:changed': void;
  'color:changed': void;
  'history:changed': void;
  'view:changed': void;
  'mode:changed': void;
  'import:report': ImportReport;
  toast: string;
}

type Handler<P> = (payload: P) => void;

export class Bus<E extends object> {
  private map = new Map<keyof E, Set<Handler<never>>>();
  on<K extends keyof E>(k: K, fn: Handler<E[K]>): () => void {
    let set = this.map.get(k);
    if (!set) this.map.set(k, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => { set.delete(fn as Handler<never>); };
  }
  emit<K extends keyof E>(k: K, ...args: E[K] extends void ? [] : [E[K]]): void {
    this.map.get(k)?.forEach((fn) => (fn as Handler<unknown>)(args[0]));
  }
}

export const bus = new Bus<AppEvents>();
