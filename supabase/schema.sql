-- Katalog-Datenbank für die private Bibliothek (Supabase, Gratis-Tarif: 500 MB).
-- Wird vom Import-Workflow bei jedem Lauf ausgeführt, deshalb vollständig wiederholbar (idempotent).
--
-- Speicher sparen ist hier das wichtigste Ziel (~700 Byte je Werk inkl. Index):
--  * nur EINE Tabelle; die Ausgaben stehen als ISBN-Zahlen (int8) im Werk,
--    Details (Verlag, Bindung …) lädt die App bei Bedarf live von der DNB
--  * Volltextindex (Wortanfänge) statt Trigramm-Index (der war ~4× größer)

create extension if not exists pg_trgm;

create table if not exists schema_version (version int not null);

do $$
declare v int;
begin
  select max(version) into v from schema_version;
  if coalesce(v, 0) < 2 then
    -- Version 1 hatte eine eigene Ausgaben-Tabelle – nur Testdaten, wird neu aufgebaut.
    drop table if exists editions cascade;
    drop table if exists works cascade;
    delete from schema_version;
    insert into schema_version values (2);
  end if;
end $$;

-- Ein Werk = alle Ausgaben eines Buchs (Hardcover, Taschenbuch, E-Book …)
create table if not exists works (
  id            text primary key,                -- Werkschlüssel "autor|titel" (normalisiert, siehe js/works.js)
  title         text not null,
  sort_title    text,                            -- nur gesetzt, wenn abweichend (ohne führenden Artikel)
  subtitle      text,
  authors       text[] not null default '{}',
  author_sort   text,                            -- "Nachname, Vorname"
  series        text,
  volume        smallint,
  year          smallint,                        -- früheste Ausgabe
  genre         text,                            -- deutscher Gattungsbegriff der DNB
  is_comic      boolean not null default false,
  isbns         bigint[] not null default '{}',  -- ISBN-13 aller Ausgaben, Cover-Reihenfolge (neueste gedruckte zuerst)
  cover_ids     integer[] not null default '{}', -- Open-Library-Cover-IDs (ohne Ratenbegrenzung abrufbar)
  search_title  text not null default '',        -- normalisiert: Titel + kurzer Untertitel + Reihe
  search_author text not null default ''         -- normalisiert: Autoren
);

-- Beliebtheit (seit 11/2026): Bestseller-Kennzeichen der DNB (Import) und Zahl der Open-Library-Leselisten-
-- Einträge (Workflow „Cover-IDs“). Neue Spalten mit Standardwert kosten in Postgres keinen Umbau der Tabelle.
alter table works add column if not exists bestseller boolean not null default false;
alter table works add column if not exists ol_readers integer not null default 0;

-- Bekanntheit eines Werks für die Sortierung: Ausgaben ×2, Bestseller +20, Leser logarithmisch (1.000 Leser ≈ +41)
create or replace function popularity(w works)
returns numeric
language sql immutable
as $$
  select cardinality(w.isbns) * 2 + case when w.bestseller then 20 else 0 end + ln(1 + w.ol_readers) * 6;
$$;

create index if not exists works_fts_idx on works
  using gin (to_tsvector('simple', search_title || ' ' || search_author));
create index if not exists works_series_idx on works (series) where series is not null;

-- Nur lesen für alle (die App nutzt den öffentlichen Schlüssel). Schreiben nur der Import (Datenbank-Login).
alter table works enable row level security;
drop policy if exists "works lesbar" on works;
create policy "works lesbar" on works for select using (true);

-- Suche: tokens = normalisierte Suchwörter (Kleinschrift, Umlaute ausgeschrieben, siehe normalizeText).
-- Jedes Wort muss als Wortanfang im Titel/Reihe oder Autor vorkommen („kokos“ → „kokosnuss“).
-- Ignoriert: Wörter unter 2 Zeichen (Initialen wie „R“) und Füllwörter („die“, „und“ …),
-- solange noch ein anderes Wort übrig bleibt.
-- Rang: 0 = alle Wörter im Titel/Reihe, 1 = Titel + Autor zusammen, 2 = nur ähnlich (Tippfehler-Rückfall).
-- Supabase bricht öffentliche Anfragen nach 3 s ab – deshalb wird die Treffermenge gedeckelt.
drop function if exists search_works(text[], int, int);
create function search_works(tokens text[], lim int default 50, off int default 0)
returns table (
  id text, title text, sort_title text, subtitle text, authors text[], author_sort text,
  series text, volume smallint, year smallint, genre text, is_comic boolean,
  isbns bigint[], cover_ids integer[], rank int, total bigint
)
language plpgsql stable
set search_path = public
as $$
declare
  stop text[] := array['der','die','das','des','dem','den','ein','eine','einer','eines','einem','einen',
                       'und','oder','im','in','am','an','auf','aus','bei','mit','von','vom','zu','zum','zur',
                       'fuer','ueber','unter','nach','vor','wie','ist','the','of','and','a','an'];
  t text[];
  core text[];
  q tsquery;
  qf tsquery;
  phrase text;
  n_hits int;
  cap constant int := 3000;  -- höchstens so viele Treffer werden sortiert (sonst > 3 s)
