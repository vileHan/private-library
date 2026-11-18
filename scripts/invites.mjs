// Einladungen speichern (Workflow „Einladungen anlegen“, .github/workflows/invites.yml), 18.11.2026.
// Eingabe HASHES: durch Komma/Leerzeichen getrennte SHA-256-Werte der Einladungscodes; „admin:“ davor = Verwalter-Einladung.
// Die Codes selbst kennt nur der Verwalter (tools/einladungen.ps1) – die Hash-Werte dürfen öffentlich im Log stehen,
// aus ihnen lässt sich kein Code zurückrechnen.
// Danach ein Selbsttest: Einladung anlegen → Konto per register_account erstellen (Name mit Umlaut) → anmelden →
// Code ein zweites Mal / Name doppelt / falscher Code abgelehnt → Abgleich → aufräumen.
import pg from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { CONFIG } from '../js/config.js';
import { accountEmail, normalizeAccountName } from '../js/account-name.js';

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const sha = (s) => createHash('sha256').update(s).digest('hex');

let added = 0;
let bad = 0;
for (const raw of (process.env.HASHES || '').split(/[\s,]+/).filter(Boolean)) {
  const admin = raw.startsWith('admin:');
  const hash = raw.replace(/^admin:/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) { bad++; continue; }
  const r = await client.query('insert into invites (hash, admin) values ($1, $2) on conflict (hash) do nothing', [hash, admin]);
  added += r.rowCount;
}
console.log(`Einladungen: ${added} neu, ${bad} ungültig.`);
const st = (await client.query(`select count(*) filter (where used_at is null)::int frei, count(*) filter (where used_at is not null)::int verwendet,
  count(*) filter (where admin and used_at is null)::int frei_admin from invites`)).rows[0];
console.log(`Stand: ${st.frei} offen (davon Verwalter: ${st.frei_admin}), ${st.verwendet} verwendet.`);

// ---------- Selbsttest ----------
const sb = CONFIG.supabase;
const H = { apikey: sb.anonKey, 'Content-Type': 'application/json' };
const code = randomBytes(9).toString('base64url');
const display = `Test Jörg ${randomBytes(2).toString('hex')}`;
const name = normalizeAccountName(display);
const pw = randomBytes(15).toString('base64url');
let ok = true;
const step = (label, cond) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) ok = false; };
const rpc = async (fn, body, token) => {
  const r = await fetch(`${sb.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...H, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
try {
  await client.query('insert into invites (hash) values ($1)', [sha(code)]);
  step('Einladung prüfen: frei', (await rpc('invite_status', { code })).body === 'frei');
  step('Unbekannter Code', (await rpc('invite_status', { code: 'gibtsnicht' })).body === 'unbekannt');
  const weak = await rpc('register_account', { code, name, display, password: 'kurz' });
  step(`Zu kurzes Passwort abgelehnt (${weak.body?.message})`, weak.status >= 400 && weak.body?.message === 'passwort');
  const reg = await rpc('register_account', { code, name, display, password: pw });
  step(`Konto erstellt (Status ${reg.status}${reg.body?.message ? `, ${reg.body.message}` : ''})`, reg.status === 204 || reg.status === 200);
  step('Einladung danach verwendet', (await rpc('invite_status', { code })).body === 'verwendet');
  const again = await rpc('register_account', { code, name: 'anderer', display: 'Anderer', password: pw });
  step(`Code ein zweites Mal abgelehnt (${again.body?.message})`, again.body?.message === 'einladung');
  const code2 = randomBytes(9).toString('base64url');
  await client.query('insert into invites (hash) values ($1)', [sha(code2)]);
  const dup = await rpc('register_account', { code: code2, name, display, password: pw });
  step(`Vergebener Name abgelehnt (${dup.body?.message})`, dup.body?.message === 'vergeben');
  step('Code bleibt bei Fehler gültig', (await rpc('invite_status', { code: code2 })).body === 'frei');
  const badName = await rpc('register_account', { code: code2, name: 'a@b', display: 'a@b', password: pw });
  step(`Ungültiger Name abgelehnt (${badName.body?.message})`, badName.body?.message === 'name');
  await client.query('delete from invites where hash = $1', [sha(code2)]);
  const login = await fetch(`${sb.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: H, body: JSON.stringify({ email: accountEmail(display.toUpperCase()), password: pw }),
  });
  const s = await login.json();
  step(`Anmelden (Status ${login.status})`, login.ok && s.user?.app_metadata?.konto === true && s.user?.app_metadata?.admin === false);
  step(`Anzeigename erhalten (${s.user?.user_metadata?.name === display ? 'gleich' : 'abweichend'})`, s.user?.user_metadata?.name === display);
  if (s.access_token) {
    const t = new Date().toISOString();
    const p = await rpc('push_books', { items: [{ key: 'test|x', data: { title: 'X', owned: true }, changed_at: t }] }, s.access_token);
    const q = await rpc('pull_books', { since: null }, s.access_token);
    step('Abgleich mit neuem Konto', p.body === 1 && q.body?.items?.length === 1);
  }
} catch (err) {
  step(`Selbsttest abgebrochen: ${err.message}`, false);
} finally {
  await client.query('delete from auth.users where email = $1', [accountEmail(display)]);
  await client.query('delete from invites where hash = $1', [sha(code)]);
}
await client.end();
console.log(ok ? 'Selbsttest bestanden.' : 'Selbsttest FEHLGESCHLAGEN.');
if (!ok) process.exit(1);
