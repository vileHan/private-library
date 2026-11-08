// Open-Library-Daten für den Katalog, in zwei getrennten Läufen (Stand 11/2026):
//
//   MODE=covers  (Workflow „Cover-IDs“, 1–4 h): Ausgaben-Export (~12,6 GB gepackt) lesen und für jede ISBN
//                unseres Katalogs Cover-ID und Open-Library-Werk in cover_map schreiben, dann in die Werke übernehmen.
//   MODE=readers (Workflow „Leserzahlen“, ~10 min): Leselisten-Export (~125 MB) lesen und je Open-Library-Werk
//                zählen, wie oft es auf „Will lesen“/„Lese gerade“/„Gelesen“ steht → ol_readers (Beliebtheit).
//
// Der erste Versuch (alles in einem Lauf) hing im November 2026 sechs Stunden lang stumm beim Download.
// Deshalb: Fortschritt jede Minute, und stockt der Download 2 Minuten, wird neu verbunden und ab der
// erreichten Stelle weitergeladen (HTTP-Range, archive.org unterstützt das).
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { normalizeIsbn } = await import('../js/isbn.js');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = process.env;
const MODE = env.MODE || 'covers';
if (!env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL fehlt (GitHub Secret anlegen).');

const STALL_MS = 120_000;
const MAX_RECONNECTS = 30;

/** Lädt eine Datei als Byte-Strom; bei Stillstand oder Abbruch wird ab der erreichten Stelle neu angesetzt. */
async function* resumableBytes(url) {
  let offset = 0, total = 0, reconnects = 0;
  const started = Date.now();
  let lastLog = Date.now();
  for (;;) {
    const controller = new AbortController();
    let timer;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(new Error('Download stockt')), STALL_MS); };
    try {
      arm();
      const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: offset ? { Range: `bytes=${offset}-` } : {} });
      if (offset && res.status !== 206) throw new Error(`Weiterladen nicht möglich (HTTP ${res.status})`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!total) total = Number(res.headers.get('content-length')) || 0;
      for await (const chunk of res.body) {
        arm();
        offset += chunk.length;
        yield chunk;
        if (Date.now() - lastLog > 60_000) {
          lastLog = Date.now();
          const mbps = offset / 1e6 / ((Date.now() - started) / 1000);
          const eta = total && mbps ? Math.round((total - offset) / 1e6 / mbps / 60) : '?';
          log(`  Download ${(offset / 1e9).toFixed(2)} von ${(total / 1e9).toFixed(2)} GB (${mbps.toFixed(1)} MB/s, noch ~${eta} min)`);
        }
      }
      clearTimeout(timer);
      if (!total || offset >= total) return;
      throw new Error('Verbindung vorzeitig beendet');
    } catch (err) {
      clearTimeout(timer);
      if (++reconnects > MAX_RECONNECTS) throw new Error(`${url}: zu viele Abbrüche (${err.message})`);
      log(`  ${err.message} bei ${(offset / 1e9).toFixed(2)} GB – verbinde neu (${reconnects}/${MAX_RECONNECTS}) …`);
      await sleep(Math.min(60_000, 5_000 * reconnects));
    }
  }
}

function lines(url) {
  return createInterface({ input: Readable.from(resumableBytes(url)).pipe(createGunzip()), crlfDelay: Infinity });
}

/** „/works/OL123W“ → 123 */
const workNum = (key) => Number(key?.match(/OL(\d+)W/)?.[1]) || null;

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query('set statement_timeout = 0');
await client.query(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));

async function summary() {
  const s = await client.query(`select (select count(*) from works where cardinality(cover_ids) > 0) as mit_cover,
    (select count(*) from works where ol_readers > 0) as mit_lesern, (select count(*) from works) as werke,
    (select count(*) from cover_map) as map, pg_size_pretty(pg_database_size(current_database())) as db`);
  const r = s.rows[0];
  log(`Werke mit Cover-ID: ${r.mit_cover}, mit Leser-Zahl: ${r.mit_lesern} von ${r.werke}; cover_map ${r.map} Zeilen; Datenbank ${r.db}`);
}

