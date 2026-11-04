// Zustand der eigenen Bibliothek im Speicher + Änderungen speichern.
import { store, entryFromWork } from './store.js';

export const library = { byKey: new Map(), byIsbn: new Map() };
const listeners = new Set();

/** Wird nach jeder Änderung aufgerufen (z. B. Zähler im Tab aktualisieren). */
export function onLibraryChange(fn) { listeners.add(fn); }

export async function loadLibrary() {
  const all = await store.getAll();
  library.byKey = new Map(all.map((e) => [e.key, e]));
  library.byIsbn = new Map();
  for (const e of all) for (const i of e.isbns || []) library.byIsbn.set(i, e.key);
  listeners.forEach((fn) => fn());
}

/** Findet den eigenen Eintrag zu einem Werk – über den Werkschlüssel oder eine gemeinsame ISBN. */
export function entryFor(work) {
  const direct = library.byKey.get(work.key);
  if (direct) return direct;
  for (const i of work.isbns || []) {
    const k = library.byIsbn.get(i);
    if (k) return library.byKey.get(k);
  }
  return null;
}

/** Ein Eintrag ohne jede Markierung wird gelöscht. */
function isEmpty(e) {
  return !e.owned && !e.read && !e.wish && e.rating == null && !e.notes?.trim() && !e.tags?.length;
}

export async function updateEntry(work, change) {
  const existing = entryFor(work);
  const entry = entryFromWork(work, existing);
  change(entry);
  if (isEmpty(entry)) await store.remove(entry.key);
  else await store.put(entry);
  await loadLibrary();
  return entryFor(work);
}

/** Alle vergebenen Regale (Schlagworte), alphabetisch. */
export function allTags() {
  const tags = new Set();
  for (const e of library.byKey.values()) for (const t of e.tags || []) tags.add(t);
  return [...tags].sort((a, b) => a.localeCompare(b, 'de'));
}
