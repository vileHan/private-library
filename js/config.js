// Zentrale Einstellungen. Neue Sachgruppen (z. B. '900' für Geschichte) einfach hier ergänzen.
export const CONFIG = {
  // Eigene Katalog-Datenbank. Beide Werte sind öffentlich (nur Leserechte). Leer = live bei der DNB suchen.
  supabase: {
    url: 'https://vdkobcydrflzamrqrwtu.supabase.co',
    anonKey: 'sb_publishable_lbKwD07G85vD_xNZ50imqQ_Kt_EfKeu',
  },
  dnb: {
    endpoint: 'https://services.dnb.de/sru/dnb',
    pageSize: 50,            // Datensätze pro Abruf (DNB erlaubt max. 100)
  },
  catalogFilter: {
    language: 'ger',
    fromYear: 2000,
    // DNB-Sachgruppen: B = Belletristik, K = Kinder- und Jugendliteratur
    subjectGroups: ['B', 'K'],
    // Selfpublishing-Plattformen ausschließen
    excludedPublishers: ['epubli', 'Books on Demand', 'tredition', 'Neopubli'],
    excludeThesis: true,     // Hochschulschriften (Dissertationen usw.)
    // Gattungen ohne erzählende Bücher (siehe GENRE_GROUPS in js/classify.js):
    // spielLernen = Rätsel-/Bastel-/Lernhefte, geschenk = Geschenkbücher & Kalender, kinderSachbuch = Kinder-Sachbücher
    excludeGenreGroups: ['spielLernen', 'geschenk', 'kinderSachbuch'],
  },
  // Cover-Quellen in dieser Reihenfolge, pro ISBN. Den DNB-Coverdienst nutzen wir im Browser nicht:
  // portal.dnb.de schaltet dort eine Bot-Prüfseite vor, die wir nicht umgehen.
  covers: {
    maxIsbns: 4,
    timeoutMs: 5000, // so lange auf eine Cover-Quelle warten, dann die nächste
    // Open-Library-Cover über die Cover-ID (aus der Datenbank) – ohne Ratenbegrenzung.
    byId: (id) => `https://covers.openlibrary.org/b/id/${id}-M.jpg`,
    // Über die ISBN: zuerst Google (schnell). Open Library erlaubt per ISBN nur 100 Abrufe pro 5 Minuten
    // und lässt Anfragen danach hängen – deshalb nur als letzte Möglichkeit (siehe coverUrls in card.js).
    sources: [
      (isbn) => `https://books.google.com/books/content?vid=ISBN${isbn}&printsec=frontcover&img=1&zoom=1`,
    ],
    lastResort: (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
    // Google liefert bei fehlendem Cover ein „image not available“-Bild (PNG) in einer dieser Größen.
    // Echte Cover kommen als JPEG und haben fast immer andere Maße.
    googlePlaceholderSizes: ['128x184', '128x170'],
    isPlaceholder(img) {
      if (img.naturalWidth < 10) return true;
      return img.src.includes('books.google.') && this.googlePlaceholderSizes.includes(`${img.naturalWidth}x${img.naturalHeight}`);
    },
  },
};
