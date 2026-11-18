// Abgleich der eigenen Bücher mit dem Konto (18.11.2026).
// Bücher: Jeder Eintrag trägt den Zeitpunkt seiner letzten EIGENEN Änderung (changedAt). Je Buch gewinnt der neuere
// Stand – auf dem Server (push_books lehnt Älteres ab und schickt den Serverstand zurück) wie auf dem Gerät. Gelöschte
// Einträge werden als „data: null“ übertragen, damit sie auch auf den anderen Geräten verschwinden.
// Einstellungen (leere Regale, Jahresziele, Geschenk, „Gruß gesehen“): je Feld ein eigener Eintrag
// „~einstellungen.<feld>“. Hat das Gerät ein Feld geändert und im Konto ist inzwischen ein neuerer Stand, wird
// zusammengeführt (Regale/Jahresziele: eigene Zu- und Abgänge seit dem letzten Abgleich auf den Kontostand anwenden),
// statt den Kontostand zu überschreiben (Prüfrunde 2: ein veraltetes Gerät löschte sonst das Geschenk im ganzen Konto).
// Ablauf: 1. abholen, was seit dem letzten Abgleich am Server ankam, 2. eigene Änderungen hochladen.
import { store } from './store.js';
import { settings } from './settings.js';
import { library, loadLibrary, onUserChange } from './library.js';
import { account, accountRpc, onAccountChange } from './account.js';
import { deviceId, recentDays } from './usage.js';

const KEY = 'bibliothek-abgleich';
const FIELD_PREFIX = '~einstellungen.';
const EPOCH = new Date(0).toISOString();
const FIELDS = { shelves: [], readingGoals: {}, gift: null, giftSeen: false }; // Feld → Standardwert
const listeners = new Set();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* egal */ }
}
const ms = (t) => (t ? Date.parse(t) || 0 : 0);
const iso = (t) => new Date(t).toISOString();
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v ?? null;
}

/** Wird nach jedem Abgleich aufgerufen: fn({ changed, giftChanged, error }) */
export const onSync = (fn) => listeners.add(fn);
export const syncState = () => load();
export const hasPending = () => {
  const s = load();
  return Object.keys(s.dirty || {}).length > 0 || Object.keys(s.fdirty || {}).length > 0;
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
  if (applyingRemote || !account.loggedIn || !(name in FIELDS)) return;
  const s = load();
  s.fdirty = { ...(s.fdirty || {}), [name]: new Date().toISOString() };
  save(s);
  scheduleSync();
});

