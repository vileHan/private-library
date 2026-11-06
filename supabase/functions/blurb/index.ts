// Supabase Edge Function „blurb“: holt den Klappentext (Inhaltstext des Verlags) eines Buchs von der DNB.
// Warum hier und nicht in der App? Die DNB erlaubt den Abruf aus fremden Webseiten nicht (kein CORS),
// und alle Texte in der Datenbank zu speichern wären ~300 MB (Grenze 500 MB).
// Gratis-Tarif: 500.000 Aufrufe/Monat. Es wird nichts gespeichert.
//
// Aufruf: GET /functions/v1/blurb?isbn=9783630874876,9783442...  (bis zu 12 ISBNs eines Werks, wichtigste zuerst)
// Antwort: { "text": "…" } – leerer Text, wenn es keinen Klappentext gibt.
// Veröffentlichen: Workflow „Supabase-Funktionen“ (.github/workflows/functions.yml).

const SRU = 'https://services.dnb.de/sru/dnb';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function reply(body: unknown, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** HTML der DNB-Seite → schlichter Text mit Absätzen */
function htmlToText(html: string) {
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
  return decode(body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .normalize('NFC')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
    .slice(0, 6000);
}

/** Datensätze mit Inhaltstext, sortiert nach der Reihenfolge der angefragten ISBNs */
async function candidates(isbns: string[]) {
  const query = isbns.map((i) => `num=${i}`).join(' or ');
  const url = `${SRU}?version=1.1&operation=searchRetrieve&recordSchema=MARC21-xml&maximumRecords=30&query=${encodeURIComponent(query)}`;
  const xml = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).text();
  const found: { idn: string; rank: number }[] = [];
  for (const rec of xml.split(/<record\s/).slice(1)) {
    const idn = rec.match(/<controlfield tag="001">([^<]+)</)?.[1];
    if (!idn) continue;
    const hasBlurb = [...rec.matchAll(/<datafield tag="856"[\s\S]*?<\/datafield>/g)]
      .some((m) => /<subfield code="3">Inhaltstext</.test(m[0]));
    if (!hasBlurb) continue;
    const recIsbns = [...rec.matchAll(/<datafield tag="020"[\s\S]*?<\/datafield>/g)]
      .flatMap((m) => [...m[0].matchAll(/<subfield code="[a9]">([0-9Xx-]+)/g)].map((s) => s[1].replace(/-/g, '')));
    const ranks = recIsbns.map((i) => isbns.indexOf(i)).filter((r) => r >= 0);
    found.push({ idn, rank: ranks.length ? Math.min(...ranks) : isbns.length });
  }
  return found.sort((a, b) => a.rank - b.rank);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const isbns = [...new Set((new URL(req.url).searchParams.get('isbn') || '')
    .split(',').map((s) => s.trim().replace(/-/g, '')).filter((s) => /^(\d{9}[\dXx]|\d{13})$/.test(s)))].slice(0, 12);
  if (!isbns.length) return reply({ text: '', error: 'isbn fehlt' });
  try {
    for (const { idn } of (await candidates(isbns)).slice(0, 3)) {
      const res = await fetch(`https://services.dnb.de/plus/idn/${encodeURIComponent(idn)}/blurb/`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const text = htmlToText(await res.text());
      if (text.length >= 40) return reply({ text }, 604800); // eine Woche im Browser zwischenspeichern
    }
    return reply({ text: '' }, 86400);
  } catch (e) {
    return reply({ text: '', error: String(e) });
  }
});
