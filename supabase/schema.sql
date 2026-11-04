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

create index if not exists works_fts_idx on works
  using gin (to_tsvector('simple', search_title || ' ' || search_author));
create index if not exists works_series_idx on works (series) where series is not null;

-- Nur lesen für alle (die App nutzt den öffentlichen Schlüssel). Schreiben nur der Import (Datenbank-Login).
alter table works enable row level security;
drop policy if exists "works lesbar" on works;
create policy "works lesbar" on works for select using (true);

-- Suche: tokens = normalisierte Suchwörter (Kleinschrift, Umlaute ausgeschrieben, siehe normalizeText).
-- Jedes Wort muss als Wortanfang im Titel/Reihe oder Autor vorkommen („kokos“ → „kokosnuss“).
-- Wörter mit weniger als 2 Zeichen werden ignoriert (z. B. Initialen „R“).
-- Rang: 0 = alle Wörter im Titel/Reihe, 1 = Titel + Autor zusammen, 2 = nur ähnlich (Tippfehler-Rückfall).
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
  t text[];
  q tsquery;
  phrase text;
  n_hits int;
begin
  t := array(select y from (select regexp_replace(x, '[^a-z0-9]', '', 'g') as y from unnest(tokens) x) s where length(y) >= 2);
  if coalesce(array_length(t, 1), 0) = 0 then
    return;
  end if;
  q := to_tsquery('simple', array_to_string(array(select x || ':*' from unnest(t) x), ' & '));
  phrase := array_to_string(t, ' ');

  return query
    with hits as (
      select w.*, case when to_tsvector('simple', w.search_title) @@ q then 0 else 1 end as rnk
      from works w
      where to_tsvector('simple', w.search_title || ' ' || w.search_author) @@ q
    )
    select h.id, h.title, coalesce(h.sort_title, h.title), h.subtitle, h.authors, h.author_sort,
           h.series, h.volume, h.year, h.genre, h.is_comic, h.isbns, h.cover_ids,
           h.rnk, count(*) over ()
    from hits h
    order by h.rnk, lower(coalesce(h.sort_title, h.title)), h.author_sort
    limit greatest(1, least(lim, 100)) offset greatest(0, off);

  get diagnostics n_hits = row_count;
  -- Keine Treffer auf der ersten Seite: ähnliche Titel suchen (Tippfehler). Ohne Index, daher nur als Rückfall.
  if n_hits = 0 and off = 0 and length(phrase) >= 4 then
    return query
      select w.id, w.title, coalesce(w.sort_title, w.title), w.subtitle, w.authors, w.author_sort,
             w.series, w.volume, w.year, w.genre, w.is_comic, w.isbns, w.cover_ids,
             2, count(*) over ()
      from works w
      where word_similarity(phrase, w.search_title) > 0.55 or word_similarity(phrase, w.search_author) > 0.7
      order by greatest(word_similarity(phrase, w.search_title), word_similarity(phrase, w.search_author)) desc
      limit least(lim, 30);
  end if;
end;
$$;

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

-- Fortschritt/Protokoll des Imports
create table if not exists import_state (
  key   text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table import_state enable row level security; -- keine Policy: für die App unsichtbar
alter table schema_version enable row level security;
