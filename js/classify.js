// Entscheidet, ob eine DNB-Ausgabe ein „herkömmliches Buch“ für den Katalog ist.
// Wird vom Import (scripts/import.mjs) und von der App im DNB-Live-Modus genutzt.
// Jede Regel liefert einen Grund – so lässt sich in Tests und Berichten nachvollziehen, warum etwas fehlt.
// Testfälle: tests/cases.js (im Browser: tests/index.html, in GitHub Actions: Workflow „Tests“).

import { isBundleTitle } from './titles.js';

// Produktform des Buchhandels (MARC 653 „(Produktform)…“): alles, was kein Buch zum Lesen ist.
// Achtung: Bindungsarten wie „Card cover“ oder „Hardback (stationery)“ sind normale Bücher.
const NON_BOOK_FORMS = /calendar|kalender|\bgame\b|merchandise|counterpack|dumpbin|sticker book|colou?ring|join-the-dot|^cards\b|card game|jigsaw|puzzle|\bkit\b|\btoy\b|poster|postcard|diary|journal|notebook|blank book|address book|multiple-item|pack of|wallchart|other printed item|book (and|\+) toy/i;

// Formschlagwörter (MARC 655, GND): Sach- und Gebrauchsbücher.
const NONFICTION_TERMS = new Set(['Kindersachbuch', 'Jugendsachbuch', 'Sachbilderbuch', 'Ratgeber', 'Bildband', 'Atlas',
  'Bestimmungsbuch', 'Führer', 'Wörterbuch', 'Bildwörterbuch', 'Spiel', 'Lehr- und Lernressource', 'Lehrmittel',
  'Kalender', 'Kochbuch', 'Malbuch', 'Bastelbuch', 'Rätselbuch', 'Quiz', 'Lexikon', 'Handbuch', 'Schulbuch']);
// Nicht dabei: „Aufsatzsammlung“ und „Konferenzschrift“ – darunter fallen auch literarische Lesebücher und Anthologien.
// Merchandise-Kennzeichnung ist bei Büchern mit erzählender Gattung manchmal falsch („Das eherne Zeitalter – Gedichte“).
const MERCH_FORMS = /merchandise|other printed item/i;
const FICTION_TERMS = new Set(['Fiktionale Darstellung', 'Belletristische Darstellung']);

// DNB-Gattungsbegriffe (Warengruppen), die keine erzählenden Bücher sind.
// Die beiden Gruppen mit Wahlmöglichkeit stehen in js/config.js (catalogFilter.excludeGenreGroups).
export const GENRE_GROUPS = {
  spielLernen: /^(Spielerisches Lernen|Spielen, Lernen|Lernen im Vorschulalter|Kinder, Jugendliche und Bildung)/,
  geschenk: /^(Geschenkbücher|Immerwährende Kalender)/,
  kinderSachbuch: /^Sachbücher und Sachbilderbücher für Kinder/,
};

