/** Archivos de documentos en IndexedDB (los metadatos y el hash viven en la base). */
const DB_NAME = 'agromatch-comex-files';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export function saveFile(key: string, blob: Blob): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(blob, key));
}

export function loadFile(key: string): Promise<Blob | undefined> {
  return tx('readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>);
}

export function clearFiles(): Promise<undefined> {
  return tx('readwrite', (s) => s.clear() as IDBRequest<undefined>);
}

export async function fileSha256(blob: Blob): Promise<string> {
  const { sha256HexSync } = await import('@/integrations/stellar/terms');
  return sha256HexSync(new Uint8Array(await blob.arrayBuffer()));
}
