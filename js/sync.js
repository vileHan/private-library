// Abgleich der eigenen Bücher mit dem Konto (18.11.2026).
// Grundsatz: Jeder Eintrag trägt den Zeitpunkt seiner letzten EIGENEN Änderung (changedAt). Beim Abgleich gewinnt
// je Buch der neuere Stand – auf dem Server (push_books) wie auf dem Gerät (unten). Gelöschte Einträge werden als
// „data: null“ übertragen, damit sie auch auf den anderen Geräten verschwinden.
// Ablauf: 1. eigene Änderungen hochladen, 2. alles abholen, was seit dem letzten Abgleich am Server ankam.
// Regale ohne Bücher und Jahresziele reisen als Eintrag „~einstellungen“ mit.
import { store } from './store.js';
import { settings } from './settings.js';
import { library, loadLibrary, onUserChange } from './library.js';
import { account, accountRpc, onAccountChange } from './account.js';
import { deviceId, recentDays } from './usage.js';

const KEY = 'bibliothek-abgleich';
const SETTINGS_KEY = '~einstellungen';
const SYNCED_SETTINGS = ['shelves', 'readingGoals'];
const listeners = new Set();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* egal */ }
}
const ms = (t) => (t ? Date.parse(t) || 0 : 0);

/** Wird nach jedem Abgleich aufgerufen: fn({ changed, error }) */
export const onSync = (fn) => listeners.add(fn);
export const syncState = () => load();
export const hasPending = () => {
  const s = load();
  return Object.keys(s.dirty || {}).length > 0 || !!s.settingsDirty;
};

function markDirty(key, changedAt) {
  if (!account.loggedIn) return;
  const s = load();
  s.dirty = { ...(s.dirty || {}), [key]: changedAt };
  save(s);
  scheduleSync();
}

let applyingRemote = false;
onUserChange((key, changedAt) => markDirty(key, changedAt));
settings.onSet((name) => {
  if (applyingRemote || !account.loggedIn || !SYNCED_SETTINGS.includes(name)) return;
  const s = load();
  s.settingsDirty = new Date().toISOString();
  save(s);
  scheduleSync();
});

/** Alle Einträge dieses Geräts zum Hochladen vormerken (erste Anmeldung, Import einer Sicherung). */
export function markAllDirty() {
  const s = load();
  s.dirty = { ...(s.dirty || {}) };
  for (const e of library.byKey.values()) s.dirty[e.key] ??= e.changedAt || e.updatedAt || e.addedAt || new Date(0).toISOString();
  save(s);
}

let timer = null;
export function scheduleSync(delay = 1500) {
  if (!account.loggedIn) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow().catch(() => {}), delay);
}

let running = null;
/** Jetzt abgleichen. Gibt die Zahl der vom Konto übernommenen Änderungen zurück. */
export function syncNow() {
  if (!account.loggedIn || account.expired) return Promise.resolve(0);
  if (running) return running.then(() => syncNow()); // läuft schon: danach noch einmal (neue Änderungen)
  running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  let changed = 0;
  try {
    const state = load();
    const first = !state.cursor;

    // 1. Hochladen (in Paketen zu 200)
    const dirty = { ...(state.dirty || {}) };
    const items = Object.entries(dirty).map(([key, changedAt]) => ({ key, data: packEntry(library.byKey.get(key)), changed_at: changedAt }));
    if (state.settingsDirty) items.push({ key: SETTINGS_KEY, data: packSettings(), changed_at: state.settingsDirty });
    for (let i = 0; i < items.length; i += 200) await accountRpc('push_books', { items: items.slice(i, i + 200) });
    // Erledigt – außer was sich während des Hochladens schon wieder geändert hat
    const after = load();
    for (const [key, t] of Object.entries(dirty)) if (after.dirty?.[key] === t) delete after.dirty[key];
    if (after.settingsDirty === state.settingsDirty) delete after.settingsDirty;
    save(after);

    // 2. Abholen (30 s Überlappung: Änderungen, die gerade parallel gespeichert wurden, nicht verpassen)
    const since = state.cursor ? new Date(ms(state.cursor) - 30_000).toISOString() : null;
    const res = await accountRpc('pull_books', { since });
    const pending = load().dirty || {};
    for (const item of res.items || []) {
      if (item.key === SETTINGS_KEY) { if (applySettings(item, first)) changed++; continue; }
      const local = library.byKey.get(item.key);
      const localTime = Math.max(ms(local?.changedAt), ms(pending[item.key]));
      if (ms(item.changed_at) <= localTime) continue; // eigener Stand ist neuer oder gleich
      if (item.data == null) {
        if (local) { await store.remove(item.key); changed++; }
      } else {
        await store.putRaw({ ...item.data, key: item.key, changedAt: item.changed_at, updatedAt: new Date().toISOString() });
        changed++;
      }
    }
    const done = load();
    done.cursor = res.now;
    done.lastSync = new Date().toISOString();
    save(done);
    if (changed) await loadLibrary();
    reportUsage();
    listeners.forEach((fn) => fn({ changed }));
    return changed;
  } catch (error) {
    listeners.forEach((fn) => fn({ changed, error }));
    throw error;
  }
}

