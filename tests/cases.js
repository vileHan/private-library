// Testfälle für die Katalogregeln (js/classify.js) und das Zusammenfassen zu Werken (js/works.js).
// Die Daten werden live von der DNB geholt – so testen wir gegen echte Datensätze.
// Ausführen: im Browser tests/index.html (lokaler Server), in GitHub Actions Workflow „Tests“.
import { CONFIG } from '../js/config.js';
import { fetchRecords, searchDnb } from '../js/dnb.js';
import { classify } from '../js/classify.js';
import { groupEditions, normalizeText } from '../js/works.js';
import { cleanTitle, splitVolumePrefix, isPublisherSeries } from '../js/titles.js';

// Muss im Katalog bleiben (ISBN → Titel zur Lesbarkeit)
export const KEEP = {
  '9783630874876': 'Unterleuten (Roman)',
  '9783570304280': 'Eragon – Der Auftrag des Ältesten',
  '9783426503737': 'Der Augenjäger (Thriller)',
  '9783702242329': '17 Erkenntnisse über Leander Blum (Jugendroman mit zusätzlicher Lerngattung)',
  '9783950194753': 'Das eherne Zeitalter (Gedichte, fälschlich als Merchandise markiert)',
  '9783962380946': 'Der Erdbeerbaum (Kinderbuch mit zusätzlicher Sachgattung)',
  '9783851979053': 'Der Karatehamster (Kinderbuch)',
  '9783404158768': 'Getäuscht (Thriller, alter Datensatz ohne Gattung)',
  '9783257237085': 'Glatteis (Roman, alter Datensatz ohne Gattung)',
  '9783764502737': 'Göttertrank (historischer Roman)',
  '9783948722364': 'Hey, hey, hey, Taxi! 2 (Saša Stanišić)',
  '9783907459201': 'Das Bündnis (Roman mit Karton-Einband „Card cover“)',
  '9783765569180': 'Der Bär, das Mädchen … (Bilderbuch, „Hardback (stationery)“)',
  '9783551691156': 'Hilfe! Eine Woche ohne Handy (Erstlesebuch)',
  '9783702241865': 'Das flüchtige Nu des Lebens (literarisches Lesebuch)',
};

// Muss herausfallen
export const DROP = {
  '9783570132692': 'Hinter den Kulissen von Eragon – das Filmbuch (Jugendsachbuch)',
  '9783570138755': 'Eragon – alles über die fantastische Welt Alagaësia (Begleitbuch)',
  '9783836954228': 'Fiete Anders – Trinkflasche (Merchandise)',
  '9783950501476': 'Hyänenkind – Rollenspiel-Kampagne',
  '9783625185987': 'Der große Rätselblock 51',
  '9783664265329': 'Der Damhirsch (Wandkalender)',
  '9783831004683': 'Mein erster Weltatlas',
  '9783649604525': 'Ferien am Meer – Malblock',
};

async function byIsbn(isbn) {
  const res = await fetchRecords(`num=${isbn}`, 1, { pageSize: 10, keepAll: true });
  return res.editions.find((e) => e.isbns.includes(isbn));
}

