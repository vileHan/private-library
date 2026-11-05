// Katalog-Import: DNB → (Open-Library-Cover-IDs) → Supabase/Postgres.
// Läuft in GitHub Actions (siehe .github/workflows/import.yml). Nutzt dieselbe Auswertung wie die App.
//
// Umgebungsvariablen:
//   SUPABASE_DB_URL  Postgres-Verbindung (Session pooler), nur als GitHub Secret!
//   YEARS            z. B. "2024" oder "2019-2021" oder "2010,2012" (leer = alle ab fromYear)
//   GROUPS           z. B. "B" oder "B,K" (leer = Konfiguration)
//   COVERS           "true" lädt Cover-IDs aus dem Open-Library-Datenexport (dauert ~20–40 min)
//   DRY_RUN          "true" = nichts in die Datenbank schreiben
import { DOMParser } from '@xmldom/xmldom';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

globalThis.DOMParser = DOMParser;
const { CONFIG } = await import('../js/config.js');
const { fetchRecords, filterCql } = await import('../js/dnb.js');
const { groupEditions, normalizeText, searchableSubtitle } = await import('../js/works.js');
const { normalizeIsbn } = await import('../js/isbn.js');

const env = process.env;
const DRY = env.DRY_RUN === 'true';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- 1. DNB abrufen ----------
function parseYears(s) {
  const now = new Date().getFullYear() + 1;
  if (!s?.trim()) return Array.from({ length: now - CONFIG.catalogFilter.fromYear + 1 }, (_, i) => CONFIG.catalogFilter.fromYear + i);
  return s.split(',').flatMap((part) => {
    const [a, b] = part.split('-').map((x) => Number(x.trim()));
    return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}
const years = parseYears(env.YEARS);
const groups = env.GROUPS?.trim() ? env.GROUPS.split(',').map((g) => g.trim()) : CONFIG.catalogFilter.subjectGroups;
const fullRun = !env.YEARS?.trim() && !env.GROUPS?.trim();

async function withRetry(fn, label) {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (err) {
      if (attempt >= 5) throw new Error(`${label}: ${err.message}`);
      log(`  Fehler (${label}), Versuch ${attempt}: ${err.message} – warte …`);
      await sleep(5000 * attempt);
    }
  }
}

/**
 * Nur die Felder behalten, die das Zusammenfassen braucht – und die Texte frisch kopieren.
 * Sonst halten Teilstrings intern die komplette XML-Antwort der DNB fest (Speicher lief beim
 * ersten Vollimport bei ~300.000 Ausgaben über).
 */
function slim(e) {
  return JSON.parse(JSON.stringify({
    isbns: e.isbns, authors: e.authors, authorsSort: e.authorsSort.slice(0, 1), title: e.title, sortTitle: e.sortTitle,
    subtitle: e.subtitle, series: e.series, volume: e.volume, publisher: e.publisher, year: e.year,
    genres: e.genres.slice(0, 2), themes: e.themes.slice(0, 1), isComic: e.isComic, isEbook: e.isEbook,
    binding: e.binding, edition: '', pages: '', relatedIsbns: [],
  }));
}

async function harvestPartition(year, group) {
  const cql = `${filterCql()} and jhr=${year} and sgt=${group}`;
  const out = [];
  let start = 1, total = 0;
  while (start) {
    const res = await withRetry(() => fetchRecords(cql, start, { pageSize: 100 }), `${year}/${group}@${start}`);
    total = res.total;
    if (total > 100000) throw new Error(`${year}/${group}: ${total} Treffer – mehr als die DNB blättern lässt. Partition verkleinern.`);
    for (const e of res.editions) out.push(slim(e));
    start = res.next;
    await sleep(250); // höflich bleiben
  }
  const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  log(`  ${year} ${group}: ${total} Datensätze → ${out.length} gedruckte Ausgaben (Speicher ${mem} MB)`);
  return out;
}

async function harvestAll() {
  const parts = years.flatMap((y) => groups.map((g) => [y, g]));
  log(`DNB: ${parts.length} Teilabfragen (${years[0]}–${years.at(-1)}, Gruppen ${groups.join(',')})`);
  const editions = [];
  const queue = [...parts];
  const worker = async () => {
    while (queue.length) {
      const [y, g] = queue.shift();
      for (const e of await harvestPartition(y, g)) editions.push(e);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker)); // max. 3 gleichzeitige Anfragen
  log(`DNB fertig: ${editions.length} Ausgaben`);
  return editions;
}

// ---------- 2. Open-Library-Cover-IDs ----------
async function loadCoverIds(neededIsbns) {
  const url = 'https://openlibrary.org/data/ol_dump_editions_latest.txt.gz';
  log(`Open Library: lade Datenexport (${neededIsbns.size} gesuchte ISBNs) …`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Open-Library-Export: HTTP ${res.status}`);
  const lines = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity });
  const covers = new Map();
  let n = 0;
  for await (const line of lines) {
    if (++n % 5_000_000 === 0) log(`  ${n / 1e6} Mio. Zeilen, ${covers.size} Treffer`);
    if (!line.includes('"covers"')) continue;
    const json = line.slice(line.indexOf('{'));
    let rec;
    try { rec = JSON.parse(json); } catch { continue; }
    const id = (rec.covers || []).find((c) => c > 0);
    if (!id) continue;
    for (const raw of [...(rec.isbn_13 || []), ...(rec.isbn_10 || [])]) {
      const isbn = normalizeIsbn(raw);
      if (isbn && neededIsbns.has(isbn) && !covers.has(isbn)) covers.set(isbn, id);
    }
  }
  log(`Open Library fertig: ${covers.size} Cover-IDs`);
  return covers;
}

// ---------- 3. Zeilen bauen ----------
const smallint = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 32767 ? n : null; };

function toRows(works, coverIds) {
  return works.map((w) => {
    // ISBNs in Cover-Reihenfolge (neueste gedruckte Ausgabe zuerst), danach alle übrigen
    const isbns = [...new Set([...w.coverIsbns, ...w.isbns])].filter((i) => /^\d{13}$/.test(i));
    const sortTitle = w.sortTitle && w.sortTitle !== w.title ? w.sortTitle : null;
    return {
      id: w.key,
      title: w.title,
      sort_title: sortTitle,
      subtitle: w.subtitle || null,
      authors: w.authors || [],
      author_sort: w.authorSort || null,
      series: w.series || null,
      volume: smallint(w.volume),
      year: smallint(w.year),
      genre: w.genre || null,
      is_comic: !!w.isComic,
      isbns,
      cover_ids: [...new Set(isbns.map((i) => coverIds.get(i)).filter(Boolean))].slice(0, 3),
      search_title: normalizeText([w.title, searchableSubtitle(w.subtitle), w.series].filter(Boolean).join(' ')),
      search_author: normalizeText((w.authors || []).join(' ')),
    };
  });
}

// ---------- 4. In die Datenbank schreiben ----------
const COLS = ['title', 'sort_title', 'subtitle', 'authors', 'author_sort', 'series', 'volume', 'year', 'genre',
  'is_comic', 'isbns', 'cover_ids', 'search_title', 'search_author'];
const TYPES = 'id text, title text, sort_title text, subtitle text, authors text[], author_sort text, series text, volume smallint, '
  + 'year smallint, genre text, is_comic boolean, isbns bigint[], cover_ids integer[], search_title text, search_author text';

// Nur geänderte Zeilen werden aktualisiert – das hält die Datenbank klein (500-MB-Grenze).
const UPSERT = `
  insert into works (id, ${COLS.join(', ')})
  select id, ${COLS.join(', ')} from jsonb_to_recordset($1::jsonb) as x(${TYPES})
  on conflict (id) do update set ${COLS.map((c) => `${c} = excluded.${c}`).join(', ')}
  where (${COLS.map((c) => `works.${c}`).join(', ')}) is distinct from (${COLS.map((c) => `excluded.${c}`).join(', ')})`;

async function writeDb(rows) {
  const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('set statement_timeout = 0');
    log('Schema anwenden …');
    await client.query(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    if (env.RESET === 'true') {
      log('RESET: Katalog leeren …');
      await client.query('truncate works');
    }
    for (let i = 0; i < rows.length; i += 1000) {
      // ISBNs als Text übergeben – JSON-Zahlen > 2^53 wären ungenau (ISBN-13 passt zwar, sicher ist sicher)
      await client.query(UPSERT, [JSON.stringify(rows.slice(i, i + 1000))]);
      if ((i / 1000) % 50 === 0) log(`  Werke: ${i + Math.min(1000, rows.length - i)} / ${rows.length}`);
    }
    if (fullRun) {
      log('Vollständiger Lauf: veraltete Werke entfernen …');
      // Supabase bricht lange Anweisungen nach einer Zeitgrenze ab – für diesen Schritt aufheben.
      await client.query('set statement_timeout = 0');
      await client.query('create temp table seen (id text primary key)');
      for (let i = 0; i < rows.length; i += 5000) {
        await client.query('insert into seen select unnest($1::text[]) on conflict do nothing', [rows.slice(i, i + 5000).map((r) => r.id)]);
      }
      await client.query('analyze seen');
      const d = await client.query('delete from works w where not exists (select 1 from seen s where s.id = w.id)');
      log(`  entfernt: ${d.rowCount} Werke`);
    }
    await client.query(`insert into import_state (key, value, updated_at) values ('last_import', $1, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify({ years: env.YEARS || 'alle', groups, works: rows.length })]);
    const size = await client.query(`select pg_size_pretty(pg_database_size(current_database())) as s,
      pg_database_size(current_database()) as b, pg_size_pretty(pg_total_relation_size('works')) as w,
      (select count(*) from works) as n`);
    const s = size.rows[0];
    log(`Datenbank: ${s.s} gesamt, Tabelle works ${s.w}, ${s.n} Werke`);
    if (Number(s.b) > 450 * 1024 * 1024) log('WARNUNG: Datenbank nähert sich der 500-MB-Grenze des Gratis-Tarifs!');
  } finally {
    await client.end();
  }
}

