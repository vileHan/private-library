// Katalog-Schnittstelle der App: eigene Supabase-Datenbank, wenn eingerichtet – sonst live bei der DNB.
// Die DNB bleibt immer zuständig für ISBN-Suchen (ungefiltert, auch Bücher außerhalb des Katalogs)
// und springt ein, falls Supabase nicht erreichbar ist.
import { CONFIG } from './config.js';
import { searchDnb, editionsByIsbns } from './dnb.js';
import { normalizeIsbn } from './isbn.js';
import { normalizeText, groupEditions } from './works.js';

const sb = CONFIG.supabase;
const useDb = () => !!(sb.url && sb.anonKey);

async function rpc(fn, body, signal) {
  const res = await fetch(`${sb.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: sb.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Datenbank antwortet mit Fehler ${res.status}`);
  return res.json();
}

/**
 * Datenbankzeile → Werk im Format von works.js. Die Datenbank kennt nur die ISBNs der Ausgaben;
 * Details (Verlag, Bindung …) lädt die Karte bei Bedarf über catalog.editionDetails.
 */
function toWork(r) {
  const isbns = (r.isbns || []).map(String);
  return {
    key: r.id,
    title: r.title,
    sortTitle: r.sort_title || r.title,
    subtitle: r.subtitle || '',
    authors: r.authors || [],
    authorSort: r.author_sort || '',
    series: r.series || '',
    volume: r.volume ? String(r.volume) : '',
    year: r.year,
    genre: r.genre || '',
    publisher: '',
    isComic: !!r.is_comic,
    isbns,
    coverIds: r.cover_ids || [],
    coverIsbns: isbns.slice(0, 3),
    editions: [],
  };
}

const PAGE = 50;
const blurbCache = new Map();

export const catalog = {
  get name() { return useDb() ? 'Datenbank' : 'DNB live'; },

  /**
   * Sucht im Katalog. cursor = null für die erste Seite, danach der zurückgegebene next-Wert.
   * Liefert entweder { works } (Datenbank, schon zusammengefasst) oder { editions } (DNB).
   */
  async search(query, cursor = null, signal) {
    if (useDb() && !normalizeIsbn(query)) {
      try {
        const off = cursor ?? 0;
        const tokens = normalizeText(query).split(' ').filter(Boolean);
        const rows = await rpc('search_works', { tokens, lim: PAGE, off }, signal);
        const total = Number(rows[0]?.total || 0);
        return { works: rows.map(toWork), total, next: off + rows.length < total ? off + rows.length : null };
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        console.warn('Datenbank nicht erreichbar, suche live bei der DNB:', err);
      }
    }
    return searchDnb(query, cursor ?? 1, signal);
  },

  /** Ausgaben-Details zu ISBNs (live von der DNB). */
  editionDetails: (isbns) => editionsByIsbns(isbns),

  /** Klappentext von der DNB über die Supabase-Funktion „blurb“ (die DNB erlaubt keinen Direktabruf). '' = keiner. */
  async blurb(isbns) {
    const list = [...new Set(isbns)].filter(Boolean).slice(0, 12);
    if (!sb.url || !list.length) return '';
    const key = list.join(',');
    if (blurbCache.has(key)) return blurbCache.get(key);
    const res = await fetch(`${sb.url}/functions/v1/blurb?isbn=${key}`); // ohne Kopfzeilen → keine Vorab-Anfrage
    if (!res.ok) throw new Error(`Klappentext: Fehler ${res.status}`);
    const { text = '' } = await res.json();
    blurbCache.set(key, text);
    return text;
  },

  /** Alle Bücher eines Autors (A–Z, max. 500). Ohne Datenbank: DNB-Suche nach dem Namen. */
  async authorWorks(author) {
    if (useDb()) {
      try {
        const tokens = normalizeText(author).split(' ').filter((t) => t.length >= 2);
        return (await rpc('author_works', { author, tokens })).map(toWork);
      } catch (err) {
        console.warn('Datenbank nicht erreichbar, suche Autor live bei der DNB:', err);
      }
    }
    const res = await searchDnb(author, 1);
    return groupEditions(res.editions).filter((w) => (w.authors || []).includes(author));
  },

  /** Beliebteste Bücher eines Stöber-Genres (js/genres.js), seitenweise. Nur mit Datenbank. */
  async browseGenre(group, cursor = 0, signal) {
    const rows = await rpc('browse_genre', { grp: group, lim: PAGE, off: cursor }, signal);
    return { works: rows.map(toWork), next: rows.length === PAGE ? cursor + PAGE : null };
  },

  get canBrowse() { return useDb(); },

  /** Alle Bände einer Reihe als Werke. */
  async seriesWorks(series, authorSort) {
    if (useDb()) {
      try {
        return (await rpc('series_works', { series_name: series, author: authorSort || null })).map(toWork);
      } catch (err) {
        console.warn('Datenbank nicht erreichbar, lade Reihe live bei der DNB:', err);
      }
    }
    const surname = (authorSort || '').split(',')[0].trim();
    const editions = [];
    let cursor = 1;
    for (let page = 0; page < 4 && cursor; page++) {
      const res = await searchDnb(`${series} ${surname}`.trim(), cursor);
      editions.push(...res.editions);
      cursor = res.next;
    }
    const key = (s, a) => `${normalizeText(s)}|${normalizeText(a || '')}`;
    return groupEditions(editions).filter((w) => w.series && key(w.series, w.authorSort) === key(series, authorSort));
  },
};
