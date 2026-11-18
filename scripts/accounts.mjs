// Konten anlegen (Workflow „Konten anlegen“, .github/workflows/accounts.yml), 18.11.2026.
// Liest das GitHub-Secret KONTEN – ein JSON-Objekt:
//   { "jan": { "pw": "…", "admin": true }, "anna": { "pw": "…" }, "ben": "…", "alt": null }
// Schlüssel = Benutzername (klein, a–z 0–9 . _ -), Wert = Startpasswort (Text) oder { pw, admin, name }; null = Konto löschen.
// Das Passwort wird nur gesetzt, wenn das Konto neu ist oder sich das Passwort IM SECRET geändert hat – ändert jemand
// sein Passwort in der App, überschreibt ein neuer Lauf es also nicht. Zurücksetzen = Passwort im Secret ändern + Lauf.
// Konten entstehen direkt in Supabase Auth (Tabellen auth.users/auth.identities), es wird keine E-Mail verschickt.
// Ins Log kommen nur Anzahlen – keine Namen, keine Passwörter (die Logs sind öffentlich).
// Am Ende ein Selbsttest mit einem Wegwerf-Konto: Anmelden, Bücher hochladen/abholen, Nutzung melden, Löschen.
import pg from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { CONFIG } from '../js/config.js';
import { ACCOUNT_DOMAIN } from '../js/account-name.js';

