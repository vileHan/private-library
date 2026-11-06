// Cover-IDs: liest den Open-Library-Datenexport (alle Ausgaben, ~10 GB gepackt) und merkt sich für jede
// deutsche ISBN (978-3…) die Cover-ID. Schreibt die Tabelle cover_map und überträgt die IDs in die Werke.
// Läuft im Workflow „Cover-IDs“ – getrennt vom Katalog-Import, weil der Download 2–5 Stunden dauern kann.
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { normalizeIsbn } = await import('../js/isbn.js');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const env = process.env;
if (!env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL fehlt (GitHub Secret anlegen).');

const url = 'https://openlibrary.org/data/ol_dump_editions_latest.txt.gz';
log('Open Library: lade Datenexport …');
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) throw new Error(`Open-Library-Export: HTTP ${res.status}`);
const lines = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity });
const covers = new Map();
let n = 0;
for await (const line of lines) {
  if (++n % 5_000_000 === 0) log(`  ${n / 1e6} Mio. Zeilen, ${covers.size} deutsche ISBNs mit Cover`);
  // Schneller Vorfilter: nur Zeilen mit Cover und einer deutschen ISBN (978-3… bzw. ISBN-10 3…)
  if (!line.includes('"covers"') || !/"(978-?3|3)[\d-]{8,}/.test(line)) continue;
  let rec;
  try { rec = JSON.parse(line.slice(line.indexOf('{'))); } catch { continue; }
  const id = (rec.covers || []).find((c) => c > 0);
  if (!id) continue;
  for (const raw of [...(rec.isbn_13 || []), ...(rec.isbn_10 || [])]) {
    const isbn = normalizeIsbn(raw);
    if (isbn?.startsWith('9783') && !covers.has(isbn)) covers.set(isbn, id);
  }
}
log(`Open Library fertig: ${covers.size} deutsche ISBNs mit Cover`);

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query('set statement_timeout = 0');
await client.query(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
const entries = [...covers.entries()];
await client.query('begin');
await client.query('truncate cover_map');
for (let i = 0; i < entries.length; i += 10000) {
  const part = entries.slice(i, i + 10000);
  await client.query('insert into cover_map (isbn, cover_id) select * from unnest($1::bigint[], $2::int[]) on conflict do nothing',
    [part.map(([isbn]) => isbn), part.map(([, id]) => id)]);
}
await client.query('commit');
log(`cover_map: ${entries.length} Einträge geschrieben`);
const applied = await client.query('select apply_cover_map() as n');
log(`Cover-IDs bei ${applied.rows[0].n} Werken aktualisiert`);
const s = await client.query(`select (select count(*) from works where cardinality(cover_ids) > 0) as mit_cover,
  (select count(*) from works) as werke, pg_size_pretty(pg_database_size(current_database())) as db`);
log(`Werke mit Cover-ID: ${s.rows[0].mit_cover} von ${s.rows[0].werke}, Datenbank ${s.rows[0].db}`);
await client.end();
