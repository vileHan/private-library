// Kleine Einstellungen pro Gerät (nur Komfort, z. B. Raster- oder Listenansicht).
// localStorage kann in privaten Fenstern fehlen – dann gilt einfach der Standard.
const KEY = 'bibliothek-einstellungen';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export const settings = {
  get(name, fallback) { const v = load()[name]; return v === undefined ? fallback : v; },
  set(name, value) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...load(), [name]: value })); } catch { /* egal */ }
  },
};
