// Tiny promise wrapper around IndexedDB.
//   books, logs, quotes, lists, loans — one record per item (keyPath: id)
//   settings — user preferences, single record { key: 'settings', ... }
//   meta     — internal app state (last backup, dismissed banners) { key, value }

const DB_NAME = 'geekbook';
const DB_VERSION = 1;
export const DATA_STORES = ['books', 'logs', 'quotes', 'lists', 'loans'];
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of DATA_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});
const result = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function getAll(store) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}
export async function get(store, key) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).get(key));
}
export async function put(store, value) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return done(tx);
}
/** Write several records, possibly across stores, in one transaction: [[store, value], ...] */
export async function putAll(pairs) {
  if (!pairs.length) return;
  const db = await open();
  const names = [...new Set(pairs.map((p) => p[0]))];
  const tx = db.transaction(names, 'readwrite');
  for (const [s, v] of pairs) tx.objectStore(s).put(v);
  return done(tx);
}
export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export async function setMeta(key, value) {
  return put('meta', { key, value });
}