/** Alle Einträge dieses Geräts zum Hochladen vormerken (erste Anmeldung, Import einer Sicherung). */
export async function markAllDirty() {
  const s = load();
  s.dirty = { ...(s.dirty || {}) };
  for (const e of [...library.byKey.values()]) {
    // Ohne changedAt (Einträge von vor den Konten) zählt der Zeitpunkt des Hinzufügens: Er füllt Lücken im Konto, gewinnt
    // aber nicht gegen spätere echte Änderungen. updatedAt taugt nicht – das setzt auch das Auffrischen der Buchdaten.
    // Auch lokal setzen, damit der eigene Stand beim nächsten Abholen als „gleich“ erkannt wird (Prüfrunde 2).
    if (!e.changedAt) {
      const fixed = { ...e, changedAt: e.addedAt || EPOCH };
      await store.putRaw(fixed);
      library.byKey.set(e.key, fixed);
    }
    s.dirty[e.key] ??= library.byKey.get(e.key).changedAt;
  }
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

let giftChanged = false;

async function doSync() {
  let changed = 0;
  let fieldsChanged = false; // Einstellungen zählen in der Meldung als eine Änderung
  try {
    const state = load();
    const first = !state.cursor;

    // 1. Abholen (30 s Überlappung: Änderungen, die gerade parallel gespeichert wurden, nicht verpassen)
    const since = state.cursor ? iso(ms(state.cursor) - 30_000) : null;
    const res = await accountRpc('pull_books', { since });
    for (const item of res.items || []) {
      if (item.key.startsWith('~')) { if (applyField(item)) fieldsChanged = true; continue; }
      const local = library.byKey.get(item.key);
      const pending = load().dirty?.[item.key];
      const localTime = Math.max(ms(local?.changedAt), ms(pending));
      if (ms(item.changed_at) <= localTime) continue; // eigener Stand ist neuer oder gleich (z. B. eigener Upload)
      if (await applyRemote(item)) changed++;
      if (pending) { const s = load(); delete s.dirty[item.key]; save(s); } // älterer eigener Stand: nicht mehr hochladen
    }

    // 2. Hochladen (in Paketen zu 200)
    const now = load();
    const dirty = { ...(now.dirty || {}) };
    const fdirty = { ...(now.fdirty || {}) };
    const items = Object.entries(dirty).map(([key, changedAt]) => ({ key, data: packEntry(library.byKey.get(key)), changed_at: changedAt }));
    const pushedFields = {};
    for (const [f, t] of Object.entries(fdirty)) {
      pushedFields[f] = settings.get(f, FIELDS[f]);
      items.push({ key: FIELD_PREFIX + f, data: { v: pushedFields[f] }, changed_at: t });
    }
    const rejected = [];
    for (let i = 0; i < items.length; i += 200) {
      const r = await accountRpc('push_books', { items: items.slice(i, i + 200) });
      rejected.push(...(r?.rejected || []));
    }
    // Erledigt – außer was sich während des Hochladens schon wieder geändert hat
    const after = load();
    after.dirty ||= {};
    after.fdirty ||= {};
    for (const [key, t] of Object.entries(dirty)) if (after.dirty[key] === t) delete after.dirty[key];
    const rejectedKeys = new Set(rejected.map((r) => r.key));
    for (const [f, t] of Object.entries(fdirty)) {
      // abgelehnt: vorgemerkt lassen, damit applyField unten zusammenführt (statt den eigenen Stand zu verwerfen)
      if (after.fdirty[f] !== t || rejectedKeys.has(FIELD_PREFIX + f)) continue;
      delete after.fdirty[f];
      after.base = { ...(after.base || {}), [f]: pushedFields[f] }; // eigener Stand ist jetzt der Kontostand
      after.ftime = { ...(after.ftime || {}), [f]: t };
    }
    save(after);

    // Abgelehnt = Server hat einen neueren (oder gleich alten, anderen) Stand → übernehmen bzw. zusammenführen
    // (Prüfrunde 1: sonst blieben Geräte bei Uhrabweichung oder nach dem Abholfenster dauerhaft verschieden)
    for (const item of rejected) {
      if (item.key.startsWith('~')) { if (applyField(item, true)) fieldsChanged = true; continue; }
      if (ms(item.changed_at) < ms(load().dirty?.[item.key])) continue; // inzwischen schon wieder geändert
      if (await applyRemote(item)) changed++;
    }

    if (fieldsChanged) changed++;
    const done = load();
    done.cursor = res.now;
    done.lastSync = new Date().toISOString();
    save(done);
    if (changed) await loadLibrary();
    if (Object.keys(done.fdirty || {}).length) scheduleSync(300); // Zusammengeführtes gleich hochladen
    reportUsage();
    listeners.forEach((fn) => fn({ changed, giftChanged, first }));
    giftChanged = false;
    return changed;
  } catch (error) {
    listeners.forEach((fn) => fn({ changed, error }));
    throw error;
  }
}

/** Stand vom Server aufs Gerät übernehmen (Buch speichern oder löschen). true = etwas geändert. */
async function applyRemote(item) {
  const local = library.byKey.get(item.key);
  if (item.data == null) {
    if (!local) return false;
    await store.remove(item.key);
    library.byKey.delete(item.key);
    return true;
  }
  const entry = { ...item.data, key: item.key, changedAt: item.changed_at, updatedAt: new Date().toISOString() };
  await store.putRaw(entry);
  library.byKey.set(item.key, entry);
  return true;
}

/** Eintrag für den Server: ohne Felder, die nur dieses Gerät betreffen. */
function packEntry(e) {
  if (!e) return null;
  const { updatedAt, changedAt, ...rest } = e; // eslint-disable-line no-unused-vars
  return rest;
}

/**
 * Einstellungsfeld aus dem Konto übernehmen. Hat das Gerät das Feld selbst geändert (fdirty), wird zusammengeführt
 * und der zusammengeführte Stand später hochgeladen. force = abgelehnter Upload (Konto ist neuer). true = geändert.
 */
function applyField(item, force = false) {
  const f = item.key.slice(FIELD_PREFIX.length);
  if (!item.key.startsWith(FIELD_PREFIX) || !(f in FIELDS)) return false; // unbekannt (z. B. alter Sammeleintrag)
  const s = load();
  if (!force && ms(item.changed_at) <= ms(s.ftime?.[f])) return false; // schon bekannt (oder eigener Upload)
  const remote = clean(f, item.data?.v);
  const mine = settings.get(f, FIELDS[f]);
  const base = s.base && f in s.base ? s.base[f] : FIELDS[f];
  const localChanged = !!s.fdirty?.[f];
  const result = localChanged ? merge(f, base, mine, remote) : remote;

  s.base = { ...(s.base || {}), [f]: remote };
  s.ftime = { ...(s.ftime || {}), [f]: item.changed_at };
  s.fdirty ||= {};
  if (localChanged) {
    if (same(result, remote)) delete s.fdirty[f];
    else s.fdirty[f] = iso(Math.max(Date.now(), ms(item.changed_at) + 1)); // muss neuer sein als der Kontostand
  }
  save(s);
  if (same(result, mine)) return false;
  applyingRemote = true;
  try {
    if (f === 'gift') takeGift(result);
    else settings.set(f, result);
    if (f === 'giftSeen') giftChanged = true;
  } finally {
    applyingRemote = false;
  }
  return true;
}

function clean(f, v) {
  if (f === 'shelves') return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  if (f === 'readingGoals') return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  if (f === 'gift') return v && typeof v.n === 'string' ? v : null;
  return !!v;
}

/** Eigene Änderungen seit dem letzten Abgleich (base → mine) auf den Kontostand (remote) anwenden. */
function merge(f, base, mine, remote) {
  if (f === 'shelves') {
    const added = mine.filter((x) => !base.includes(x));
    const removed = new Set(base.filter((x) => !mine.includes(x)));
    return [...new Set([...remote, ...added])].filter((x) => !removed.has(x));
  }
  if (f === 'readingGoals') {
    const out = { ...remote };
    for (const y of new Set([...Object.keys(mine), ...Object.keys(base)])) {
      if (mine[y] === base[y]) continue;
      if (mine[y] == null) delete out[y];
      else out[y] = mine[y];
    }
    return out;
  }
  if (f === 'giftSeen') return mine || remote;
  return mine; // Geschenk: die eigene, ausdrückliche Änderung gilt (Link geöffnet oder „entfernen“)
}

function takeGift(gift) {
  const hadGift = !!settings.get('gift', null);
  settings.set('gift', gift);
  if (gift && !hadGift && gift.c) settings.set('accent', gift.c); // Farbe des Geschenks, wie beim Öffnen des Links
  giftChanged = true;
}

let lastReport = 0;
function reportUsage() {
  if (Date.now() - lastReport < 10 * 60_000) return; // höchstens alle 10 Minuten
  lastReport = Date.now();
  accountRpc('report_usage', { device: deviceId(), days: recentDays() }).catch(() => {});
}

/**
 * Nach dem Anmelden: Bücher und Einstellungen dieses Geräts vormerken und alles abgleichen. Einstellungen werden mit
 * dem Konto zusammengeführt (Regale vereinigt, Jahresziele ergänzt; ein Geschenk des Geräts bleibt).
 * Gibt { fromAccount, fromDevice } zurück (für die Meldung).
 */
export async function firstSync() {
  const s = load();
  delete s.cursor;
  s.base = {};
  s.ftime = {};
  s.fdirty = {};
  for (const f of Object.keys(FIELDS)) {
    if (!same(settings.get(f, FIELDS[f]), FIELDS[f])) s.fdirty[f] = iso(1); // verliert gegen jeden Kontostand → wird zusammengeführt
  }
  save(s);
  await markAllDirty();
  const fromDevice = Object.keys(load().dirty || {}).length;
  const fromAccount = await syncNow();
  return { fromAccount, fromDevice };
}

/** Abmelden: Bücher, Regale und Jahresziele von diesem Gerät entfernen (sie liegen im Konto). Das Geschenk bleibt. */
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