begin
  t := array(select y from (select regexp_replace(x, '[^a-z0-9]', '', 'g') as y from unnest(tokens) x) s where length(y) >= 2);
  core := array(select x from unnest(t) x where not x = any(stop));
  if coalesce(array_length(core, 1), 0) > 0 then
    t := core;
  end if;
  if coalesce(array_length(t, 1), 0) = 0 then
    return;
  end if;
  q := to_tsquery('simple', array_to_string(array(select x || ':*' from unnest(t) x), ' & '));
  phrase := array_to_string(t, ' ');

  return query
    with hits as (
      select w.*, case when to_tsvector('simple', w.search_title) @@ q then 0 else 1 end as rnk,
             -- Suche passt zur Reihe („eragon“, „harry potter“) → diese Reihe zuerst, in Bandfolge
             (w.series is not null and to_tsvector('simple', w.series) @@ q) as series_hit,
             popularity(w) as pop
      from works w
      where to_tsvector('simple', w.search_title || ' ' || w.search_author) @@ q
      limit cap
    ), ranked as (
      -- Bekanntheit einer Reihe = Summe über alle ihre Bände (Harry Potter ≫ Harry Dresden)
      select h.*, sum(h.pop) over (partition by h.series, h.author_sort) as series_pop from hits h
    )
    -- Reihenfolge: passende Reihe (nach Bekanntheit, in Bandfolge) > Titeltreffer > Autortreffer,
    -- innerhalb davon bekannteste zuerst, bei Gleichstand A–Z
    select h.id, h.title, coalesce(h.sort_title, h.title), h.subtitle, h.authors, h.author_sort,
           h.series, h.volume, h.year, h.genre, h.is_comic, h.isbns, h.cover_ids,
           h.rnk, count(*) over ()
    from ranked h
    order by h.series_hit desc,
             case when h.series_hit then h.series_pop end desc,
             case when h.series_hit then h.author_sort end, case when h.series_hit then h.series end,
             case when h.series_hit then h.volume end nulls last, case when h.series_hit then h.year end,
             h.rnk, h.pop desc, lower(coalesce(h.sort_title, h.title)), h.author_sort
    limit greatest(1, least(lim, 100)) offset greatest(0, off);

  get diagnostics n_hits = row_count;
  -- Keine Treffer auf der ersten Seite: Tippfehler annehmen. Per Index Werke mit gleichen Wortanfängen
  -- holen (jedes Wort um bis zu 3 Zeichen gekürzt, mindestens 3 behalten) und nur diese vergleichen.
  if n_hits = 0 and off = 0 and length(phrase) >= 4 then
    qf := to_tsquery('simple', array_to_string(array(
            select left(x, greatest(3, length(x) - 3)) || ':*' from unnest(t) x), ' & '));
    return query
      with cand as (
        select w.* from works w
        where to_tsvector('simple', w.search_title || ' ' || w.search_author) @@ qf
        limit 20000
      ), scored as (
        select c.*, greatest(word_similarity(phrase, c.search_title),
                             word_similarity(phrase, c.search_title || ' ' || c.search_author)) as sim
        from cand c
      )
      select s.id, s.title, coalesce(s.sort_title, s.title), s.subtitle, s.authors, s.author_sort,
             s.series, s.volume, s.year, s.genre, s.is_comic, s.isbns, s.cover_ids,
             2, count(*) over ()
      from scored s
      where s.sim > 0.5
      order by s.sim desc, lower(coalesce(s.sort_title, s.title))
      limit least(lim, 30);
  end if;
end;
$$;

