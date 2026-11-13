// Anbindung an die SRU-Schnittstelle der Deutschen Nationalbibliothek (frei, CC0, ohne Anmeldung).
import { CONFIG } from './config.js';
import { normalizeIsbn } from './isbn.js';
import { classify } from './classify.js';
import { cleanTitle, splitVolumePrefix, sameSeries, isPublisherSeries, capitalize, cleanSeriesName, splitTitleSubtitle, plausibleYear } from './titles.js';

const MARC_NS = 'http://www.loc.gov/MARC21/slim';

// Läuft im Browser und (für den Datenbank-Import) in Node. Dort setzt das Import-Skript
// globalThis.DOMParser auf @xmldom/xmldom – deshalb überall Array.from statt Spread.
const list = (nodes) => Array.from(nodes);

/** Baut den CQL-Filterteil aus der Konfiguration. */
export function filterCql() {
  const f = CONFIG.catalogFilter;
  const parts = [`spr=${f.language}`, 'mat=books', `jhr>=${f.fromYear}`];
  if (f.subjectGroups.length) parts.push('(' + f.subjectGroups.map((g) => `sgt=${g}`).join(' or ') + ')');
  let cql = parts.join(' and ');
  if (f.excludeThesis) cql += ' not hss=*';
  for (const p of f.excludedPublishers) cql += ` not vlg="${p}"`;
  return cql;
}