/** Führt alle Tests aus und liefert [{ name, ok, detail }] */
export async function runAll() {
  const results = [];
  const opts = { excludeGenreGroups: CONFIG.catalogFilter.excludeGenreGroups };
  for (const [isbn, label] of Object.entries(KEEP)) {
    const e = await byIsbn(isbn);
    const r = e ? classify(e, opts) : { keep: false, reason: 'bei der DNB nicht gefunden' };
    results.push({ name: `bleibt: ${label}`, ok: !!e && r.keep && e.isPrintText, detail: r.reason || (e?.isPrintText ? '' : 'nicht als gedruckter Text erkannt') });
  }
  for (const [isbn, label] of Object.entries(DROP)) {
    const e = await byIsbn(isbn);
    const r = e ? classify(e, opts) : { keep: true, reason: 'bei der DNB nicht gefunden' };
    results.push({ name: `fällt raus: ${label}`, ok: !!e && !r.keep, detail: r.reason || '' });
  }

  // Eragon: Bände sauber getrennt, „Eragon“-Ausgaben richtig zugeordnet, kein Begleitbuch ohne Autor
  const editions = [];
  for (let cursor = 1, i = 0; cursor && i < 4; i++) {
    const res = await searchDnb('Eragon', cursor);
    editions.push(...res.editions);
    cursor = res.next;
  }
  const works = groupEditions(editions);
  const find = (isbn) => works.find((w) => w.isbns.includes(isbn));
  const v1 = find('9783442366064'); // „Eragon : das Vermächtnis der Drachenreiter ; Roman zum Film“
  results.push({ name: 'Eragon-Filmausgabe gehört zu „Das Vermächtnis der Drachenreiter“', ok: v1?.title === 'Das Vermächtnis der Drachenreiter', detail: v1 ? `${v1.title} (${v1.editions.length} Ausgaben)` : 'nicht gefunden' });
  const gabel = find('9783570313947');
  results.push({ name: '„Die Gabel, die Hexe und der Wurm“ ist ein eigenes Buch', ok: !!gabel && /Gabel/.test(gabel.title) && !gabel.isbns.includes('9783442366064'), detail: gabel ? gabel.title : 'nicht gefunden' });
  const v2 = find('9783570304280');
  results.push({ name: '„Der Auftrag des Ältesten“ hat 5–12 Ausgaben', ok: !!v2 && v2.editions.length >= 5 && v2.editions.length <= 12, detail: v2 ? `${v2.editions.length} Ausgaben` : 'nicht gefunden' });
  const plain = works.filter((w) => w.title === 'Eragon');
  results.push({ name: 'Kein Werk heißt nur „Eragon“', ok: plain.length === 0, detail: plain.map((w) => `${w.title} / ${w.authors.join(', ') || 'ohne Autor'}`).join('; ') });
  const noAuthor = works.filter((w) => !w.authors.length);
  results.push({ name: 'Keine Eragon-Treffer ohne Autor', ok: noAuthor.length === 0, detail: noAuthor.map((w) => w.title).join('; ') });

  // Harry Dresden: Übersetzerangabe im Bandtitel („Sturmnacht / [Dt. von: …“) darf keine Doppel-Einträge erzeugen
  const dresden = [];
  for (let cursor = 1, i = 0; cursor && i < 3; i++) {
    const res = await searchDnb('Sturmnacht Butcher', cursor);
    dresden.push(...res.editions);
    cursor = res.next;
  }
  const dWorks = groupEditions(dresden).filter((w) => /Sturmnacht/.test(w.title));
  results.push({ name: '„Sturmnacht“ (Harry Dresden 1) ist genau ein Werk, ohne Übersetzerangabe im Titel',
    ok: dWorks.length === 1 && !dWorks[0].title.includes('/'), detail: dWorks.map((w) => `${w.title} (${w.editions.length})`).join('; ') });

  // ---------- Analyse 11/2026: Franchises ----------
  const grouped = async (query, pages = 4) => {
    const eds = [];
    for (let cursor = 1, i = 0; cursor && i < pages; i++) {
      const res = await searchDnb(query, cursor);
      eds.push(...res.editions);
      cursor = res.next;
    }
    return groupEditions(eds);
  };
  const FAN = /offiziell|fanbuch|filmbuch|begleitbuch|filmzitate|rollenspiel|sticker|enzyklop|aus den filmen|schuber|unnützes/i;

  const hdr = await grouped('Herr der Ringe');
  const hdr3 = hdr.filter((w) => /Tolkien/.test(w.authors.join()) && Number(w.volume) === 3 && /Herr der Ringe/.test(w.series));
  results.push({ name: 'Herr der Ringe Band 3 ist ein Werk (Wiederkehr/Rückkehr des Königs = zwei Übersetzungen)',
    ok: hdr3.length === 1, detail: hdr3.map((w) => `${w.title} (${w.editions.length})`).join('; ') });
  const hdrBad = hdr.filter((w) => FAN.test(`${w.title} ${w.subtitle}`) || /Bd\.|Neuausgabe|Ausgabe in neuer/.test(w.title));
  results.push({ name: 'Herr der Ringe: keine Fan-/Film-/Rollenspielbücher, keine „Bd.“/„Neuausgabe“ im Titel',
    ok: hdrBad.length === 0, detail: hdrBad.map((w) => w.title).join('; ') });

  const percy = (await grouped('Diebe im Olymp', 2)).filter((w) => /Riordan/.test(w.authors.join()));
  results.push({ name: 'Percy Jackson „Diebe im Olymp“ ist genau ein Werk (statt 4 Schreibweisen)',
    ok: percy.length === 1, detail: percy.map((w) => `${w.title} (${w.editions.length})`).join('; ') });

  const hobbitBad = (await grouped('Hobbit', 2)).filter((w) => FAN.test(`${w.title} ${w.subtitle}`));
  results.push({ name: 'Hobbit: keine Film-/Begleit-/Sticker-Bücher, keine Enzyklopädie', ok: hobbitBad.length === 0,
    detail: hobbitBad.map((w) => w.title).join('; ') });

  const narnia = (await grouped('König von Narnia', 2)).filter((w) => /Lewis/.test(w.authors.join()));
  results.push({ name: 'Narnia: „Der König von Narnia“ ohne Klammer-Werbetext, als ein Werk',
    ok: narnia.length >= 1 && narnia.every((w) => !w.title.includes('[')) && narnia.filter((w) => /^Der König von Narnia$/.test(w.title)).length === 1,
    detail: narnia.map((w) => w.title).join('; ') });

  const biss = (await grouped('Biss zum Morgengrauen', 2)).filter((w) => /Meyer/.test(w.authors.join()));
  results.push({ name: 'Biss: Verlagsreihe „Carlsen“ gilt nicht als Buchreihe', ok: biss.length >= 1 && biss.every((w) => !/carlsen/i.test(w.series)),
    detail: biss.map((w) => `${w.title} / ${w.series || '–'}`).join('; ') });

  // ---------- Ohne Netz: Titel-Helfer ----------
  const unit = [
    [cleanTitle('Harry Potter und der Stein der Weisen - Ausgabe zur TV-Serie'), 'Harry Potter und der Stein der Weisen'],
    [cleanTitle('Das Wunder von Narnia – Taschenbuch mit Filmcover'), 'Das Wunder von Narnia'],
    [cleanTitle('Der König von Narnia : [der Fantasy-Bestseller von C.S. Lewis'), 'Der König von Narnia'],
    [cleanTitle('Der Herr der Ringe. Ausgabe in neuer Übersetzung und Rechtschreibung'), 'Der Herr der Ringe'],
    [cleanTitle('Die letzte Ausgabe'), 'Die letzte Ausgabe'],
    [JSON.stringify(splitVolumePrefix('Der Herr der Ringe. Bd. 1 - Die Gefährten')), JSON.stringify({ series: 'Der Herr der Ringe', volume: '1', title: 'Die Gefährten' })],
    [JSON.stringify(splitVolumePrefix('Fahrenheit 451: Roman')), 'null'],
    [String(normalizeText('Die drei ???').includes('fragezeichen')), 'true'],
    [String(isPublisherSeries('Carlsen', 'Hamburg : Carlsen')), 'true'],
    [String(isPublisherSeries('Eragon', 'München : cbj')), 'false'],
  ];
  const wrong = unit.filter(([got, want]) => got !== want);
  results.push({ name: `Titel-Helfer (${unit.length} Einzelprüfungen)`, ok: wrong.length === 0, detail: wrong.map(([g, w]) => `„${g}“ statt „${w}“`).join('; ') });
  return results;
}
