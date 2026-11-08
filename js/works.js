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
    .replace(/\?\?\?/g, ' fragezeichen ') // „Die drei ???“ sonst nicht suchbar (Satzzeichen fallen weg)
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

/** „das Vermächtnis der Drachenreiter ; Roman zum Film“ → „Das Vermächtnis der Drachenreiter“ */
function mainSubtitle(s = '') {
  const t = s.split(/\s+;\s+/)[0].trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Titel = Reihenname: Manche Ausgaben heißen nur wie ihre Reihe („Eragon“ von Paolini), der eigentliche Titel
 * steht dann im Untertitel („Eragon : das Vermächtnis der Drachenreiter“) oder in der Reihenangabe
 * („Eragon“, Reihe „Die Gabel, die Hexe und der Wurm“). Ohne Korrektur landen verschiedene Bücher in einem Werk.
 * Begleitbücher OHNE Autor, die nur wie eine Reihe heißen (Fan-Anthologie „Eragon“), werden entfernt.
 */
export function fixSeriesTitles(editions) {
  const seriesByAuthor = new Map();
  const rawSeriesByAuthor = new Map(); // Originalschreibweise, um den Reihennamen vorne im Titel abzuschneiden
  const allSeries = new Set();
  for (const e of editions) {
    if (!e.series) continue;
    const s = titleKey(e.series);
    allSeries.add(s);
    const a = authorKey(e);
    if (!seriesByAuthor.has(a)) { seriesByAuthor.set(a, new Set()); rawSeriesByAuthor.set(a, new Set()); }
    seriesByAuthor.get(a).add(s);
    rawSeriesByAuthor.get(a).add(e.series);
  }
  const out = [];
  for (let e of editions) {
    const a = authorKey(e);
    // Begleitmaterial ohne Autor, das nur wie eine Reihe heißt – im Titel („Eragon“) oder Untertitel
    // („Ruinen von Eriador : Der Herr der Ringe“, ein Rollenspiel-Band)
    if (!a && (allSeries.has(titleKey(e.title)) || allSeries.has(titleKey(mainSubtitle(e.subtitle))))) continue;
    // Reihenname vorne im Titel: „Percy Jackson - Diebe im Olymp“, „Percy Jackson in: Diebe im Olymp“,
    // „Game of Thrones - das Erbe von Winterfell“ → eigentlicher Titel dahinter
    if (a) {
      for (const s of rawSeriesByAuthor.get(a) || []) {
        const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const m = e.title.match(new RegExp(`^${esc}\\s*(?:\\d{1,3}\\s*)?(?:in)?\\s*[-–:]\\s*(.{3,})$`, 'iu'));
        if (m) {
          const title = m[1].charAt(0).toUpperCase() + m[1].slice(1);
          e = { ...e, title, sortTitle: title.replace(/^\s*(der|die|das|ein|eine)\s+/i, ''), series: e.series || s };
          break;
        }
      }
    }
    const t = titleKey(e.title);
    if (a && seriesByAuthor.get(a)?.has(t)) {
      if (e.series && titleKey(e.series) !== t) {
        out.push({ ...e, title: e.series, sortTitle: e.series.replace(/^\s*(der|die|das|ein|eine)\s+/i, ''), series: e.title, volume: '' });
        continue;
      }
      const sub = mainSubtitle(e.subtitle);
      if (sub && !/^(roman|ein roman|thriller|fantasy)/i.test(sub)) {
        out.push({ ...e, title: sub, sortTitle: sub.replace(/^\s*(der|die|das|ein|eine)\s+/i, ''), subtitle: '', series: e.title });
        continue;
      }
    }
    out.push(e);
  }
  return out;
}

// Ab so vielen verschiedenen Autoren ist eine „Reihe“ eine Verlags- oder Sammelreihe (Maxi Pixi 138, Unionsverlag
// Taschenbuch 168, Lesemaus 25). Echte Mehr-Autoren-Reihen liegen darunter: Das schwarze Auge 23, Warhammer 40,000 21,
// Die drei ??? Kids 4 (gezählt 11/2026 im Katalog).
const SERIES_MAX_AUTHORS = 25;

/**
 * Reihen über alle Ausgaben prüfen:
 * 1. Reihen mit ≥ 25 Autoren sind Verlagsreihen → entfernen.
 * 2. Reihen ohne Bandnummer (looseSeries, z. B. „Selcouth“ bei Rewitched/Uncharmed) gelten, wenn derselbe Autor
 *    mindestens 2 verschiedene Bücher darin hat. Reihenfolge dann nach Erscheinungsjahr.
 */
export function checkSeries(editions) {
  const authorsPerSeries = new Map();
  const titlesPerAuthorSeries = new Map();
  for (const e of editions) {
    const a = authorKey(e);
    for (const s of [e.series, e.looseSeries]) {
      if (!s) continue;
      const k = titleKey(s);
      if (!authorsPerSeries.has(k)) authorsPerSeries.set(k, new Set());
      authorsPerSeries.get(k).add(a);
      if (a) {
        const ak = `${a}|${k}`;
        if (!titlesPerAuthorSeries.has(ak)) titlesPerAuthorSeries.set(ak, new Set());
        titlesPerAuthorSeries.get(ak).add(titleKey(e.title));
      }
    }
  }
  const tooMany = (s) => (authorsPerSeries.get(titleKey(s))?.size || 0) >= SERIES_MAX_AUTHORS;
  return editions.map((e) => {
    if (e.series && tooMany(e.series)) return { ...e, series: '', volume: '' };
    if (!e.series && e.looseSeries && !tooMany(e.looseSeries)) {
      const a = authorKey(e);
      if (a && (titlesPerAuthorSeries.get(`${a}|${titleKey(e.looseSeries)}`)?.size || 0) >= 2) {
        return { ...e, series: e.looseSeries, volume: '' };
      }
    }
    return e;
  });
}

/** Gruppiert Ausgaben zu Werken: gleicher Werkschlüssel oder gleiche ISBN. */
export function groupEditions(editions) {
  editions = fixSeriesTitles(checkSeries(editions));
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
  // Gleicher Autor + gleiche Reihe + gleiche Bandnummer = dasselbe Buch, auch bei anderem Titel –
  // z. B. zwei Übersetzungen („Die Wiederkehr des Königs“ / „Die Rückkehr des Königs“, Herr der Ringe 3).
  // Nur mit Autor: ohne Autor sind Bandnummern in der DNB zu oft doppelt vergeben (Star Wars Jedi-Padawan 7).
  const byVolume = new Map();
  editions.forEach((e, i) => {
    const k = workKeyOf(e);
    if (byKey.has(k)) union(i, byKey.get(k)); else byKey.set(k, i);
    const a = authorKey(e);
    if (a && e.series && e.volume && !e.isComic) {
      const v = `${a}|${titleKey(e.series)}|${Number(e.volume)}`;
      if (byVolume.has(v)) union(i, byVolume.get(v)); else byVolume.set(v, i);
    }
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
  return numberSeries([...groups.values()].map(buildWork));
}

// Bis zu so vielen Bänden wird eine Reihe ohne Nummern selbst durchgezählt. Größere (z. B. Barbapapa-Bilderbücher,
// viele Titel im selben Jahr) behalten den Reihennamen – dort wäre eine erfundene Reihenfolge eher irreführend.
const NUMBER_MAX = 10;

/**
 * Reihen, in denen KEIN Band eine Nummer hat (z. B. „Selcouth“: Rewitched 2025, Uncharmed 2026), nach Erscheinungsjahr
 * durchzählen – überall soll „Band 1“, „Band 2“ stehen. Hat auch nur ein Band eine Nummer, bleibt alles, wie die DNB es angibt.
 */
export function numberSeries(works) {
  const bySeries = new Map();
  for (const w of works) {
    if (!w.series) continue;
    const k = `${normalizeText(w.authorSort || '')}|${titleKey(w.series)}`;
    if (!bySeries.has(k)) bySeries.set(k, []);
    bySeries.get(k).push(w);
  }
  for (const list of bySeries.values()) {
    if (list.length > NUMBER_MAX || list.some((w) => w.volume)) continue;
    list.sort((a, b) => (a.year || 9999) - (b.year || 9999) || compareTitle(a, b));
    list.forEach((w, i) => { w.volume = String(i + 1); });
  }
  return works;
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
    bestseller: editions.some((e) => e.isBestseller),
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
