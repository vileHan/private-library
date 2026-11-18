// Datennutzung zählen (18.11.2026): Wie viel lädt die App von Supabase? Je Tag: Bytes, Abrufe, Suchen.
// Angemeldete Konten melden die Summen an die Datenbank (sync.js → report_usage); nur der Verwalter sieht die Übersicht.
// Gezählt wird der ausgepackte Antworttext plus ~300 Byte Kopfzeilen je Abruf – eher etwas zu hoch als zu niedrig.
// Cover (Amazon/Google/Open Library) und DNB-Abrufe laufen nicht über Supabase und zählen nicht.
const KEY = 'bibliothek-nutzung';
const HEADER_BYTES = 300;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* egal */ }
}
const today = () => new Date().toISOString().slice(0, 10);

function add(field, n) {
  const data = load();
  data.days ??= {};
  const d = (data.days[today()] ??= { bytes: 0, requests: 0, searches: 0 });
  d[field] += n;
  // Nur die letzten 45 Tage behalten
  const keys = Object.keys(data.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 45))) delete data.days[k];
  save(data);
}

/** Antwort von Supabase lesen und dabei mitzählen. Leere Antwort → null. */
export async function readJson(res) {
  const text = await res.text();
  add('bytes', text.length + HEADER_BYTES);
  add('requests', 1);
  return text ? JSON.parse(text) : null;
}

export const countSearch = () => add('searches', 1);

/** Zufällige Gerätekennung (nur für die Zählung, damit zwei Geräte eines Kontos sich nicht überschreiben). */
export function deviceId() {
  const data = load();
  if (!data.device) {
    data.device = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
    save(data);
  }
  return data.device;
}

/** Die letzten 7 Tage zum Melden: [{ day, bytes, requests, searches }]. */
export function recentDays() {
  const days = load().days || {};
  return Object.keys(days).sort().slice(-7).map((day) => ({ day, ...days[day] }));
}
