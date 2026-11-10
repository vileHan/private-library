// Zustand der eigenen Bibliothek im Speicher + Änderungen speichern.
import { store, entryFromWork } from './store.js';
import { settings } from './settings.js';

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
  return !e.owned && !e.read && !e.wish && !e.abandoned && e.rating == null && !e.notes?.trim() && !e.tags?.length;
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

/**
 * Buchdaten eines eigenen Eintrags auffrischen (Titel, Jahr, Reihe, Genre, Cover …), ohne die eigenen Angaben
 * anzufassen. Hintergrund: Ein per Barcode markiertes Buch speichert die Daten der einen gescannten Ausgabe
 * (Rewitched: Taschenbuch 2026), die Datenbank kennt das ganze Werk (erste Ausgabe 2025). Nur mit Werken
 * aus der Datenbank aufrufen. Schreibt nur, wenn sich etwas geändert hat.
 */
const META = ['title', 'sortTitle', 'subtitle', 'authors', 'authorSort', 'year', 'genre', 'series', 'volume', 'isbns', 'coverIds'];
export async function refreshEntry(work) {
  const existing = entryFor(work);
  if (!existing) return;
  const fresh = entryFromWork(work, existing);
  if (META.every((k) => JSON.stringify(fresh[k] ?? null) === JSON.stringify(existing[k] ?? null))) return;
  await store.put(fresh);
  library.byKey.set(fresh.key, fresh);
  for (const i of fresh.isbns || []) library.byIsbn.set(i, fresh.key);
}

/**
 * Alle eigenen Einträge aus dem Katalog auffrischen (Band, Reihe, Titel, Jahr, Cover …) – bisher geschah das nur,
 * wenn ein Buch zufällig in einer Suche auftauchte; ältere Einträge zeigten dann z. B. keinen Band (Nutzer 10.11.2026).
 * Läuft beim Start im Hintergrund, höchstens alle 12 Stunden. Gibt die Zahl geänderter Einträge zurück.
 */
export async function refreshAllFromDb(worksByKeys, { force = false } = {}) {
  const last = settings.get('lastRefresh', 0);
  if (!force && Date.now() - last < 12 * 3600 * 1000) return 0;
  const entries = [...library.byKey.values()]; // auch per ISBN gescannte: gleicher Werkschlüssel wie im Katalog
  if (!entries.length) return 0;
  const works = await worksByKeys(entries.map((e) => e.key));
  let changed = 0;
  for (const w of works) {
    const before = JSON.stringify(library.byKey.get(w.key));
    await refreshEntry(w);
    if (JSON.stringify(library.byKey.get(w.key)) !== before) changed++;
  }
  settings.set('lastRefresh', Date.now());
  if (changed) await loadLibrary();
  return changed;
}

/** Alle Regale, alphabetisch: vergebene Schlagworte plus leer angelegte Regale („+ Regal“ in Meine Bücher). */
export function allTags() {
  const tags = new Set(settings.get('shelves', []));
  for (const e of library.byKey.values()) for (const t of e.tags || []) tags.add(t);
  return [...tags].sort((a, b) => a.localeCompare(b, 'de'));
}

/** Regal umbenennen: in allen Einträgen und in der Liste der leeren Regale. */
export async function renameShelf(oldName, newName) {
  const t = newName.trim();
  if (!t || t === oldName) return oldName;
  for (const e of [...library.byKey.values()]) {
    if ((e.tags || []).includes(oldName)) await updateEntry(e, (x) => { x.tags = [...new Set(x.tags.map((y) => (y === oldName ? t : y)))]; });
  }
  settings.set('shelves', [...new Set(settings.get('shelves', []).map((s) => (s === oldName ? t : s)))]);
  return t;
}

/** Regal löschen: Die Bücher bleiben, nur die Zuordnung verschwindet (Einträge ohne sonstige Angaben fallen weg). */
export async function deleteShelf(name) {
  for (const e of [...library.byKey.values()]) {
    if ((e.tags || []).includes(name)) await updateEntry(e, (x) => { x.tags = x.tags.filter((y) => y !== name); });
  }
  settings.set('shelves', settings.get('shelves', []).filter((s) => s !== name));
}

/** Leeres Regal anlegen (pro Gerät gespeichert, bis ein Buch hineinkommt). */
export function addShelf(name) {
  const t = name.trim();
  if (!t) return '';
  const list = settings.get('shelves', []);
  if (!list.includes(t)) settings.set('shelves', [...list, t]);
  return t;
}