-- Vorschläge beim Tippen (höchstens 10). Andere Rangfolge als die Suche:
-- Titel beginnt mit der Eingabe > alle Wörter im Titel > viele Ausgaben (= bekanntes Buch) > kurzer Titel.
-- Kein zusätzlicher Index nötig; dieselbe Deckelung (3.000 Kandidaten) wie search_works wegen der 3-s-Grenze.
drop function if exists suggest_works(text[], int);
create function suggest_works(tokens text[], lim int default 6)
returns table (
  id text, title text, sort_title text, subtitle text, authors text[], author_sort text,
  series text, volume smallint, year smallint, genre text, is_comic boolean,
  isbns bigint[], cover_ids integer[], rank int, total bigint
)
language plpgsql stable
set search_path = public
as $$
declare
  stop text[] := array['der','die','das','des','dem','den','ein','eine','einer','eines','einem','einen',
                       'und','oder','im','in','am','an','auf','aus','bei','mit','von','vom','zu','zum','zur',
                       'fuer','ueber','unter','nach','vor','wie','ist','the','of','and','a'];
  t text[];
  core text[];
  q tsquery;
  phrase text;
begin
  t := array(select y from (select regexp_replace(x, '[^a-z0-9]', '', 'g') as y from unnest(tokens) x) s where length(y) >= 2);
  core := array(select x from unnest(t) x where not x = any(stop));
  if coalesce(array_length(core, 1), 0) > 0 then t := core; end if;
  if coalesce(array_length(t, 1), 0) = 0 then return; end if;
  q := to_tsquery('simple', array_to_string(array(select x || ':*' from unnest(t) x), ' & '));
  phrase := array_to_string(t, ' ');
  return query
    with hits as (
      select w.* from works w
      where to_tsvector('simple', w.search_title || ' ' || w.search_author) @@ q
      limit 3000
    )
    select h.id, h.title, coalesce(h.sort_title, h.title), h.subtitle, h.authors, h.author_sort,
           h.series, h.volume, h.year, h.genre, h.is_comic, h.isbns, h.cover_ids, 0, 0::bigint
    from hits h
    order by (h.search_title like phrase || '%') desc,
             (to_tsvector('simple', h.search_title) @@ q) desc,
             cardinality(h.isbns) desc,
             length(h.title)
    limit greatest(1, least(lim, 10));
end;
$$;
grant execute on function suggest_works(text[], int) to anon, authenticated;

-- Alle Bände einer Reihe (für „Alle Bände laden“)
drop function if exists series_works(text, text);
create function series_works(series_name text, author text default null)
returns setof works
language sql stable
set search_path = public
as $$
  select * from works
  where series = series_name and (author is null or author_sort = author)
  order by volume nulls last, year;
$$;

drop function if exists works_by_isbns(text[]);

grant usage on schema public to anon, authenticated;
grant select on works to anon, authenticated;
grant execute on function search_works(text[], int, int) to anon, authenticated;
grant execute on function series_works(text, text) to anon, authenticated;

-- ISBN → Open-Library-Cover-ID (nur deutsche ISBNs 978-3…), gefüllt vom Workflow „Cover-IDs“ (scripts/covers.mjs).
-- Getrennt vom Katalog-Import, weil der Open-Library-Export je nach Server 2–5 Stunden zum Herunterladen braucht.
-- Seit 11/2026 auch die Zahl der Open-Library-Leselisten-Einträge des zugehörigen Werks (Beliebtheit).
create table if not exists cover_map (
  isbn     bigint primary key,
  cover_id integer
);
alter table cover_map alter column cover_id drop not null;
alter table cover_map add column if not exists readers integer not null default 0;
alter table cover_map enable row level security; -- keine Policy: für die App unsichtbar

-- Cover-IDs (höchstens 3, in Cover-Reihenfolge der ISBNs) und Leser-Zahl (Maximum über die Ausgaben)
-- aus cover_map in die Werke übernehmen. Ändert nur Werke, bei denen sich etwas ändert.
create or replace function apply_cover_map()
returns integer
language plpgsql
set search_path = public
as $$
declare n integer;
begin
  update works w set cover_ids = x.ids, ol_readers = x.readers
  from (
    select w2.id,
           coalesce((array_agg(c.cover_id order by u.ord) filter (where c.cover_id is not null))[1:3], '{}') as ids,
           coalesce(max(c.readers), 0) as readers
    from works w2
    cross join lateral unnest(w2.isbns) with ordinality as u(isbn, ord)
    join cover_map c on c.isbn = u.isbn
    group by w2.id
  ) x
  where w.id = x.id and (w.cover_ids, w.ol_readers) is distinct from (x.ids, x.readers);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function apply_cover_map() from public, anon, authenticated;

-- Fortschritt/Protokoll des Imports
create table if not exists import_state (
  key   text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table import_state enable row level security; -- keine Policy: für die App unsichtbar
alter table schema_version enable row level security;
