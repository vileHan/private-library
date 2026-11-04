// ISBN-Hilfsfunktionen. Intern wird immer ISBN-13 ohne Bindestriche verwendet.

/** Gibt eine gültige ISBN-13 zurück oder null, wenn die Eingabe keine ISBN ist. */
export function normalizeIsbn(input) {
  if (!input) return null;
  const s = String(input).toUpperCase().replace(/[^0-9X]/g, '');
  if (/^97[89]\d{10}$/.test(s)) return isValid13(s) ? s : null;
  if (/^\d{9}[\dX]$/.test(s)) return isValid10(s) ? isbn10to13(s) : null;
  return null;
}

function isValid13(s) {
  const sum = [...s].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

function isValid10(s) {
  const sum = [...s].reduce((acc, d, i) => acc + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
  return sum % 11 === 0;
}

function isbn10to13(s) {
  const base = '978' + s.slice(0, 9);
  const sum = [...base].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
}

/** Anzeigeformat mit Bindestrich nach dem Präfix (vereinfachte Darstellung). */
export function formatIsbn(isbn) {
  return isbn ? `${isbn.slice(0, 3)}-${isbn.slice(3)}` : '';
}
