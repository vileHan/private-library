// Benutzername ↔ interne Anmeldeadresse (18.11.2026). Supabase Auth braucht eine E-Mail-Adresse; die Konten haben aber
// nur einen Benutzernamen. Erlaubt sind Buchstaben (auch Umlaute, ß, é …), Ziffern, Leerzeichen und . _ - ' –
// so heißt das Konto genau wie die Person („Anna-Lena“, „Jörg“). Groß/klein spielt beim Anmelden keine Rolle.
// Nicht erlaubt: Emojis, Anführungszeichen, Schrägstriche, @ usw. (Tastaturvarianten, Probleme im JSON-Secret).
// Die Adresse wird aus dem Namen in Hex-Schreibweise gebildet („anna“ → 616e6e61@bibliothek.invalid) – so passt
// jeder erlaubte Name in eine gültige Adresse. .invalid ist eine reservierte Endung: dorthin geht nie eine Mail.
// Gemeinsam genutzt von der App und scripts/accounts.mjs.
export const ACCOUNT_DOMAIN = 'bibliothek.invalid';
const MAX_BYTES = 32; // 32 Byte → 64 Hex-Zeichen = längster erlaubter Adressteil vor dem @

/** Anzeigeform: Leerzeichen am Rand weg, mehrere Leerzeichen zu einem, Umlaute einheitlich (NFC). */
export const cleanAccountName = (name) => String(name ?? '').normalize('NFC').trim().replace(/\s+/g, ' ')
  .replace(/[’‘ʼ´`]/g, "'").replace(/[‐‑–]/g, '-'); // iPhone-Tastatur setzt „schlaue“ Apostrophe und Striche

/** Ist der Name erlaubt? Gibt null oder einen Hinweis zurück. */
export function accountNameProblem(name) {
  const n = cleanAccountName(name);
  if (n.length < 2) return 'Der Benutzername braucht mindestens 2 Zeichen.';
  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ._'-]*$/u.test(n)) return 'Erlaubt sind Buchstaben, Ziffern, Leerzeichen und . _ - \'';
  if (new TextEncoder().encode(n.toLowerCase()).length > MAX_BYTES) return 'Der Benutzername ist zu lang.';
  return null;
}

/** Schlüssel zum Anmelden: klein geschrieben (Anna = anna); null, wenn der Name nicht erlaubt ist. */
export function normalizeAccountName(name) {
  return accountNameProblem(name) ? null : cleanAccountName(name).toLowerCase();
}

export function accountEmail(name) {
  const n = normalizeAccountName(name);
  if (!n) return null;
  const hex = Array.from(new TextEncoder().encode(n), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex}@${ACCOUNT_DOMAIN}`;
}
