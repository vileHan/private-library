// Cover-IDs und Beliebtheit aus Open Library (Workflow „Cover-IDs“, getrennt vom Katalog-Import,
// weil der Download des Ausgaben-Exports je nach Server 2–5 Stunden dauern kann).
//
// 1. Ausgaben-Export (~10 GB gepackt): für jede deutsche ISBN (978-3…) die Cover-ID und das Open-Library-Werk
// 2. Leselisten-Export (~125 MB): je Werk zählen, wie oft es auf „Will lesen“/„Lese gerade“/„Gelesen“ steht
// 3. Tabelle cover_map (isbn, cover_id, readers) schreiben und per apply_cover_map() in die Werke übernehmen
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { normalizeIsbn } = await import('../js/isbn.js');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const env = process.env;
if (!env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL fehlt (GitHub Secret anlegen).');

async function* lines(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  yield* createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity });
}

// ---------- 1. Ausgaben: ISBN → Cover-ID und Werk ----------
log('Open Library: lade Ausgaben-Export …');
const byIsbn = new Map(); // isbn → { cover, work }
let n = 0;
for await (const line of lines('https://openlibrary.org/data/ol_dump_editions_latest.txt.gz')) {
  if (++n % 5_000_000 === 0) log(`  ${n / 1e6} Mio. Zeilen, ${byIsbn.size} deutsche ISBNs`);
  // Schneller Vorfilter: nur Zeilen mit einer deutschen ISBN (978-3… bzw. ISBN-10 3…)
  if (!/"(978-?3|3)[\d-]{8,}/.test(line)) continue;
  let rec;
  try { rec = JSON.parse(line.slice(line.indexOf('{'))); } catch { continue; }
  const cover = (rec.covers || []).find((c) => c > 0) || null;
  const work = rec.works?.[0]?.key || null;
  if (!cover && !work) continue;
  for (const raw of [...(rec.isbn_13 || []), ...(rec.isbn_10 || [])]) {
    const isbn = normalizeIsbn(raw);
    if (!isbn?.startsWith('9783')) continue;
    const prev = byIsbn.get(isbn);
    if (!prev) byIsbn.set(isbn, { cover, work });
    else { prev.cover ??= cover; prev.work ??= work; }
  }
}
log(`Ausgaben fertig: ${byIsbn.size} deutsche ISBNs, davon ${[...byIsbn.values()].filter((v) => v.cover).length} mit Cover`);

// ---------- 2. Leselisten: Einträge je Werk zählen ----------
const wanted = new Set([...byIsbn.values()].map((v) => v.work).filter(Boolean));
const readers = new Map();
log(`Open Library: lade Leselisten-Export (${wanted.size} Werke gesucht) …`);
n = 0;
for await (const line of lines('https://openlibrary.org/data/ol_dump_reading-log_latest.txt.gz')) {
  if (++n % 10_000_000 === 0) log(`  ${n / 1e6} Mio. Einträge`);
  const work = line.slice(0, line.indexOf('\t'));
  if (wanted.has(work)) readers.set(work, (readers.get(work) || 0) + 1);
}
log(`Leselisten fertig: ${n} Einträge, ${readers.size} unserer Werke kommen vor`);

// ---------- 3. In die Datenbank ----------
const rows = [...byIsbn.entries()]
  .map(([isbn, v]) => [isbn, v.cover, readers.get(v.work) || 0])
  .filter(([, cover, r]) => cover || r > 0);
const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query('set statement_timeout = 0');
await client.query(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
await client.query('begin');
await client.query('truncate cover_map');
for (let i = 0; i < rows.length; i += 10000) {
  const part = rows.slice(i, i + 10000);
  await client.query(`insert into cover_map (isbn, cover_id, readers)
    select * from unnest($1::bigint[], $2::int[], $3::int[]) on conflict do nothing`,
  [part.map((r) => r[0]), part.map((r) => r[1]), part.map((r) => r[2])]);
}
await client.query('commit');
log(`cover_map: ${rows.length} Einträge geschrieben`);
const applied = await client.query('select apply_cover_map() as n');
log(`Werke aktualisiert: ${applied.rows[0].n}`);
const s = await client.query(`select (select count(*) from works where cardinality(cover_ids) > 0) as mit_cover,
  (select count(*) from works where ol_readers > 0) as mit_lesern, (select count(*) from works) as werke,
  pg_size_pretty(pg_database_size(current_database())) as db`);
log(`Werke mit Cover-ID: ${s.rows[0].mit_cover}, mit Leser-Zahl: ${s.rows[0].mit_lesern} von ${s.rows[0].werke}, Datenbank ${s.rows[0].db}`);
await client.end();