// Titel/Untertitel: eindeutige Hinweise auf Beschäftigungs-, Merchandise- und Begleitmaterial.
const words = (list) => new RegExp(list.map((w) => `(^|[^\\p{L}])${w}($|[^\\p{L}])`).join('|'), 'iu');
// Immer eindeutig – egal welche Gattung:
const NON_BOOK_TITLE = words([
  'malbuch', 'ausmalbuch', 'ausmalbilder', 'malblock', 'malheft', 'stickerbuch', 'stickerheft', 'mit (über )?\\d+ stickern',
  'rätselblock', 'rätselheft', 'wandkalender', 'tischkalender', 'kalender \\d{4}', '\\d{4} kalender', 'postkartenbuch', 'postkarten-box',
  'notizbuch', 'lesezeichen', 'bastelbuch', 'bastelblock', 'origami', 'kratzbild(er)?', 'mitmachblock',
  've \\d+', '\\d+ ?x ?\\d+ exemplare', 'übungsheft', 'lernheft', 'arbeitsheft', 'kopiervorlagen', 'lektürehilfe', 'schreibschrift',
  // Fan-, Film- und Begleitmaterial – auch wenn der Verlag „Fantasy“ oder „Kinderbuch“ als Gattung angibt
  // (Analyse 11/2026: Herr der Ringe, Hobbit, Harry Potter, Game of Thrones, Witcher, Narnia)
  'fanbuch', 'filmbuch', 'begleitbuch', '(in)?offiziell(e|en|er|es)?', 'aus den filmen', 'filmzitate', 'zitate aus den filmen',
  'unnützes wissen', 'rollenspiel', 'sichtschirm(-set)?', 'sticker-buch', 'pop-up(-buch)?', 'schülerkalender', 'reiseführer',
  'hinter den kulissen', 'making of', '\\p{L}+-(lexikon|enzyklopädie)', '(lexikon|enzyklopädie) (der|des|zu|über|für|von|aller)',
  // Boxen und Schuber (mehrere Bücher in einer Verpackung)
  'schuber', 'geschenkschuber', '\\p{L}*-?box',
  // Lern- und Beschäftigungsmaterial, Rollenspiel-Abenteuer (Stichprobe 11/2026: „Mein rabenstarker Vorschulblock - Rechnen“,
  // „Die Biene Maja - Lernen ab 3 Jahren“, „Juli Löwenzahn - Mein Kindergarten-Album“, „DSA5 - In den Fängen des Dämons“)
  'vorschulblock', 'lernblock', 'rechenblock', 'übungsblock', 'lernen ab \\d+( jahren)?', 'kindergarten-album',
  'freundebuch', 'dsa\\d',
  // Stichprobe Lernbücher 11/2026 (je ~14 Titel aus 9 Mustern, ~1.000–2.000 Nicht-Bücher geschätzt):
  // Ordner/Verkaufseinheiten, Jahreskalender, Rätsel-/Quizbücher, Übungsbücher, Kreativ-/Ausmalhefte, Lieder, ABC-/Schreiblernbücher
  // Prüfrunde 08.11.2026: „sachwissen“, „quiz“, „sudoku“, „liederbuch“, „kinderlieder“, „ausmal…“ trafen echte Geschichten
  // (GEOlino-Erstleser „mit Extra Sachwissen“, Lesebücher „mit Hufeisen-Quiz“, Sudoku-Krimis, Gedichtbände „Liederbuch“) →
  // hier nur noch eindeutige Formen, die übrigen stehen bei den schwachen Wörtern.
  'sammelordner', 'aktenordner', 'schnellhefter', '\\d+er vk', '\\d+ exemplare', '\\p{L}+kalender \\d{4}',
  'quiz-?buch', 'rätselbuch', 'rätsel-?block', '\\d+ (\\p{L}+ )?rätsel', 'aufgaben und rätsel',
  'rätsel und (spiele|aufgaben)', 'mit über \\d+ rätseln', 'konzentration fördern', 'spielerisch fördern',
  'übungsbuch', '\\p{L}+-übungsbuch', '\\d+ übungen', 'mit übungen', 'handbuch für lehrer', 'lehrerhandbuch',
  'kreativbuch', 'ausmal-?(panorama|block|heft|spaß|buch)', '(buchstaben|zahlen) schreiben', 'schreiben ab \\d',
  'erstes sachwissen', 'verkaufs-?kassette',
  // Nachzählung nach dem Import 09.11.2026 (~240 Werke, alle Beschäftigungs-/Lernbücher): zusammengesetzte Malbücher
  // („Ostermalbuch“, „Megamalbuch“), Witzebücher, Lernbücher („Register-Lernbuch“ – nicht „Leselernbuch“: Erstlese-Geschichten),
  // „100 erste Wörter“, Puzzlebücher
  '\\p{L}+(?<!denk|merk|mahn|grab|mutter|wund|ehren|toten|nacht|ehe)malbuch','\\p{L}*witzebuch', '(\\p{L}+-)?lernbuch', 'erste wörter', '\\p{L}*-?puzzlebuch',
]);
// Nur verdächtig, wenn die Gattung nicht erzählend ist oder fehlt
// (sonst flöge z. B. Arno Geigers Roman „Alles über Sally“ raus):
const NON_BOOK_TITLE_WEAK = words([
  'sticker', 'poster', 'puzzle', 'postkarten', 'alles über', 'lexikon', 'enzyklopädie',
  'bildwörterbuch', 'das offizielle (buch|malbuch|stickerbuch|rätselbuch|kochbuch|fanbuch|handbuch)', 'kalender',
  'mitmachbuch', '\\p{L}+-mitmachbuch', 'rezepte', 'sprüche',
  'quiz', 'sudoku', 'kinderlieder', 'liederbuch', 'ausmalbildern', 'abc-buch', 'rätselspaß', 'jahresheft',
]);
const NON_NARRATIVE_GENRE = /Sachb|Spiel|Lernen|Geschenk|Kalender|Ratgeber|Bildung|Nachschlage/;

/**
 * @param e  ausgewertete Ausgabe aus parseRecord (js/dnb.js)
 * @param opts.excludeGenreGroups  Liste von Schlüsseln aus GENRE_GROUPS
 * @returns  { keep: true } oder { keep: false, reason: 'kurzer Grund' }
 */
