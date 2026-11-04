// Zentrale Einstellungen. Neue Sachgruppen (z. B. '900' für Geschichte) einfach hier ergänzen.
export const CONFIG = {
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
  },
  // Cover-Quellen in dieser Reihenfolge, pro ISBN. Den DNB-Coverdienst nutzen wir im Browser nicht:
  // portal.dnb.de schaltet dort eine Bot-Prüfseite vor, die wir nicht umgehen.
  covers: {
    maxIsbns: 4,
    sources: [
      (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
      (isbn) => `https://books.google.com/books/content?vid=ISBN${isbn}&printsec=frontcover&img=1&zoom=1`,
    ],
    // Google liefert bei fehlendem Cover ein „image not available“-Bild (PNG) in einer dieser Größen.
    // Echte Cover kommen als JPEG und haben fast immer andere Maße.
    googlePlaceholderSizes: ['128x184', '128x170'],
    isPlaceholder(img) {
      if (img.naturalWidth < 10) return true;
      return img.src.includes('books.google.') && this.googlePlaceholderSizes.includes(`${img.naturalWidth}x${img.naturalHeight}`);
    },
  },
};