if (MODE === 'covers') {
  // Nur ISBNs, die in unserem Katalog vorkommen – hält cover_map klein (~450.000 statt Millionen Zeilen)
  const ours = new Set((await client.query('select distinct unnest(isbns)::text as i from works')).rows.map((r) => r.i));
  log(`Katalog: ${ours.size} ISBNs`);
  log('Open Library: lade Ausgaben-Export …');
  const byIsbn = new Map(); // isbn → [cover, work]
  let n = 0;
  for await (const line of lines('https://openlibrary.org/data/ol_dump_editions_latest.txt.gz')) {
    if (++n % 5_000_000 === 0) log(`  ${n / 1e6} Mio. Zeilen gelesen, ${byIsbn.size} Katalog-ISBNs gefunden`);
    // Schneller Vorfilter: nur Zeilen mit einer deutschen ISBN (978-3… bzw. ISBN-10 3…)
    if (!/"(978-?3|3)[\d-]{8,}/.test(line)) continue;
    let rec;
    try { rec = JSON.parse(line.slice(line.indexOf('{'))); } catch { continue; }
    const cover = (rec.covers || []).find((c) => c > 0) || null;
    const work = workNum(rec.works?.[0]?.key);
    if (!cover && !work) continue;
    for (const raw of [...(rec.isbn_13 || []), ...(rec.isbn_10 || [])]) {
      const isbn = normalizeIsbn(raw);
      if (!isbn || !ours.has(isbn)) continue;
      const prev = byIsbn.get(isbn);
      if (!prev) byIsbn.set(isbn, [cover, work]);
      else { prev[0] ??= cover; prev[1] ??= work; }
    }
  }
  const rows = [...byIsbn.entries()];
  log(`Ausgaben fertig: ${n} Zeilen, ${rows.length} Katalog-ISBNs, davon ${rows.filter(([, v]) => v[0]).length} mit Cover`);

  // Neu schreiben; Leserzahlen der bisherigen Einträge bleiben erhalten (die zählt der Lauf „Leserzahlen“)
  await client.query('begin');
  await client.query('create temp table new_map (isbn bigint primary key, cover_id integer, ol_work integer) on commit drop');
  for (let i = 0; i < rows.length; i += 10000) {
    const part = rows.slice(i, i + 10000);
    await client.query(`insert into new_map select * from unnest($1::bigint[], $2::int[], $3::int[]) on conflict do nothing`,
      [part.map(([isbn]) => isbn), part.map(([, v]) => v[0]), part.map(([, v]) => v[1])]);
  }
  await client.query(`create temp table old_readers on commit drop as select isbn, readers from cover_map where readers > 0`);
  await client.query('truncate cover_map');
  await client.query(`insert into cover_map (isbn, cover_id, ol_work, readers)
    select n.isbn, n.cover_id, n.ol_work, coalesce(o.readers, 0) from new_map n left join old_readers o using (isbn)`);
  await client.query('commit');
  log(`cover_map: ${rows.length} Einträge geschrieben`);
} else if (MODE === 'readers') {
  const wanted = new Set((await client.query('select distinct ol_work from cover_map where ol_work is not null')).rows.map((r) => r.ol_work));
  if (!wanted.size) throw new Error('cover_map enthält keine Open-Library-Werke – zuerst den Workflow „Cover-IDs“ laufen lassen.');
  log(`Open Library: lade Leselisten-Export (${wanted.size} Werke gesucht) …`);
  const readers = new Map();
  let n = 0;
  for await (const line of lines('https://openlibrary.org/data/ol_dump_reading-log_latest.txt.gz')) {
    if (++n % 10_000_000 === 0) log(`  ${n / 1e6} Mio. Einträge`);
    const work = workNum(line.slice(0, line.indexOf('\t')));
    if (work && wanted.has(work)) readers.set(work, (readers.get(work) || 0) + 1);
  }
  log(`Leselisten fertig: ${n} Einträge, ${readers.size} unserer Werke kommen vor`);
  const entries = [...readers.entries()];
  await client.query('begin');
  await client.query('update cover_map set readers = 0 where readers <> 0');
  await client.query(`update cover_map c set readers = x.r from unnest($1::int[], $2::int[]) as x(w, r) where c.ol_work = x.w`,
    [entries.map((e) => e[0]), entries.map((e) => e[1])]);
  await client.query('commit');
} else {
  throw new Error(`Unbekannter MODE: ${MODE}`);
}

const applied = await client.query('select apply_cover_map() as n');
log(`Werke aktualisiert: ${applied.rows[0].n}`);
await summary();
await client.end();
