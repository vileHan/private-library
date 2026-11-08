// Diagnose: zeigt Abfragepläne (EXPLAIN ANALYZE) und Indexgrößen – nur lesend (Transaktion READ ONLY).
// Workflow „Diagnose“ (.github/workflows/diagnose.yml). Eigene Abfragen über die Eingabe „sql“ (je Zeile eine;
// „explain …“ zeigt den Abfrageplan, sonst das Ergebnis).
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query('begin read only');
await client.query("set local statement_timeout = '60s'");

const sizes = await client.query(`
  select c.relname, pg_size_pretty(pg_relation_size(c.oid)) as size
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'i') order by pg_relation_size(c.oid) desc limit 12`);
console.log('Größen:');
for (const r of sizes.rows) console.log(`  ${r.relname}: ${r.size}`);
console.log(`Datenbank: ${(await client.query('select pg_size_pretty(pg_database_size(current_database())) s')).rows[0].s}`);

const queries = (process.env.SQL || '').split('\n').map((s) => s.trim()).filter(Boolean);
if (!queries.length) {
  queries.push(
    "explain select id, title from browse_genre('Fantasy', 50, 0)",
    "select genre_group(genre) g, count(*) from works group by 1 order by 2 desc",
  );
}
for (const q of queries) {
  console.log(`\n=== ${q}`);
  try {
    if (/^\s*explain\s/i.test(q)) {
      const plan = await client.query(`explain (analyze, buffers, verbose) ${q.replace(/^\s*explain\s+/i, '')}`);
      for (const r of plan.rows) console.log('  ' + r['QUERY PLAN']);
    } else {
      const res = await client.query(q);
      console.log('  ' + res.fields.map((f) => f.name).join(' | '));
      for (const r of res.rows) console.log('  ' + Object.values(r).map((v) => (Array.isArray(v) ? v.join(',') : v)).join(' | '));
    }
  } catch (err) {
    console.log(`  Fehler: ${err.message}`);
    await client.query('rollback'); await client.query('begin read only');
  }
}
await client.query('rollback');
await client.end();
