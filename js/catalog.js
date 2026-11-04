// Katalog-Schnittstelle der App. Heute steckt die DNB (live) dahinter,
// später die eigene Supabase-Datenbank – die Oberfläche bleibt dabei unverändert.
import { searchDnb } from './dnb.js';

export const catalog = {
  name: 'DNB live',
  /**
   * Sucht im Katalog. cursor = null für die erste Seite, danach der zurückgegebene next-Wert.
   * Liefert Ausgaben; das Zusammenfassen zu Werken übernimmt works.js.
   */
  async search(query, cursor = null, signal) {
    return searchDnb(query, cursor ?? 1, signal);
  },
};