// ---------- Ablauf ----------
if (!DRY && !env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL fehlt (GitHub Secret anlegen).');
if (env.SCHEMA_ONLY === 'true') {
  // Nur supabase/schema.sql anwenden (z. B. geänderte Suchfunktion), ohne Daten neu zu laden.
  const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('set statement_timeout = 0');
  await client.query(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await client.end();
  log('Schema aktualisiert.');
  process.exit(0);
}
const editions = await harvestAll();
// Werke ohne jede ISBN (Sonderdrucke, falsch einsortierte DVDs …) weglassen – spart rund ein Viertel Speicher.
const allWorks = groupEditions(editions);
const works = allWorks.filter((w) => w.isbns.length > 0);
log(`Zusammengefasst: ${allWorks.length} Werke, davon ${works.length} mit ISBN`);
let coverIds = new Map();
if (env.COVERS === 'true') {
  coverIds = await withRetry(() => loadCoverIds(new Set(works.flatMap((w) => w.isbns))), 'Open Library');
}
const rows = toRows(works, coverIds);
log(`Zeilen: ${rows.length} Werke, ${rows.reduce((n, r) => n + r.isbns.length, 0)} ISBNs, ${rows.filter((r) => r.cover_ids.length).length} mit Cover-ID`);
if (DRY) {
  log('DRY_RUN – Beispiele:', JSON.stringify(rows.slice(0, 3), null, 1));
} else {
  await writeDb(rows);
}
log('Fertig.');
