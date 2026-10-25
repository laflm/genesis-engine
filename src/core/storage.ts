import { CONFIG } from '../config';

// Stockage clé/valeur binaire dans IndexedDB (projets, HTML du jeu…).
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(CONFIG.storage.dbName, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const r = fn(db.transaction('kv', mode).objectStore('kv'));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export const storage = {
  put: (key: string, value: Uint8Array | string) => tx('readwrite', (s) => s.put(value, key)).then(() => undefined),
  get: <T extends Uint8Array | string>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  del: (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined),
};