/** Eintrag für den Server: ohne Felder, die nur dieses Gerät betreffen. */
function packEntry(e) {
  if (!e) return null;
  const { updatedAt, changedAt, ...rest } = e; // eslint-disable-line no-unused-vars
  return rest;
}

function packSettings() {
  return { shelves: settings.get('shelves', []), readingGoals: settings.get('readingGoals', {}) };
}

/** Einstellungen vom Konto übernehmen. Bei der ersten Anmeldung zusammenführen statt ersetzen. */
function applySettings(item, first) {
  const s = load();
  const data = item.data || {};
  if (!first && ms(item.changed_at) <= ms(s.settingsDirty || s.settingsTime)) return false;
  applyingRemote = true;
  try {
    const shelves = Array.isArray(data.shelves) ? data.shelves.filter((x) => typeof x === 'string') : [];
    const goals = data.readingGoals && typeof data.readingGoals === 'object' ? data.readingGoals : {};
    if (first) {
      const mineShelves = settings.get('shelves', []);
      const mineGoals = settings.get('readingGoals', {});
      const mergedShelves = [...new Set([...shelves, ...mineShelves])];
      const mergedGoals = { ...goals, ...mineGoals };
      settings.set('shelves', mergedShelves);
      settings.set('readingGoals', mergedGoals);
      // Etwas vom Gerät dazugekommen? Dann den zusammengeführten Stand wieder hochladen.
      if (mergedShelves.length !== shelves.length || Object.keys(mergedGoals).length !== Object.keys(goals).length) {
        const t = load();
        t.settingsDirty = new Date().toISOString();
        save(t);
        scheduleSync();
      }
    } else {
      settings.set('shelves', shelves);
      settings.set('readingGoals', goals);
    }
  } finally {
    applyingRemote = false;
  }
  const t = load();
  t.settingsTime = item.changed_at;
  save(t);
  return true;
}

let lastReport = 0;
function reportUsage() {
  if (Date.now() - lastReport < 10 * 60_000) return; // höchstens alle 10 Minuten
  lastReport = Date.now();
  accountRpc('report_usage', { device: deviceId(), days: recentDays() }).catch(() => {});
}

/**
 * Nach dem Anmelden: Bücher dieses Geräts vormerken und alles abgleichen.
 * Gibt { fromAccount, fromDevice } zurück (für die Meldung).
 */
export async function firstSync() {
  const s = load();
  delete s.cursor;
  save(s);
  markAllDirty();
  const fromDevice = Object.keys(load().dirty || {}).length;
  if (settings.get('shelves', []).length || Object.keys(settings.get('readingGoals', {})).length) {
    const t = load();
    t.settingsDirty = new Date(1).toISOString(); // verliert gegen jeden Stand im Konto, wird aber zusammengeführt
    save(t);
  }
  const fromAccount = await syncNow();
  return { fromAccount, fromDevice };
}

/** Abmelden: Bücher, Regale und Jahresziele von diesem Gerät entfernen (sie liegen im Konto). */
export async function clearLocalAfterLogout() {
  await store.clear();
  save({});
  applyingRemote = true;
  try {
    settings.set('shelves', []);
    settings.set('readingGoals', {});
    settings.set('libSeen', []);
  } finally {
    applyingRemote = false;
  }
  await loadLibrary();
}

// Abgleich anstoßen: beim Zurückkehren in die App (höchstens alle 30 s) und wenn das Netz wieder da ist
let lastVisible = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || Date.now() - lastVisible < 30_000) return;
  lastVisible = Date.now();
  scheduleSync(300);
});
window.addEventListener('online', () => scheduleSync(500));
onAccountChange(() => { if (!account.loggedIn) clearTimeout(timer); });