let konten;
try {
  konten = JSON.parse(process.env.KONTEN || '{}');
} catch {
  console.log('KONTEN ist kein gültiges JSON.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const mark = (name, pw) => createHash('sha256').update(`${name}\n${pw}`).digest('hex').slice(0, 16);
const emailOf = (name) => `${name}@${ACCOUNT_DOMAIN}`;

async function upsertAccount(name, { pw, admin = false, display = '' }) {
  const email = emailOf(name);
  const meta = { provider: 'email', providers: ['email'], konto: true, admin: !!admin, pwmark: mark(name, pw) };
  const found = (await client.query('select id, raw_app_meta_data m from auth.users where email = $1', [email])).rows[0];
  if (!found) {
    const id = (await client.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new, email_change)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1,
         extensions.crypt($2, extensions.gen_salt('bf')), now(), $3, $4, now(), now(), '', '', '', '')
       returning id`,
      [email, pw, meta, { name: display || name }],
    )).rows[0].id;
    await client.query(
      `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1, $1::text, $2, 'email', now(), now(), now())`,
      [id, { sub: id, email, email_verified: true }],
    );
    return 'neu';
  }
  const pwChanged = found.m?.pwmark !== meta.pwmark;
  await client.query(
    `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || $2::jsonb,
       raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || $3::jsonb,
       encrypted_password = case when $4 then extensions.crypt($5, extensions.gen_salt('bf')) else encrypted_password end,
       updated_at = now()
     where id = $1`,
    [found.id, meta, { name: display || name }, pwChanged, pw],
  );
  return pwChanged ? 'passwort' : 'gleich';
}

const count = { neu: 0, passwort: 0, gleich: 0, geloescht: 0, ungueltig: 0 };
for (const [rawName, value] of Object.entries(konten)) {
  const name = rawName.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,30}$/.test(name)) { count.ungueltig++; continue; }
  if (value === null) {
    const r = await client.query('delete from auth.users where email = $1', [emailOf(name)]);
    count.geloescht += r.rowCount;
    continue;
  }
  const v = typeof value === 'string' ? { pw: value } : value;
  if (!v || typeof v.pw !== 'string' || v.pw.length < 8) { count.ungueltig++; continue; }
  count[await upsertAccount(name, { pw: v.pw, admin: v.admin, display: typeof v.name === 'string' ? v.name : '' })]++;
}
console.log(`Konten: ${count.neu} neu, ${count.passwort} Passwort neu gesetzt, ${count.gleich} unverändert, ` +
  `${count.geloescht} gelöscht, ${count.ungueltig} ungültig (Name a–z/0–9, 2–30 Zeichen; Passwort mind. 8 Zeichen).`);
const total = (await client.query(
  `select count(*)::int n, count(*) filter (where (raw_app_meta_data->>'admin')::boolean)::int a
   from auth.users where (raw_app_meta_data->>'konto')::boolean`)).rows[0];
console.log(`Konten in der Datenbank: ${total.n}, davon Verwalter: ${total.a}`);

// ---------- Selbsttest ----------
const sb = CONFIG.supabase;
const testName = `selbsttest-${randomBytes(4).toString('hex')}`;
const testPw = randomBytes(18).toString('base64url');
let ok = true;
const step = (label, cond) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) ok = false; };
try {
  await upsertAccount(testName, { pw: testPw });
  const login = await fetch(`${sb.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: sb.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailOf(testName), password: testPw }),
  });
  const session = await login.json();
  step(`Anmelden (Status ${login.status}${session.error_code ? `, ${session.error_code}` : ''})`, login.ok && !!session.access_token);
  const wrong = await fetch(`${sb.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: sb.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailOf(testName), password: 'falsch-falsch' }),
  });
  step(`Falsches Passwort abgelehnt (Status ${wrong.status})`, wrong.status === 400);
  if (session.access_token) {
    const call = async (fn, body, token = session.access_token) => {
      const r = await fetch(`${sb.url}/rest/v1/rpc/${fn}`, {
        method: 'POST', headers: { apikey: sb.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    const t1 = new Date(Date.now() - 60000).toISOString();
    const t2 = new Date().toISOString();
    const p1 = await call('push_books', { items: [{ key: 'test|a', data: { title: 'A', owned: true }, changed_at: t2 }, { key: 'test|b', data: null, changed_at: t2 }] });
    step(`Bücher hochladen (Status ${p1.status}, ${p1.body} Zeilen)`, p1.status === 200 && p1.body === 2);
    const p2 = await call('push_books', { items: [{ key: 'test|a', data: { title: 'A alt' }, changed_at: t1 }] });
    step('Älterer Stand überschreibt nicht', p2.status === 200 && p2.body === 0);
    const pull = await call('pull_books', { since: null });
    const a = pull.body?.items?.find((i) => i.key === 'test|a');
    step(`Bücher abholen (${pull.body?.items?.length} Einträge)`, pull.status === 200 && a?.data?.title === 'A' && pull.body.items.length === 2);
    const pullLater = await call('pull_books', { since: pull.body?.now });
    step('Abholen seit letztem Abgleich liefert nichts Neues', pullLater.status === 200 && pullLater.body?.items?.length === 0);
    const day = t2.slice(0, 10);
    const u = await call('report_usage', { device: 'test', days: [{ day, bytes: 1234, requests: 3, searches: 1 }] });
    const stored = (await client.query('select bytes from usage_daily d join auth.users u on u.id = d.user_id where u.email = $1', [emailOf(testName)])).rows[0];
    step(`Nutzung melden (Status ${u.status})`, (u.status === 204 || u.status === 200) && Number(stored?.bytes) === 1234);
    const ov = await call('usage_overview', {});
    step(`Übersicht ohne Verwalter-Recht abgelehnt (Status ${ov.status})`, ov.status >= 400);
    const anon = await call('pull_books', { since: null }, sb.anonKey);
    step(`Ohne Anmeldung kein Zugriff (Status ${anon.status})`, anon.status >= 400);
    await client.query(`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"admin":true}' where email = $1`, [emailOf(testName)]);
    const relog = await (await fetch(`${sb.url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: sb.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailOf(testName), password: testPw }),
    })).json();
    const ov2 = await call('usage_overview', {}, relog.access_token);
    step(`Übersicht als Verwalter (${Array.isArray(ov2.body) ? ov2.body.length : '?'} Konten)`, ov2.status === 200 && Array.isArray(ov2.body));
  }
} catch (err) {
  step(`Selbsttest abgebrochen: ${err.message}`, false);
} finally {
  await client.query('delete from auth.users where email = $1', [emailOf(testName)]);
}
await client.end();
console.log(ok ? 'Selbsttest bestanden.' : 'Selbsttest FEHLGESCHLAGEN.');
if (!ok) process.exit(1);