export function classify(e, { excludeGenreGroups = Object.keys(GENRE_GROUPS) } = {}) {
  if (e.leader19 === 'a' || /^\d+\s+Bände/.test(e.extent || '')) return { keep: false, reason: 'Sammelaufnahme/Paket' };
  // Selbstverlag über Amazon (KDP/CreateSpace): Verlag „Independently published“ o. ä., ISBNs 979-8 (US-Kontingent von Amazon).
  // Ergänzt den DNB-Filter gegen Selfpublishing (epubli, BoD, tredition, Neopubli) – Stichprobe 11/2026: ~3.900 Werke.
  // Amazons echte Verlagsprogramme mit Lektorat (AmazonCrossing, Amazon Publishing, Tinte & Feder, Edition M) bleiben –
  // Entscheidung des Nutzers 08.11.2026. Deshalb NICHT allgemein auf „amazon“ prüfen.
  if (/independently published|createspace|kindle direct/i.test(e.publisher || '')
    || (e.isbns?.length && e.isbns.every((i) => i.startsWith('9798')))) return { keep: false, reason: 'Selbstverlag (Amazon)' };
  const genres = e.genres || [];
  // Erzählend, sobald mindestens eine Gattung erzählend ist („Jugendbücher ab 12“ + „Spielerisches Lernen“ → erzählend)
  const narrativeGenre = genres.some((g) => !NON_NARRATIVE_GENRE.test(g));
  const form = (e.productForms || []).find((f) => NON_BOOK_FORMS.test(f) && !(narrativeGenre && MERCH_FORMS.test(f)));
  if (form) return { keep: false, reason: `Produktform: ${form}` };
  const terms = e.formTerms || [];
  const nonfiction = terms.find((t) => NONFICTION_TERMS.has(t));
  // Eine erzählende Gattung (z. B. „Erstlesealter“) hat Vorrang vor einem Sachbuch-Schlagwort.
  if (nonfiction && !narrativeGenre && !terms.some((t) => FICTION_TERMS.has(t))) return { keep: false, reason: `Formschlagwort: ${nonfiction}` };
  if (!narrativeGenre) {
    for (const key of excludeGenreGroups) {
      const g = genres.find((x) => GENRE_GROUPS[key]?.test(x));
      if (g) return { keep: false, reason: `Gattung: ${g}` };
    }
  }
  // Sammelbände: „Von Idioten umzingelt [u.a.] : zwei Comic-Romane“, Box „I-VII“
  if (isBundleTitle(e.titleRaw || e.title) || /^[IVX]+\s*[-–]\s*[IVX]+$/i.test(e.title || '')) return { keep: false, reason: 'Sammelband/Box' };
  // Zeitschriftenhefte: „Hot Topic!, 2024, 5“, „5!, 2024, Nr. 1“
  if (/,\s*(19|20)\d{2},\s*(Nr\.\s*|Heft\s*)?\d+$/.test(e.title || '')) return { keep: false, reason: 'Zeitschriftenheft' };
  const text = `${e.title || ''} ${e.subtitle || ''}`;
  const m = text.match(NON_BOOK_TITLE);
  if (m) return { keep: false, reason: `Titel: „${m[0].trim()}“` };
  // Ohne Gattung entscheidet der Untertitel: „Tödliches Sudoku : Kriminalroman“, „Sudoku für Männer : Kurzgeschichten“
  // sind erzählend – schwache Wörter greifen dann nicht (Prüfrunde 08.11.2026).
  // Aber nicht bei Aufzählungen mit Beschäftigungswörtern: „Weihnachten : Geschichten, Gedichte, Bastelideen und Rezepte“,
  // „Der Hai im Strandkorb : Geschichten, Bilderrätsel, Spiele, Postkarten“, „Sticker-Geschichten“ (Prüfrunde 2, 08.11.2026).
  const sub = e.subtitle || '';
  const activityList = /bastel|rätsel|spiele|sticker|weitermal|malbild|wissenswert|tipps|rezepte|postkarte|poster/i.test(sub)
    && (/,/.test(sub) || /(sticker|rätsel|bastel)-?geschichten/i.test(sub));
  // Eindeutige Erzählwörter schützen immer („Keine Rose ohne Dornen : Roman ; mit Mini-Poster, Gewinnspiel …“, Prüfrunde 3);
  // „Geschichten“, „Gedichte“, „Märchen“ nur ohne Beschäftigungs-Aufzählung.
  const word = (list) => new RegExp(`(^|[^\\p{L}])(${list})($|[^\\p{L}])`, 'iu');
  const narrativeSubtitle = word('roman|kriminalroman|krimi|thriller|novelle|erzählung|erzählungen|kurzgeschichten').test(sub)
    || (!activityList && word('geschichten|gedichte|märchen').test(sub));
  if (!narrativeGenre && !narrativeSubtitle) {
    const w = text.match(NON_BOOK_TITLE_WEAK);
    if (w) return { keep: false, reason: `Titel (ohne erzählende Gattung): „${w[0].trim()}“` };
  }
  return { keep: true };
}
