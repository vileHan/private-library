// Titel und Reihen aus DNB-Datensätzen aufräumen (genutzt von js/dnb.js beim Einlesen).
// Hintergrund: Analyse 11/2026 – dasselbe Buch erschien mehrfach, weil Titel Zusätze trugen:
//   „Harry Potter und der Stein der Weisen - Ausgabe zur TV-Serie“, „Das Wunder von Narnia – Taschenbuch mit Filmcover“,
//   „Der König von Narnia : [der Fantasy-Bestseller …“, „Der Herr der Ringe. Bd. 1 - Die Gefährten“,
//   „Percy Jackson 1: Diebe im Olymp“; dazu Verlagsreihen wie „Carlsen 690“ als vermeintliche Buchreihe.
import { normalizeText } from './works.js';

// Ausgabe-Zusätze (nur mit Trennzeichen davor oder in Klammern – „Die letzte Ausgabe“ bleibt unangetastet)
const EDITION = '(?:sonder|schmuck|jubiläums|neu|geschenk|film|lizenz|luxus|serien|tv|taschenbuch|sammler|pracht|deluxe|jahres)?ausgabe'
  + '|mit filmcover|filmcover|zum kinofilm|zur (?:tv-)?serie|neuübersetzung|in neuer übersetzung';
const EDITION_TAIL = new RegExp(`\\s*[-–:.]\\s+[^-–:]*?(?:${EDITION})[^-–:]*$`, 'iu');
const EDITION_PAREN = new RegExp(`\\s*\\((?=[^()]*(?:\\bband\\b|\\bbd\\.|${EDITION}))[^()]*\\)\\s*$`, 'iu');