/** Entfernt Zeichen, die in CQL eine Sonderbedeutung haben. */
function cleanToken(t) {
  return t.replace(/["\\()=<>/*?^]/g, '').trim();
}

/**
 * Wandelt die Eingabe in eine CQL-Abfrage.
 * ISBN → ungefilterte Nummernsuche. Sonst: jedes Wort muss in Titel ODER Person vorkommen;
 * das letzte Wort wird rechts trunkiert, damit auch angefangene Wörter treffen.
 */
export function buildQuery(input) {
  const isbn = normalizeIsbn(input);
  if (isbn) return { cql: `num=${isbn}`, isIsbn: true };
  const tokens = input.split(/\s+/).map(cleanToken).filter((t) => t.length > 0);
  if (!tokens.length) return null;
  const terms = tokens.map((t, i) => {
    const v = i === tokens.length - 1 && t.length >= 3 ? `${t}*` : `"${t}"`;
    return `(tit=${v} or per=${v})`;
  });
  return { cql: `(${terms.join(' and ')}) and ${filterCql()}`, isIsbn: false };
}

/**
 * Ruft eine Seite Datensätze für eine fertige CQL-Abfrage ab. start ist 1-basiert (SRU-Konvention).
 * Achtung: Die DNB lässt höchstens bis Datensatz 100.000 blättern.
 */
export async function fetchRecords(cql, start = 1, { pageSize = CONFIG.dnb.pageSize, signal, keepAll = false } = {}) {
  const url = new URL(CONFIG.dnb.endpoint);
  url.search = new URLSearchParams({
    version: '1.1',
    operation: 'searchRetrieve',
    recordSchema: 'MARC21-xml',
    maximumRecords: String(pageSize),
    startRecord: String(start),
    query: cql,
  });
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`DNB antwortet mit Fehler ${res.status}`);
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
  const diag = xml.getElementsByTagNameNS('*', 'message')[0];
  if (diag) throw new Error(`DNB-Abfrage fehlerhaft: ${diag.textContent}`);
  const total = Number(xml.getElementsByTagNameNS('*', 'numberOfRecords')[0]?.textContent || 0);
  const records = list(xml.getElementsByTagNameNS(MARC_NS, 'record'));
  // Katalogregeln (js/classify.js): nur gedruckte, „herkömmliche“ Bücher. ISBN-Suchen (keepAll) bleiben ungefiltert.
  const editions = records.map(parseRecord).filter((e) => e && (keepAll
    || (e.isPrintText && classify(e, { excludeGenreGroups: CONFIG.catalogFilter.excludeGenreGroups }).keep)));
  const fetched = start - 1 + records.length;
  return { editions, total, next: fetched < total && records.length ? fetched + 1 : null };
}

/** Details zu bekannten ISBNs (Verlag, Bindung, Jahr …) – für die Ausgabenliste im Datenbank-Modus. */
export async function editionsByIsbns(isbns) {
  const wanted = isbns.slice(0, 30);
  if (!wanted.length) return [];
  const res = await fetchRecords(wanted.map((i) => `num=${i}`).join(' or '), 1, { pageSize: 50, keepAll: true });
  const byIsbn = new Map();
  for (const e of res.editions) {
    for (const i of e.isbns) {
      if (wanted.includes(i) && !byIsbn.has(i)) {
        byIsbn.set(i, { isbn: i, publisher: e.publisher, year: e.year, binding: e.binding, edition: e.edition, pages: e.pages });
      }
    }
  }
  return wanted.map((i) => byIsbn.get(i) || { isbn: i, publisher: '', year: null, binding: '', edition: '', pages: '' });
}

/** Sucht nach einer Benutzereingabe (Titel/Autor/ISBN). */
export async function searchDnb(input, start = 1, signal) {
  const q = buildQuery(input);
  if (!q) return { editions: [], total: 0, next: null };
  return fetchRecords(q.cql, start, { signal, keepAll: q.isIsbn });
}

// ---------- MARC21 auswerten ----------

function fields(rec, tag) {
  return list(rec.getElementsByTagNameNS(MARC_NS, 'datafield')).filter((f) => f.getAttribute('tag') === tag);
}
function control(rec, tag) {
  return list(rec.getElementsByTagNameNS(MARC_NS, 'controlfield')).find((f) => f.getAttribute('tag') === tag)?.textContent || '';
}
function subs(field, code) {
  return list(field.getElementsByTagNameNS(MARC_NS, 'subfield'))
    .filter((s) => s.getAttribute('code') === code)
    // Die DNB liefert Umlaute oft zerlegt (u + ¨) – zusammensetzen, sonst greifen Vergleiche wie „Geschenkbücher“ nicht.
    // Dazu unsichtbare Steuerzeichen (z. B. CGJ U+034F in „Alagae͏̈sia“) entfernen.
    .map((s) => s.textContent.replace(/͏/g, '').normalize('NFC').trim());
}
function sub(field, code) {
  return subs(field, code)[0] || '';
}
/** Entfernt ISBD-Satzzeichen am Ende („Titel :“ → „Titel“). */
function tidy(s) {
  // \u0098 … \u009C markieren Nichtsortierzeichen (z. B. Artikel „Der“) – für die Anzeige nur die Marker entfernen.
  return s.replace(/[\u0098\u009C]/g, '').replace(/[\s:;,/=.]+$/, '').replace(/^\s*[\[]|[\]]\s*$/g, '').trim();
}
/** „Zeh, Juli“ → „Juli Zeh“; „Rowling, J. K“ → „J. K. Rowling“ (tidy() schneidet den Punkt der letzten Initiale ab) */
export function displayName(n) {
  const m = n.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].replace(/(^|[\s.])(\p{Lu})$/u, '$1$2.')} ${m[1]}` : n;
}

export function parseRecord(rec) {
  const idn = control(rec, '001');
  const isbns = [];
  for (const f of fields(rec, '020')) {
    const i = normalizeIsbn(sub(f, 'a'));
    if (i && !isbns.includes(i)) isbns.push(i);
  }
  const relatedIsbns = [];
  for (const f of fields(rec, '776')) {
    for (const z of subs(f, 'z')) {
      const i = normalizeIsbn(z);
      if (i && !isbns.includes(i) && !relatedIsbns.includes(i)) relatedIsbns.push(i);
    }
  }

  const authorsRaw = [];
  for (const f of fields(rec, '100')) authorsRaw.push(tidy(sub(f, 'a')));
  for (const f of fields(rec, '700')) {
    if (subs(f, '4').includes('aut')) authorsRaw.push(tidy(sub(f, 'a')));
  }

  const t = fields(rec, '245')[0];
  // Mehrbändige Werke: $a = Reihe („Eragon“), $n = Bandzählung („Bd. 2“ oder „...“), $p = eigentlicher Titel.
  // Ältere Datensätze haben die Verfasserangabe im Titel: „Matt, der Herzensbrecher / aus dem Amerikan. von …“
  const rawMain = (t ? sub(t, 'a') : '').split(/\s+\/\s+/)[0];
  // Auch hier steckt bei älteren Datensätzen die Verfasserangabe drin: „Sturmnacht / [Dt. von: Jürgen Langowski“
  const partName = (t ? subs(t, 'p').at(-1) || '' : '').split(/\s+\/\s+/)[0];
  const partNumber = t ? subs(t, 'n').map(tidy).find((n) => /\d/.test(n)) || '' : '';
  const stripNonSort = (s) => tidy(s.replace(/\u0098[^\u009C]*\u009C\s*/g, ''));
  let title, sortTitle, seriesFromTitle = '', volume = '';
  if (partName) {
    title = tidy(partName);
    sortTitle = stripNonSort(partName);
    seriesFromTitle = tidy(rawMain);
    volume = partNumber.match(/\d+/)?.[0] || '';
  } else {
    title = tidy(rawMain);
    sortTitle = stripNonSort(rawMain);
    if (partNumber) { title = `${title}, ${partNumber}`; sortTitle = `${sortTitle}, ${partNumber}`; }
  }
  let subtitle = t ? tidy(sub(t, 'b')) : '';
  const uniform = fields(rec, '240')[0];
  const workTitle = uniform ? tidy(sub(uniform, 'a')) : '';

  // Reihe aus den Reihenfeldern (490/830/800), wenn der Titel keine liefert. Nur mit kleiner Bandnummer –
  // so fallen Verlagsreihen mit Bestellnummern („Blanvalet ; 37122“) heraus.
  // Reihen OHNE Bandnummer („Selcouth-Reihe“ bei Rewitched) merken wir nur vor: Ob es eine echte Reihe ist,
  // entscheidet groupEditions (js/works.js) – derselbe Autor muss mindestens 2 Bücher darin haben.
  let looseSeries = '';
  if (!seriesFromTitle) {
    for (const f of [...fields(rec, '490'), ...fields(rec, '830'), ...fields(rec, '800')]) {
      const name = tidy(f.getAttribute('tag') === '800' ? sub(f, 't') : sub(f, 'a'));
      const num = sub(f, 'v').match(/^\D{0,8}?(\d{1,3})(?!\d)/)?.[1];
      if (name && num) { seriesFromTitle = name; volume = num; break; }
      if (name && !sub(f, 'v') && !looseSeries) looseSeries = name;
    }
    // „Harry Potter und der Stein der Weisen (Harry Potter 1)“ → Zusatz in Klammern entfernen
    if (seriesFromTitle) {
      const strip = (s) => s.replace(/\s*\([^()]*\d{1,3}\)\s*$/, '');
      title = strip(title);
      sortTitle = strip(sortTitle);
    }
  }

  const pub = fields(rec, '264').find((f) => f.getAttribute('ind2') === '1') || fields(rec, '260')[0];
  const publisher = pub ? tidy(sub(pub, 'b')) : '';

  // Titel aufräumen (js/titles.js): Werbetexte, „[u.a.]“, Ausgabe-Zusätze; Bandangabe vorne im Titel erkennen
  const titleRaw = title;
  title = cleanTitle(title);
  sortTitle = cleanTitle(sortTitle);
  seriesFromTitle = cleanSeriesName(cleanTitle(seriesFromTitle));
  looseSeries = cleanSeriesName(cleanTitle(looseSeries));
  // Untertitel, der im Titel steckt: „Katzenjagd : Roman“ → Titel „Katzenjagd“
  const split = splitTitleSubtitle(title);
  if (split) {
    title = split.title;
    sortTitle = splitTitleSubtitle(sortTitle)?.title || sortTitle;
    subtitle = subtitle || split.subtitle;
  }
  const pre = splitVolumePrefix(title);
  if (pre && (!seriesFromTitle || sameSeries(pre.series, seriesFromTitle))) {
    seriesFromTitle = seriesFromTitle || pre.series;
    volume = volume || pre.volume;
    title = capitalize(pre.title);
    sortTitle = title.replace(/^(der|die|das|ein|eine)\s+/i, '');
  }
  // Verlagsreihen („Carlsen 690“, „Reclams Universal-Bibliothek“) sind keine Buchreihen
  if (isPublisherSeries(seriesFromTitle, publisher)) { seriesFromTitle = ''; volume = ''; }
  if (isPublisherSeries(looseSeries, publisher)) looseSeries = '';
  let year = plausibleYear((pub ? sub(pub, 'c') : '').match(/\d{4}/)?.[0]);
  if (!year) year = plausibleYear(control(rec, '008').slice(7, 11));

  const subjectGroups = [];
  for (const tag of ['082', '083', '084']) {
    for (const f of fields(rec, tag)) {
      if (sub(f, '2').includes('sdnb')) subjectGroups.push(...subs(f, 'a'));
    }
  }
  const genres = fields(rec, '655').filter((f) => sub(f, '2') === 'gatbeg').map((f) => tidy(sub(f, 'a')));
  const themes = fields(rec, '926').map((f) => sub(f, 'x')).filter(Boolean);
  const keywords653 = fields(rec, '653').map((f) => sub(f, 'a'));
  const productForm = keywords653.find((a) => a.startsWith('(Produktform)'))?.replace('(Produktform)', '');
  // Signale für „kein herkömmliches Buch“ (Kalender, Spiel, Box …) – ausgewertet in js/classify.js
  const productForms = keywords653.filter((a) => a.startsWith('(Produktform')).map((a) => a.replace(/^\([^)]*\)\)?/, '').trim());
  const formTerms = fields(rec, '655').filter((f) => sub(f, '2') !== 'gatbeg').map((f) => tidy(sub(f, 'a'))).filter(Boolean);
  const leader = list(rec.getElementsByTagNameNS(MARC_NS, 'leader'))[0]?.textContent || '';
  const extent = fields(rec, '300')[0] ? tidy(sub(fields(rec, '300')[0], 'a')) : '';

  const contentTypes = fields(rec, '336').flatMap((f) => subs(f, 'b'));
  const mediaTypes = fields(rec, '337').flatMap((f) => subs(f, 'b'));
  const isEbook = mediaTypes.includes('c');
  // Hörbücher (CD, Download) ausfiltern: gedruckter oder digitaler Text ja, gesprochenes Wort nein.
  const pagesText = fields(rec, '300')[0] ? sub(fields(rec, '300')[0], 'a') : '';
  const looksAudio = /\b(CD|CDs|MP3|Audio|Hörbuch|Tonträger)\b/i.test(pagesText) || /audio|hörverlag|hörbuch/i.test(publisherRaw(rec));
  const isPrintText = (!contentTypes.length || contentTypes.includes('txt')) && !isEbook && !looksAudio;

  const blurb = fields(rec, '856').find((f) => sub(f, '3') === 'Inhaltstext');

  return {
    idn,
    isbns,
    relatedIsbns,
    authors: authorsRaw.filter(Boolean).map(displayName),
    authorsSort: authorsRaw.filter(Boolean),
    title,
    titleRaw, // ungekürzt – für Regeln wie „[u.a.]“ (Sammelband) in js/classify.js
    sortTitle,
    subtitle,
    workTitle,
    edition: tidy(fields(rec, '250')[0] ? sub(fields(rec, '250')[0], 'a') : ''),
    publisher,
    year,
    pages: fields(rec, '300')[0] ? tidy(sub(fields(rec, '300')[0], 'a')) : '',
    // Nur die Reihe aus dem Titel – Feld 490 enthält oft bloß Verlagsreihen wie „cbj Fantasy“.
    series: seriesFromTitle,
    volume,
    looseSeries, // Reihe ohne Bandnummer, nur ein Kandidat (siehe groupEditions)
    subjectGroups,
    genres,
    themes,
    // GND-Schlagworte (650 Sachschlagwort, 689 Schlagwortkette, 655 Formschlagwort) – Ersatz-Genre für Bücher ohne
    // Gattungsbegriff (13.11.2026, fillGenres in works.js)
    subjects: [...new Set([...fields(rec, '650'), ...fields(rec, '689')].map((f) => tidy(sub(f, 'a'))).concat(formTerms).filter(Boolean))].slice(0, 8),
    binding: bindingLabel(productForm, isEbook),
    productForms,
    formTerms,
    extent,
    leader19: leader.charAt(19),
    hasAuthor: authorsRaw.some(Boolean),
    // Beliebtheit: Der Buchhandel kennzeichnet Bestseller in den Schlagwörtern („spiegel bestseller“, „Bestsellerliste Spiegel“)
    isBestseller: keywords653.some((k) => /bestseller/i.test(k)),
    isEbook,
    isPrintText,
    isComic: subjectGroups.some((g) => g.startsWith('741.5')),
    blurbUrl: blurb ? sub(blurb, 'u') : '',
  };
}

function publisherRaw(rec) {
  const pub = fields(rec, '264').find((f) => f.getAttribute('ind2') === '1') || fields(rec, '260')[0];
  return pub ? sub(pub, 'b') : '';
}

function bindingLabel(form = '', isEbook) {
  if (isEbook) return 'E-Book';
  const f = form.toLowerCase();
  if (f.includes('hardback')) return 'Hardcover';
  if (f.includes('paperback') || f.includes('softback')) return 'Taschenbuch';
  return form || '';
}
