// Eigene Daten (besitze / gelesen / Bewertung) lokal im Browser (IndexedDB).
const DB_NAME = 'bibliothek';
const STORE = 'books';
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'key' });
      s.createIndex('isbn', 'isbns', { multiEntry: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export const store = {
  getAll: () => tx('readonly', (s) => s.getAll()),
  put: (entry) => tx('readwrite', (s) => s.put({ ...entry, updatedAt: new Date().toISOString() })),
  remove: (key) => tx('readwrite', (s) => s.delete(key)),
  clear: () => tx('readwrite', (s) => s.clear()),
};

/** Legt aus einem Werk einen Bibliothekseintrag an (Momentaufnahme der Daten, damit alles offline sichtbar bleibt). */
export function entryFromWork(work, existing) {
  return {
    key: existing?.key || work.key,
    title: work.title,
    sortTitle: work.sortTitle || work.title,
    subtitle: work.subtitle || existing?.subtitle || '',
    authors: work.authors,
    authorSort: work.authorSort,
    year: work.year,
    genre: work.genre || existing?.genre || '',
    publisher: work.publisher || existing?.publisher || '',
    series: work.series || '',
    volume: work.volume || '',
    isbns: [...new Set([...(existing?.isbns || []), ...work.isbns])],
    coverIsbns: work.coverIsbns?.length ? work.coverIsbns.slice(0, 6) : existing?.coverIsbns || [],
    coverIds: work.coverIds?.length ? work.coverIds : existing?.coverIds || [],
    fromDb: !!(work.fromDb || existing?.fromDb),
    editions: work.editions?.length ? work.editions : existing?.editions || [],
    owned: existing?.owned ?? false,
    read: existing?.read ?? false,
    readAt: existing?.readAt ?? null,      // Datum „YYYY-MM-DD“
    wish: existing?.wish ?? false,         // Merkliste / „Will ich lesen“
    rating: existing?.rating ?? null,      // 1–5
    notes: existing?.notes ?? '',
    tags: existing?.tags ?? [],            // eigene Regale
    ownedIsbns: ownedIsbnsOf(existing),
    addedAt: existing?.addedAt || new Date().toISOString(),
  };
}

/** Welche Ausgaben (ISBNs) besitze ich? Ältere Einträge hatten nur ein Feld ownedIsbn. */
export function ownedIsbnsOf(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.ownedIsbns)) return entry.ownedIsbns;
  return entry.ownedIsbn ? [entry.ownedIsbn] : [];
}

/** Export als JSON-Datei (Backup). */
export async function exportJson() {
  const books = await store.getAll();
  return JSON.stringify({ app: 'private-library', version: 1, exportedAt: new Date().toISOString(), books }, null, 2);
}

/** Import: neuere Einträge (updatedAt) gewinnen. Gibt die Anzahl übernommener Einträge zurück. */
export async function importJson(text) {
  const data = JSON.parse(text);
  if (data.app !== 'private-library' || !Array.isArray(data.books)) throw new Error('Keine gültige Sicherungsdatei.');
  const current = new Map((await store.getAll()).map((b) => [b.key, b]));
  let n = 0;
  await tx('readwrite', (s) => {
    for (const b of data.books) {
      if (!b?.key) continue;
      const cur = current.get(b.key);
      if (!cur || (b.updatedAt || '') > (cur.updatedAt || '')) { s.put(b); n++; }
    }
  });
  return n;
}
