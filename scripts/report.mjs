// Qualitätsbericht über den Katalog (läuft im Workflow „Katalog-Bericht“). Nur lesend.
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query('set statement_timeout = 0');
const q = async (title, sql) => {
  const r = await client.query(sql);
  console.log(`\n### ${title}`);
  for (const row of r.rows) console.log('  ' + Object.values(row).map((v) => (Array.isArray(v) ? v.join(', ') : v)).join(' | '));
};

await q('Gesamt', `select count(*) as werke,
  count(*) filter (where cardinality(authors) = 0) as ohne_autor,
  count(*) filter (where genre is null) as ohne_genre,
  count(*) filter (where series is not null) as mit_reihe,
  count(*) filter (where cardinality(cover_ids) > 0) as mit_cover_id from works`);

await q('Genres (Top 80)', `select genre, count(*) as n from works group by genre order by n desc limit 80`);

await q('Zufallsstichprobe 60 Werke', `select title, coalesce(subtitle,'') as sub, array_to_string(authors, '/') as aut, coalesce(genre,'-') as genre, year
  from works tablesample system (0.2) repeatable (42) limit 60`);

await q('Stichprobe ohne Autor (40)', `select title, coalesce(subtitle,'') as sub, coalesce(genre,'-') as genre
  from works tablesample system (2) repeatable (7) where cardinality(authors) = 0 limit 40`);

await q('Stichprobe ohne Genre (40)', `select title, coalesce(subtitle,'') as sub, array_to_string(authors, '/') as aut
  from works tablesample system (2) repeatable (9) where genre is null limit 40`);

const words = ['kalender', 'malbuch', 'ausmalbuch', 'stickerbuch', 'sticker', 'puzzle', 'notizbuch', 'tagebuch', 'poster',
  'postkarten', 'filmbuch', 'begleitbuch', 'fanbuch', 'offizielle', 'quiz', 'raetsel', 'spiel', 'lesezeichen', 'adventskalender',
  'kochbuch', 'wandkalender', 'bastel', 'schreibwettbewerb', 'anthologie', 'lernheft', 'arbeitsheft', 'lesetagebuch', 'lektuerehilfe',
  'interpretation', 'unterrichtsmaterial', 'hoerbuch', 'box', 'schuber', 'sammelband', 'sammelbox', 'paket', 'set'];
await q('Titelwörter: Anzahl Werke', `select w as wort, (select count(*) from works where to_tsvector('simple', search_title) @@ to_tsquery('simple', w || ':*')) as n
  from unnest(array[${words.map((w) => `'${w}'`).join(',')}]) w order by n desc`);
for (const w of ['kalender', 'malbuch', 'sticker', 'offizielle', 'box', 'set', 'lektuerehilfe', 'interpretation', 'raetsel', 'spiel']) {
  await q(`Beispiele „${w}“`, `select title, coalesce(subtitle,'') as sub, coalesce(genre,'-') as genre from works
    where to_tsvector('simple', search_title) @@ to_tsquery('simple', '${w}:*') order by random() limit 8`);
}
await q('Titel = Reihenname eines anderen Werks desselben Autors (Beispiele)', `select w.title, coalesce(w.subtitle,'') as sub, array_to_string(w.authors,'/') as aut, coalesce(w.series,'') as reihe
  from works w where w.series is null and cardinality(w.authors) > 0 and exists (
    select 1 from works s where s.series = w.title and s.author_sort = w.author_sort) limit 30`);
await client.end();
