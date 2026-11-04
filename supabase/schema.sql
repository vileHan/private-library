-- Katalog-Datenbank für die private Bibliothek (Supabase, Gratis-Tarif: 500 MB).
-- Wird vom Import-Workflow bei jedem Lauf ausgeführt, deshalb vollständig wiederholbar (idempotent).

create extension if not exists pg_trgm;

-- Ein Werk = alle Ausgaben eines Buchs (Hardcover, Taschenbuch, E-Book …)
create table if not exists works (
  id            text primary key,              -- Werkschlüssel: "autor|titel" (normalisiert, siehe js/works.js)
  title         text not null,
  sort_title    text,                          -- ohne führenden Artikel
  subtitle      text,
  authors       text[] not null default '{}',
  author_sort   text,                          -- "Nachname, Vorname"
  series        text,
  volume        smallint,
  year          smallint,                      -- früheste Ausgabe
  genre         text,                          -- deutscher Gattungsbegriff der DNB
  publisher     text,
  is_comic      boolean not null default false,
  cover_ids     integer[] not null default '{}', -- Open-Library-Cover-IDs (ohne Ratenbegrenzung abrufbar)
  cover_isbns   text[] not null default '{}',  -- ISBNs in Cover-Reihenfolge (für Google-Fallback)
  edition_count smallint not null default 0,
  search_title  text not null default '',      -- normalisiert: Titel + Untertitel + Reihe
  search_author text not null default '',      -- normalisiert: Autoren
  updated_at    timestamptz not null default now()
);

create table if not exists editions (
  isbn      text primary key,
  work_id   text not null references works(id) on delete cascade,
  publisher text,
  year      smallint,
  binding   text,
  edition   text,
  pages     text,
  is_ebook  boolean not null default false
);

create index if not exists editions_work_idx on editions (work_id);
-- Trigramm-Indizes waren zu groß für 500 MB (≈ 800 Byte je Werk) → Volltextindex (Wortanfänge) statt dessen.
drop index if exists works_search_title_trgm;
drop index if exists works_search_author_trgm;
create index if not exists works_fts_idx on works
  using gin (to_tsvector('simple', search_title || ' ' || search_author));
create index if not exists works_series_idx on works (series) where series is not null;
create index if not exists works_genre_idx on works (genre) where genre is not null;

-- Nur lesen für alle (die App nutzt den öffentlichen anon-Key). Schreiben nur der Import (Datenbank-Login).
alter table works enable row level security;
alter table editions enable row level security;
drop policy if exists "works lesbar" on works;
create policy "works lesbar" on works for select using (true);
drop policy if exists "editions lesbar" on editions;
create policy "editions lesbar" on editions for select using (true);

-- Suche: tokens = normalisierte Suchwörter (Kleinschrift, Umlaute ausgeschrieben, siehe normalizeText).
-- Jedes Wort muss als Wortanfang im Titel/Reihe oder Autor vorkommen („kokos“ → „kokosnuss“).
-- Wörter mit weniger als 2 Zeichen werden ignoriert (z. B. Initialen „R“).
-- Rang: 0 = alle Wörter im Titel/Reihe, 1 = Titel + Autor zusammen, 2 = nur ähnlich (Tippfehler-Rückfall).
drop function if exists search_works(text[], int, int);
create or replace function search_works(tokens text[], lim int default 50, off int default 0)
returns table (
  id text, title text, sort_title text, subtitle text, authors text[], author_sort text,
  series text, volume smallint, year smallint, genre text, publisher text, is_comic boolean,
  cover_ids integer[], cover_isbns text[], edition_count smallint, editions jsonb,
  rank int, total bigint
)
language plpgsql stable
set search_path = public
as $$
declare
  t text[] := array(select regexp_replace(x, '[^a-z0-9]', '', 'g') from unnest(tokens) x where length(x) >= 2);
  q tsquery;
  phrase text;
  n_hits int;
begin
  t := array(select x from unnest(t) x where x <> '');
  if coalesce(array_length(t, 1), 0) = 0 then
    return;
  end if;
  q := to_tsquery('simple', array_to_string(array(select x || ':*' from unnest(t) x), ' & '));
  phrase := array_to_string(t, ' ');

  return query
    with hits as (
      select w.*,
             case when to_tsvector('simple', w.search_title) @@ q then 0 else 1 end as rnk
      from works w
      where to_tsvector('simple', w.search_title || ' ' || w.search_author) @@ q
    )
    select h.id, h.title, h.sort_title, h.subtitle, h.authors, h.author_sort,
           h.series, h.volume, h.year, h.genre, h.publisher, h.is_comic,
           h.cover_ids, h.cover_isbns, h.edition_count, editions_json(h.id),
           h.rnk, count(*) over ()
    from hits h
    order by h.rnk, lower(h.sort_title), h.author_sort
    limit greatest(1, least(lim, 100)) offset greatest(0, off);

  get diagnostics n_hits = row_count;
  -- Keine Treffer und erste Seite: ähnliche Titel suchen (Tippfehler). Ohne Index, daher nur als Rückfall.
  if n_hits = 0 and off = 0 and length(phrase) >= 4 then
    return query
      select w.id, w.title, w.sort_title, w.subtitle, w.authors, w.author_sort,
             w.series, w.volume, w.year, w.genre, w.publisher, w.is_comic,
             w.cover_ids, w.cover_isbns, w.edition_count, editions_json(w.id),
             2, count(*) over ()
      from works w
      where word_similarity(phrase, w.search_title) > 0.55 or word_similarity(phrase, w.search_author) > 0.7
      order by greatest(word_similarity(phrase, w.search_title), word_similarity(phrase, w.search_author)) desc
      limit least(lim, 30);
  end if;
end;
$$;

create or replace function editions_json(work text)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'isbn', e.isbn, 'publisher', e.publisher, 'year', e.year,
           'binding', e.binding, 'edition', e.edition, 'pages', e.pages)
         order by e.year desc nulls last), '[]'::jsonb)
  from editions e where e.work_id = work;
$$;

-- Alle Bände einer Reihe (für „Alle Bände laden“)
create or replace function series_works(series_name text, author text default null)
returns setof works
language sql stable
set search_path = public
as $$
  select * from works
  where series = series_name and (author is null or author_sort = author)
  order by volume nulls last, year;
$$;

-- Werke zu ISBNs (z. B. um eigene Bücher mit dem Katalog abzugleichen)
create or replace function works_by_isbns(isbns text[])
returns table (isbn text, work_id text)
language sql stable
set search_path = public
as $$
  select e.isbn, e.work_id from editions e where e.isbn = any(isbns);
$$;

grant usage on schema public to anon, authenticated;
grant select on works, editions to anon, authenticated;
grant execute on function search_works(text[], int, int) to anon, authenticated;
grant execute on function editions_json(text) to anon, authenticated;
grant execute on function series_works(text, text) to anon, authenticated;
grant execute on function works_by_isbns(text[]) to anon, authenticated;

-- Fortschritt des Imports (wiederaufnehmbar)
create table if not exists import_state (
  key   text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table import_state enable row level security; -- keine Policy: für die App unsichtbar
