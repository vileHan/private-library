// Stöber-Genres: fassen die ~150 DNB-Gattungsbegriffe zu 15 Gruppen zusammen.
// MUSS zur SQL-Funktion genre_group() in supabase/schema.sql passen (gleiche Reihenfolge, gleiche Muster).
export const GENRES = [
  ['Krimis & Thriller', /\bkrimi|thriller|spannung|spionage|mystery|detektiv|noir/i],
  ['Fantasy', /fantasy|fantastisch|magisch/i],
  ['Science-Fiction', /science.?fiction|dystop|cyberpunk|space opera/i],
  ['Märchen & Sagen', /märchen|\bsagen|mythen|legende/i],
  ['Romane & Erzählungen', /erzähl|gegenwart|belletristik|roman|klassi|unterhaltung|anthologie|literatur|novelle|kurzgeschicht|zweisprachig/i],
  ['Liebesromane', /liebes|romance|erotik|erotisch|romantisch|new adult/i],
  ['Historische Romane', /histori/i],
  ['Horror', /horror|grusel|unheimlich|gothic/i],
  ['Humor & Satire', /humor|satire|komisch|cartoon|witz/i],
  ['Abenteuer', /abenteuer|western|wildwest|seefahrt/i],
  ['Biografische Romane', /biogra|memoir|erinnerung/i],
  ['Kinderbücher', /kinder|bilderb|erstlese|vorlese|bis 11|vorschul/i],
  ['Jugendbücher', /jugend|ab 12|young adult/i],
  ['Comics & Manga', /comic|manga|graphic novel|bildergeschichte/i],
  ['Lyrik & Drama', /lyrik|dramatik|gedicht|poesie|drama|libretti|ballade/i],
];

// Reihenfolge der Prüfung wie in SQL (die Anzeige-Reihenfolge oben ist nach Beliebtheit fürs Stöbern sortiert)
const ORDER = ['Comics & Manga', 'Krimis & Thriller', 'Science-Fiction', 'Märchen & Sagen', 'Fantasy', 'Horror', 'Liebesromane',
  'Historische Romane', 'Humor & Satire', 'Abenteuer', 'Lyrik & Drama', 'Biografische Romane', 'Kinderbücher',
  'Jugendbücher', 'Romane & Erzählungen'];
const BY_NAME = new Map(GENRES);

/** DNB-Gattungsbegriff → Stöber-Genre ('' = keins/Sonstiges) */
export function genreGroup(g = '') {
  if (!g) return '';
  return ORDER.find((name) => BY_NAME.get(name).test(g)) || '';
}
