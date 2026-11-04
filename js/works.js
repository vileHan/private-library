// Fasst Ausgaben (Hardcover, Taschenbuch, E-Book, Lizenzausgaben …) zu Werken zusammen.

const ARTICLES = /^(der|die|das|des|dem|den|ein|eine|einer|eines|the|a|an|le|la|les)\s+/;

/** Vereinheitlicht Text für Vergleiche: Kleinschreibung, Umlaute ausgeschrieben, nur Buchstaben/Ziffern. */
export function normalizeText(s = '') {
  return s
    .normalize('NFC') // DNB liefert Umlaute teils zerlegt (u + ¨) – erst zusammensetzen
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Untertitel nur durchsuchen, wenn er kurz ist. Lange Untertitel sind oft Werbetexte
 * („»So sollte Fantasy sein!« George R.R. Martin“) und würden falsche Treffer liefern.
 */
export function searchableSubtitle(s = '') {
  return s && s.length <= 60 ? s : '';
}

function titleKey(title) {
  return normalizeText(title).replace(ARTICLES, '');
}

function authorKey(edition) {
  const first = edition.authorsSort[0] || edition.authors[0] || '';
  return normalizeText(first);
}

/**
 * Schlüssel eines Werks: erster Autor + normalisierter deutscher Titel. Comics bleiben getrennt.
 * Bewusst NICHT verwendet: Originaltitel (240) und DNB-Verknüpfungen (776) – die verbinden bei Reihen
 * wie Eragon auch verschiedene Bände und Box-Sets miteinander.
 */
export function workKeyOf(edition) {
  return `${authorKey(edition)}|${titleKey(edition.title)}${edition.isComic ? '|comic' : ''}`;
}

/** Gruppiert Ausgaben zu Werken: gleicher Werkschlüssel oder gleiche ISBN. */
export function groupEditions(editions) {
  const parent = editions.map((_, i) => i);
  // Iterativ statt rekursiv – beim Import laufen hier Hunderttausende Ausgaben durch.
  const find = (i) => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) { const n = parent[i]; parent[i] = r; i = n; }
    return r;
  };
  const union = (a, b) => { parent[find(a)] = find(b); };

  // Box-Sets: Die DNB legt pro enthaltenem Band einen Datensatz mit derselben Box-ISBN an.
  // Eine ISBN, die bei verschiedenen Titeln vorkommt, verbindet daher nichts und gehört zu keinem Werk.
  const keysPerIsbn = new Map();
  editions.forEach((e) => {
    for (const isbn of e.isbns) {
      if (!keysPerIsbn.has(isbn)) keysPerIsbn.set(isbn, new Set());
      keysPerIsbn.get(isbn).add(workKeyOf(e));
    }
  });
  const ambiguous = new Set([...keysPerIsbn].filter(([, keys]) => keys.size > 1).map(([isbn]) => isbn));
  editions = editions.map((e) => (e.isbns.some((i) => ambiguous.has(i))
    ? { ...e, isbns: e.isbns.filter((i) => !ambiguous.has(i)), isBoxPart: true }
    : e));

  const byKey = new Map();
  const byIsbn = new Map();
  editions.forEach((e, i) => {
    const k = workKeyOf(e);
    if (byKey.has(k)) union(i, byKey.get(k)); else byKey.set(k, i);
    for (const isbn of e.isbns) {
      if (byIsbn.has(isbn)) union(i, byIsbn.get(isbn)); else byIsbn.set(isbn, i);
    }
  });

  const groups = new Map();
  editions.forEach((e, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(e);
  });
  return [...groups.values()].map(buildWork);
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  let best = '', n = 0;
  for (const [v, c] of counts) if (c > n || (c === n && v.length < best.length)) { best = v; n = c; }
  return best;
}

function buildWork(editions) {
  // Neueste gedruckte Ausgaben zuerst – deren Cover sind am ehesten vorhanden.
  const sorted = [...editions].sort((a, b) => (b.year || 0) - (a.year || 0) || Number(a.isEbook) - Number(b.isEbook));
  const title = mostCommon(editions.map((e) => e.title));
  const main = editions.find((e) => e.title === title) || sorted[0];
  const isbns = [...new Set(editions.flatMap((e) => e.isbns))];
  const years = editions.map((e) => e.year).filter(Boolean);
  // Gleiche ISBN mehrfach (z. B. Nachdruck) nur einmal auflisten.
  const seenIsbn = new Set();
  const uniqueEditions = sorted.filter((e) => {
    const i = e.isbns[0];
    if (!i || seenIsbn.has(i)) return false;
    seenIsbn.add(i);
    return true;
  });
  return {
    key: workKeyOf(main),
    title,
    sortTitle: main.sortTitle || title,
    subtitle: mostCommon(editions.map((e) => e.subtitle)),
    authors: main.authors,
    authorSort: main.authorsSort[0] || main.authors[0] || '',
    year: years.length ? Math.min(...years) : null,
    genre: mostCommon(editions.flatMap((e) => e.genres)) || mostCommon(editions.flatMap((e) => e.themes.slice(0, 1))),
    publisher: main.publisher,
    series: mostCommon(editions.map((e) => e.series)),
    volume: mostCommon(editions.map((e) => e.volume)),
    isComic: main.isComic,
    isbns,
    coverIsbns: sorted.filter((e) => !e.isEbook).flatMap((e) => e.isbns).concat(sorted.filter((e) => e.isEbook).flatMap((e) => e.isbns)),
    editions: uniqueEditions.map((e) => ({
      isbn: e.isbns[0] || '',
      publisher: e.publisher,
      year: e.year,
      binding: e.binding,
      edition: e.edition,
      pages: e.pages,
    })),
  };
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
// Sortiert wird nach dem Titel ohne führenden Artikel („Der Augenjäger“ steht unter A), wie in Bibliotheken üblich.
const sortKey = (w) => w.sortTitle || w.title;
export function compareTitle(a, b) {
  return collator.compare(sortKey(a), sortKey(b)) || collator.compare(a.authorSort || '', b.authorSort || '');
}
export function compareAuthor(a, b) {
  return collator.compare(a.authorSort || '', b.authorSort || '') || collator.compare(sortKey(a), sortKey(b));
}
