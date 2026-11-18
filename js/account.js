// Konto: Anmelden mit Benutzername + Passwort über Supabase Auth (18.11.2026). Ohne Bibliothek – nur einfache
// Abrufe an /auth/v1. Die Sitzung (Zugangs- und Erneuerungsschlüssel) liegt pro Gerät im localStorage; das Passwort
// wird nie gespeichert. Konten entstehen per Einladung (register_account) oder über den Workflow „Konten anlegen“
// (app_metadata "konto": true).
import { CONFIG } from './config.js';
import { accountEmail, accountNameProblem, cleanAccountName, normalizeAccountName } from './account-name.js';
import { readJson } from './usage.js';

const KEY = 'bibliothek-konto';
const sb = CONFIG.supabase;
const listeners = new Set();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
let session = load();
function save(s) {
  session = s;
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* egal */ }
  listeners.forEach((fn) => fn());
}

export const onAccountChange = (fn) => listeners.add(fn);

export const account = {
  get loggedIn() { return !!session?.refresh; },
  /** Anzeigename („Anna“) */
  get name() { return session?.display || session?.name || ''; },
  get userId() { return session?.userId || ''; },
  get isAdmin() { return !!session?.admin; },
  /** Erneuerung schlug endgültig fehl (z. B. Passwort zurückgesetzt) → neu anmelden; die Bücher bleiben auf dem Gerät. */
  get expired() { return !!session?.expired; },
};

function fromAuth(data, name) {
  const meta = data.user?.app_metadata || {};
  return {
    name,
    display: data.user?.user_metadata?.name || name,
    userId: data.user?.id || '',
    admin: !!meta.admin,
    konto: !!meta.konto,
    access: data.access_token,
    refresh: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

async function authCall(path, body, headers = {}) {
  const res = await fetch(`${sb.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: sb.anonKey, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await readJson(res).catch(() => null);
  return { res, data: data || {} };
}

/** Anmelden. Wirft einen Fehler mit deutscher Meldung. */
export async function login(rawName, password) {
  const name = normalizeAccountName(rawName);
  if (!name || !password) throw new Error('Bitte Benutzername und Passwort eingeben.');
  let r;
  try {
    r = await authCall('token?grant_type=password', { email: accountEmail(name), password });
  } catch {
    throw new Error('Keine Verbindung – bitte später noch einmal versuchen.');
  }
  if (r.res.status === 429) throw new Error('Zu viele Versuche. Bitte ein paar Minuten warten.');
  if (!r.res.ok || !r.data.access_token) throw new Error('Benutzername oder Passwort stimmt nicht.');
  const s = fromAuth(r.data, name);
  if (!s.konto) throw new Error('Dieses Konto ist nicht freigeschaltet.');
  save(s);
  return s;
}

let refreshing = null;
async function refresh() {
  refreshing ??= (async () => {
    try {
      const r = await authCall('token?grant_type=refresh_token', { refresh_token: session.refresh });
      if (r.res.ok && r.data.access_token) save({ ...fromAuth(r.data, session.name), expired: false });
      else if (r.res.status >= 400 && r.res.status < 500) save({ ...session, expired: true }); // ungültig → neu anmelden
      else throw new Error(`Anmeldung erneuern: Fehler ${r.res.status}`);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Gültiger Zugangsschlüssel (wird kurz vor Ablauf erneuert); null ohne Anmeldung. */
async function accessToken() {
  if (!account.loggedIn || session.expired) return null;
  if (Date.now() > session.expiresAt - 60_000) await refresh();
  return session?.expired ? null : session.access;
}

/** Datenbankfunktion als angemeldetes Konto aufrufen. */
export async function accountRpc(fn, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken();
    if (!token) throw new Error('Nicht angemeldet.');
    const res = await fetch(`${sb.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: sb.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401 && attempt === 0) { await refresh(); continue; }
    if (!res.ok) throw new Error(`Datenbank antwortet mit Fehler ${res.status}`);
    return readJson(res);
  }
  throw new Error('Nicht angemeldet.');
}

/** Eigenes Passwort ändern (mind. 8 Zeichen). */
export async function changePassword(password) {
  if (!password || password.length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.');
  const token = await accessToken();
  if (!token) throw new Error('Bitte erst neu anmelden.');
  const res = await fetch(`${sb.url}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: sb.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = (await readJson(res).catch(() => null)) || {};
  if (res.ok) return;
  if (data.error_code === 'same_password') throw new Error('Das ist schon dein Passwort.');
  if (data.error_code === 'weak_password') throw new Error('Das Passwort ist zu schwach.');
  throw new Error('Passwort konnte nicht geändert werden.');
}

/** Abmelden: Sitzung am Server beenden (wenn möglich) und auf dem Gerät vergessen. */
export async function logout() {
  const token = session?.access;
  save(null);
  if (token) {
    // scope=local: nur diese Sitzung beenden – ohne meldete Supabase alle Geräte des Kontos ab (Prüfrunde 3)
    fetch(`${sb.url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: sb.anonKey, Authorization: `Bearer ${token}` } }).catch(() => {});
  }
}

/** Einladungscode aus der Adresse …/#einladung-<code> ('' wenn keiner). */
export function inviteFromUrl(loc = window.location) {
  return (loc.hash.match(/^#einladung-([a-z0-9]{6,40})$/i) || [])[1]?.toLowerCase() || '';
}

/** Gilt der Code noch? 'frei' | 'verwendet' | 'unbekannt' | 'offline' */
export async function inviteStatus(code) {
  try {
    const res = await fetch(`${sb.url}/rest/v1/rpc/invite_status`, {
      method: 'POST', headers: { apikey: sb.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: cleanCode(code) }),
    });
    return res.ok ? await readJson(res) : 'offline';
  } catch { return 'offline'; }
}

const cleanCode = (code) => String(code || '').trim().toLowerCase().replace(/^.*#einladung-/, '').replace(/[^a-z0-9]/g, '');

/** Konto mit Einladungscode erstellen (Name und Passwort selbst gewählt) und gleich anmelden. */
export async function register(code, displayName, password) {
  const problem = accountNameProblem(displayName);
  if (problem) throw new Error(problem);
  if (!password || password.length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.');
  if (new TextEncoder().encode(password).length > 72) throw new Error('Das Passwort ist zu lang.');
  let res;
  try {
    res = await fetch(`${sb.url}/rest/v1/rpc/register_account`, {
      method: 'POST', headers: { apikey: sb.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: cleanCode(code), name: normalizeAccountName(displayName), display: cleanAccountName(displayName), password }),
    });
  } catch {
    throw new Error('Keine Verbindung – bitte später noch einmal versuchen.');
  }
  if (!res.ok) {
    const msg = (await readJson(res).catch(() => null))?.message;
    throw new Error({
      einladung: 'Diese Einladung gilt nicht (mehr). Jede Einladung funktioniert nur einmal.',
      vergeben: 'Diesen Benutzernamen gibt es schon – bitte einen anderen wählen.',
      name: 'Dieser Benutzername geht nicht. Erlaubt sind Buchstaben, Ziffern, Leerzeichen und . _ - \'',
      passwort: 'Das Passwort braucht mindestens 8 Zeichen.',
    }[msg] || 'Das Konto konnte nicht erstellt werden. Bitte später noch einmal versuchen.');
  }
  return login(displayName, password);
}
