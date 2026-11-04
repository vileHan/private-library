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

async function harvestPartition(year, group) {
  const cql = `${filterCql()} and jhr=${year} and sgt=${group}`;
  const out = [];
  let start = 1, total = 0;
  while (start) {
    const res = await withRetry(() => fetchRecords(cql, start, { pageSize: 100 }), `${year}/${group}@${start}`);
    total = res.total;
    if (total > 100000) throw new Error(`${year}/${group}: ${total} Treffer – mehr als die DNB blättern lässt. Partition verkleinern.`);
    out.push(...res.editions);
    start = res.next;
    await sleep(250); // höflich bleiben
  }
  log(`  ${year} ${group}: ${total} Datensätze → ${out.length} gedruckte Ausgaben`);
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
      editions.push(...await harvestPartition(y, g));
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
  const workRows = [];
  const editionRows = [];
  for (const w of works) {
    const ids = [...new Set(w.coverIsbns.map((i) => coverIds.get(i)).filter(Boolean))].slice(0, 3);
    workRows.push({
      id: w.key,
      title: w.title,
      sort_title: w.sortTitle || w.title,
      subtitle: w.subtitle || null,
      authors: w.authors || [],
      author_sort: w.authorSort || null,
      series: w.series || null,
      volume: smallint(w.volume),
      year: smallint(w.year),
      genre: w.genre || null,
      publisher: w.publisher || null,
      is_comic: !!w.isComic,
      cover_ids: ids,
      cover_isbns: w.coverIsbns.slice(0, 3),
      edition_count: w.editions.length,
      search_title: normalizeText([w.title, searchableSubtitle(w.subtitle), w.series].filter(Boolean).join(' ')),
      search_author: normalizeText((w.authors || []).join(' ')),
    });
    for (const e of w.editions) {
      editionRows.push({
        isbn: e.isbn, work_id: w.key, publisher: e.publisher || null, year: smallint(e.year),
        binding: e.binding || null, edition: e.edition || null, pages: e.pages || null, is_ebook: e.binding === 'E-Book',
      });
    }
  }
  return { workRows, editionRows };
}

// ---------- 4. In die Datenbank schreiben ----------
const WORK_COLS = ['title', 'sort_title', 'subtitle', 'authors', 'author_sort', 'series', 'volume', 'year', 'genre',
  'publisher', 'is_comic', 'cover_ids', 'cover_isbns', 'edition_count', 'search_title', 'search_author'];
const WORK_TYPES = 'id text, title text, sort_title text, subtitle text, authors text[], author_sort text, series text, volume smallint, '
  + 'year smallint, genre text, publisher text, is_comic boolean, cover_ids integer[], cover_isbns text[], edition_count smallint, '
  + 'search_title text, search_author text';
const ED_COLS = ['work_id', 'publisher', 'year', 'binding', 'edition', 'pages', 'is_ebook'];
const ED_TYPES = 'isbn text, work_id text, publisher text, year smallint, binding text, edition text, pages text, is_ebook boolean';

// Nur geänderte Zeilen werden aktualisiert – das hält die Datenbank klein (500-MB-Grenze).
const upsertSql = (table, key, cols, types) => `
  insert into ${table} (${key}, ${cols.join(', ')})
  select ${key}, ${cols.join(', ')} from jsonb_to_recordset($1::jsonb) as x(${types})
  on conflict (${key}) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}${table === 'works' ? ', updated_at = now()' : ''}
  where (${cols.map((c) => `${table}.${c}`).join(', ')}) is distinct from (${cols.map((c) => `excluded.${c}`).join(', ')})`;

async function writeDb(workRows, editionRows) {
  const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    log('Schema anwenden …');
    await client.query(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    if (env.RESET === 'true') {
      log('RESET: Katalog leeren …');
      await client.query('truncate editions, works');
    }

    const batch = async (rows, sql, label) => {
      for (let i = 0; i < rows.length; i += 1000) {
        await client.query(sql, [JSON.stringify(rows.slice(i, i + 1000))]);
        if ((i / 1000) % 50 === 0) log(`  ${label}: ${i + Math.min(1000, rows.length - i)} / ${rows.length}`);
      }
    };
    await batch(workRows, upsertSql('works', 'id', WORK_COLS, WORK_TYPES), 'Werke');
    await batch(editionRows, upsertSql('editions', 'isbn', ED_COLS, ED_TYPES), 'Ausgaben');

    if (fullRun) {
      log('Vollständiger Lauf: veraltete Einträge entfernen …');
      await client.query('create temp table seen_works (id text primary key); create temp table seen_eds (isbn text primary key)');
      for (let i = 0; i < workRows.length; i += 5000) {
        await client.query('insert into seen_works select unnest($1::text[]) on conflict do nothing', [workRows.slice(i, i + 5000).map((r) => r.id)]);
      }
      for (let i = 0; i < editionRows.length; i += 5000) {
        await client.query('insert into seen_eds select unnest($1::text[]) on conflict do nothing', [editionRows.slice(i, i + 5000).map((r) => r.isbn)]);
      }
      const e = await client.query('delete from editions e where not exists (select 1 from seen_eds s where s.isbn = e.isbn)');
      const w = await client.query('delete from works w where not exists (select 1 from seen_works s where s.id = w.id)');
      log(`  entfernt: ${w.rowCount} Werke, ${e.rowCount} Ausgaben`);
    }
    await client.query(`insert into import_state (key, value, updated_at) values ('last_import', $1, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify({ years: env.YEARS || 'alle', groups, works: workRows.length, editions: editionRows.length })]);
    const size = await client.query("select pg_size_pretty(pg_database_size(current_database())) as s, pg_database_size(current_database()) as b");
    const counts = await client.query('select (select count(*) from works) as works, (select count(*) from editions) as editions');
    log(`Datenbank: ${size.rows[0].s}, ${counts.rows[0].works} Werke, ${counts.rows[0].editions} Ausgaben`);
    if (Number(size.rows[0].b) > 450 * 1024 * 1024) log('WARNUNG: Datenbank nähert sich der 500-MB-Grenze des Gratis-Tarifs!');
  } finally {
    await client.end();
  }
}

// ---------- Ablauf ----------
if (!DRY && !env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL fehlt (GitHub Secret anlegen).');
const editions = await harvestAll();
// Werke ohne jede ISBN (Sonderdrucke, falsch einsortierte DVDs …) weglassen – spart rund ein Viertel Speicher.
const allWorks = groupEditions(editions);
const works = allWorks.filter((w) => w.editions.length > 0);
log(`Zusammengefasst: ${allWorks.length} Werke, davon ${works.length} mit ISBN`);
let coverIds = new Map();
if (env.COVERS === 'true') {
  coverIds = await withRetry(() => loadCoverIds(new Set(works.flatMap((w) => w.coverIsbns))), 'Open Library');
}
const { workRows, editionRows } = toRows(works, coverIds);
log(`Zeilen: ${workRows.length} Werke, ${editionRows.length} Ausgaben, ${workRows.filter((w) => w.cover_ids.length).length} Werke mit Cover-ID`);
if (DRY) {
  log('DRY_RUN – Beispiele:', JSON.stringify(workRows.slice(0, 3), null, 1));
} else {
  await writeDb(workRows, editionRows);
}
log('Fertig.');