/** Entfernt Werbetexte in eckigen Klammern, „[u.a.]“-Zusätze und Ausgabe-Hinweise. */
export function cleanTitle(s = '') {
  let t = s;
  t = t.replace(/\s*\[u\.\s?a\.\]?.*$/i, '');   // „Von Idioten umzingelt [u.a.] : zwei Comic-Romane“
  t = t.replace(/\s*:?\s*\[.*$/, '');            // „Der König von Narnia : [der Fantasy-Bestseller …“
  t = t.replace(EDITION_PAREN, '');              // „(Disney+ Sonderausgabe …)“, „(Die Chroniken von Narnia, Band 2)“
  t = t.replace(EDITION_TAIL, '');               // „ - Neuausgabe 2012“, „. Ausgabe in neuer Übersetzung …“
  t = t.split(/\s+\/\s+/)[0];                    // „Kommissar Kugelblitz, Sammelbd. 8. / Ill. von …“
  t = t.trim();
  return t || s.trim();
}

/**
 * Untertitel, der im Titel steckt (ISBD „ : “): „Katzenjagd : Roman“, „Blutfeind : basierend auf den Figuren von …“.
 * Getrennt wird nur bei Gattungswörtern oder klein geschriebenem Rest – „Star Wars : Das Erwachen …“ bleibt.
 * → { title, subtitle } oder null
 */
export function splitTitleSubtitle(s = '') {
  const m = s.match(/^(.{2,}?)\s+:\s+(.+)$/);
  if (!m) return null;
  const [, title, rest] = m;
  if (/^(roman|ein roman|erzählung|erzählungen|novelle|thriller|krimi|kriminalroman|gedichte|geschichten|märchen)\b/i.test(rest)
    || /^\p{Ll}/u.test(rest)) return { title: title.trim(), subtitle: rest.trim() };
  return null;
}

/** Erscheinungsjahr nur, wenn plausibel (Stichprobe: 31 Werke mit „1072“, „3013“ …) */
export function plausibleYear(y) {
  const n = Number(y);
  return n >= 1450 && n <= new Date().getFullYear() + 2 ? n : null;
}

/** Sammelband mit mehreren Titeln („[u.a.]“) – kein einzelnes Buch. */
export function isBundleTitle(s = '') {
  return /\[u\.\s?a\.\]?/i.test(s);
}

/**
 * Bandangabe vorne im Titel: „Der Herr der Ringe. Bd. 1 - Die Gefährten“, „Percy Jackson 1: Diebe im Olymp“,
 * „Gregs Tagebuch 12 - Und tschüss!“ → { series, volume, title }. Ohne „Bd./Band“ nur bei mehrwortigen Reihennamen
 * und höchstens zweistelligen Nummern („Fahrenheit 451: …“, „Catch 22: …“ bleiben unangetastet).
 */
export function splitVolumePrefix(s = '') {
  const m = s.match(/^(.{3,}?)[.,]?\s+(bd\.|band|teil)?\s*(\d{1,2})\s*[-–:]\s+(.{2,})$/i);
  if (!m) return null;
  const [, series, keyword, volume, title] = m;
  if (!keyword && series.trim().split(/\s+/).length < 2) return null;
  return { series: series.trim(), volume, title: title.trim() };
}

/** Gleiche Reihe? (normalisiert, eine darf mit der anderen beginnen: „Der Herr der Ringe“ ~ „Der Herr der Ringe. …“) */
export function sameSeries(a = '', b = '') {
  const x = normalizeText(a).replace(/^(der|die|das|the)\s+/, '');
  const y = normalizeText(b).replace(/^(der|die|das|the)\s+/, '');
  return !!x && !!y && (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `));
}

// Verlagsreihen und -programme mit Bestellnummer, die keine Buchreihen sind („Carlsen 690“, „Reclams Universal-Bibliothek 18“)
const IMPRINTS = /^(carlsen|reclams?|action|insel|dtv|heyne|goldmann|ullstein|fischer|rororo|blanvalet|btb|cbj|cbt|knaur|piper|diogenes|suhrkamp|arena|oetinger|ravensburger|loewe|thienemann|bastei|luebbe|aufbau|droemer|penhaligon|lyx|klett|cornelsen|hamburger lesehefte?)\b/;

// Typische Namen von Verlags- und Sammelreihen (Stichprobe 11/2026: „Unionsverlag Taschenbuch 238“, „Maxi Pixi 289“,
// „Die ZEIT – Bücherschatz 11“, „Salto 272“, „Must read 22“, „Reihe Lyrik“, „Theatertexte“, „Gesammelte Werke“ …).
// Nicht „Bibliothek“ allgemein – „Die Bibliothek der flüsternden Schatten“ ist eine echte Reihe.
const PUBLISHER_SERIES = /(taschenbuch|taschenbuecher|bibliothek)$|(buecherschatz|pixi|lesemaus|leserabe|leseprofi|lesepiraten|erstleser|lesestufe|theatertexte|einfacher sprache)\b|^(reihe|edition|schriftenreihe|veroeffentlichungen|sammlung|lyrik|poesie|prosa|theater|literatur|werke|gesammelte werke|saemtliche werke|ausgewaehlte werke|must read|salto|kiwi|bvt|kbv)\b|\bklassiker\b|^(bild|welt) am sonntag\b|^schoenen sonntag\b|^sonntagsblatt\b|\bsonntagsblick\b|^allgemeine$/;
// „Bild am Sonntag – Mega Thriller!“ (auch „Bild-am-Sonntag-Mega-Thriller“): Zeitungs-Sonderedition mit Büchern
// verschiedener Autoren, keine Buchreihe (Noah, Der Erlöser … – Nutzerentscheidung 13.11.2026). Ebenso „Welt am
// Sonntag“, „Schönen Sonntag“, „Sonntagsblatt“, „Blick-SonntagsBlick-Bestseller-Edition“ (Weltbild) und die
// Bastei-Lübbe-Verlagsreihe „Allgemeine“ (nur genau dieser Name; McFadyen „Ausgelöscht“ = „Allgemeine, Band 4“).

/**
 * Reihennamen aufräumen: „Band ... der "Children of blood and bone"-Trilogie“ → „Children of blood and bone“,
 * „Selcouth-Reihe“ → „Selcouth“. „-Saga“ bleibt („Die Underworld-Saga“).
 */
export function cleanSeriesName(s = '') {
  const name = s
    .replace(/^band\s*(\.\.\.|…|\d*)\s*(der|des|aus der|aus dem|im|in der)\s+/i, '')
    .replace(/["„“”»«]/g, '')
    .trim();
  // Alle Schreibweisen einer Reihe auf denselben Stamm bringen – die DNB wechselt je Ausgabe („Die Känguru-Trilogie“,
  // „-Tetralogie“, „-Pentalogie“, „-Werke“; „Die Wellenläufer-Reihe“/„-Trilogie“). Ein Versuch mit „Die Känguru-Reihe“
  // als Anzeigename erzeugte Phantom-Werke („Die Wellenläufer-Reihe“) und wurde verworfen (Prüfrunden 09.11.2026).
  // „-Werke“ nur mit Bindestrich („Gesammelte Werke“ bleibt).
  return name.replace(/[-\s](reihe|trilogie|dilogie|tetralogie|pentalogie|hexalogie)$/i, '').replace(/-werke$/i, '').trim();
}

/** Ist die „Reihe“ eigentlich eine Verlagsreihe? */
export function isPublisherSeries(series = '', publisher = '') {
  if (!series) return false;
  if (/^\s*\.\.\./.test(series)) return true; // „... Druck der Mariannenpresse“
  if (/-box\b/i.test(series)) return true; // Verlags-Sammelbox („Fitzek-Box, Band 1–10“), keine Reihe (13.11.2026)
  const s = normalizeText(series);
  if (IMPRINTS.test(s) || PUBLISHER_SERIES.test(s)) return true;
  const pubWord = normalizeText(publisher).split(' ').find((w) => w.length >= 4);
  return !!pubWord && s.split(' ')[0] === pubWord;
}

/** Erster Buchstabe groß („das Erbe von Winterfell“ → „Das Erbe von Winterfell“) */
export const capitalize = (s = '') => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
