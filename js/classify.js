// Entscheidet, ob eine DNB-Ausgabe ein „herkömmliches Buch“ für den Katalog ist.
// Wird vom Import (scripts/import.mjs) und von der App im DNB-Live-Modus genutzt.
// Jede Regel liefert einen Grund – so lässt sich in Tests und Berichten nachvollziehen, warum etwas fehlt.
// Testfälle: tests/cases.js (im Browser: tests/index.html, in GitHub Actions: Workflow „Tests“).

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
]);
// Nur verdächtig, wenn die Gattung nicht erzählend ist oder fehlt
// (sonst flöge z. B. Arno Geigers Roman „Alles über Sally“ raus):
const NON_BOOK_TITLE_WEAK = words([
  'sticker', 'poster', 'puzzle', 'postkarten', 'filmbuch', 'begleitbuch', 'fanbuch', 'alles über', 'lexikon', 'enzyklopädie',
  'bildwörterbuch', 'das offizielle (buch|malbuch|stickerbuch|rätselbuch|kochbuch|fanbuch|handbuch)', 'kalender',
]);
const NON_NARRATIVE_GENRE = /Sachb|Spiel|Lernen|Geschenk|Kalender|Ratgeber|Bildung|Nachschlage/;

/**
 * @param e  ausgewertete Ausgabe aus parseRecord (js/dnb.js)
 * @param opts.excludeGenreGroups  Liste von Schlüsseln aus GENRE_GROUPS
 * @returns  { keep: true } oder { keep: false, reason: 'kurzer Grund' }
 */
export function classify(e, { excludeGenreGroups = Object.keys(GENRE_GROUPS) } = {}) {
  if (e.leader19 === 'a' || /^\d+\s+Bände/.test(e.extent || '')) return { keep: false, reason: 'Sammelaufnahme/Paket' };
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
  // Zeitschriftenhefte: „Hot Topic!, 2024, 5“, „5!, 2024, Nr. 1“
  if (/,\s*(19|20)\d{2},\s*(Nr\.\s*|Heft\s*)?\d+$/.test(e.title || '')) return { keep: false, reason: 'Zeitschriftenheft' };
  const text = `${e.title || ''} ${e.subtitle || ''}`;
  const m = text.match(NON_BOOK_TITLE);
  if (m) return { keep: false, reason: `Titel: „${m[0].trim()}“` };
  if (!narrativeGenre) {
    const w = text.match(NON_BOOK_TITLE_WEAK);
    if (w) return { keep: false, reason: `Titel (ohne erzählende Gattung): „${w[0].trim()}“` };
  }
  return { keep: true };
}
