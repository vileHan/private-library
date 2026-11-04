// Hält das Supabase-Gratis-Projekt aktiv (siehe .github/workflows/keepalive.yml)
// und dient als schneller Verbindungstest. Gibt Benutzer/Host/Port aus – nie das Passwort.
import pg from 'pg';

const raw = process.env.SUPABASE_DB_URL || '';
try {
  const u = new URL(raw);
  console.log(`Verbindung: Benutzer "${decodeURIComponent(u.username)}" @ ${u.hostname}:${u.port || 5432}, Passwortlänge ${decodeURIComponent(u.password).length}`);
  if (!u.hostname.includes('pooler.supabase.com')) console.log('HINWEIS: Das ist nicht die "Session pooler"-Adresse (…pooler.supabase.com).');
  if (u.hostname.includes('pooler') && !decodeURIComponent(u.username).includes('.')) console.log('HINWEIS: Beim Pooler muss der Benutzer "postgres.<projekt-id>" heißen.');
  if (/[[\]]/.test(raw)) console.log('HINWEIS: Die Adresse enthält noch eckige Klammern – "[YOUR-PASSWORD]" komplett durch das Passwort ersetzen (ohne Klammern).');
} catch {
  console.log('SUPABASE_DB_URL ist keine gültige Adresse (oder fehlt).');
}

const client = new pg.Client({ connectionString: raw, ssl: { rejectUnauthorized: false } });
await client.connect();
const r = await client.query("select now() as t, to_regclass('public.works') is not null as has_works");
const works = r.rows[0].has_works ? (await client.query('select count(*) as n from works')).rows[0].n : 'Tabelle noch nicht angelegt';
console.log(`Supabase erreichbar: ${r.rows[0].t.toISOString()}, Werke: ${works}`);
if (r.rows[0].has_works) {
  const sizes = await client.query(`
    select c.relname as name, pg_size_pretty(pg_total_relation_size(c.oid)) as total,
           pg_size_pretty(pg_relation_size(c.oid)) as data
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'i')
    order by pg_total_relation_size(c.oid) desc limit 12`);
  for (const s of sizes.rows) console.log(`  ${s.name}: ${s.total} (Daten ${s.data})`);
  const db = await client.query('select pg_size_pretty(pg_database_size(current_database())) as s');
  console.log(`  Datenbank gesamt: ${db.rows[0].s}`);
}
await client.end();
