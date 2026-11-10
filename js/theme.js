// Darstellung (10.11.2026): Stil „Papier & Tinte“ oder „Klassisch“ und eine Akzentfarbe – pro Gerät gespeichert.
// Setzt data-style / data-accent an <html>; die Farben stehen in css/style.css.
import { settings } from './settings.js';
import { el } from './util.js';

export const STYLES = { paper: 'Papier & Tinte', classic: 'Klassisch' };
export const ACCENTS = {
  tinte: { label: 'Tinte', color: '#2b4a6f' },
  salbei: { label: 'Salbei', color: '#2f5d50' },
  bordeaux: { label: 'Bordeaux', color: '#7d2f3c' },
  ocker: { label: 'Ocker', color: '#8a6417' },
  pflaume: { label: 'Pflaume', color: '#5d3f73' },
  petrol: { label: 'Petrol', color: '#1d6470' },
};

export function currentLook() {
  const style = STYLES[settings.get('style')] ? settings.get('style') : 'paper';
  const accent = ACCENTS[settings.get('accent')] ? settings.get('accent') : (style === 'paper' ? 'tinte' : 'salbei');
  return { style, accent };
}

export function applyTheme() {
  const { style, accent } = currentLook();
  document.documentElement.dataset.style = style;
  document.documentElement.dataset.accent = accent;
  // Farbe der Statusleiste am Handy passend zur Kopfleiste
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = style === 'paper' ? getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f7f1e5' : ACCENTS[accent].color;
}

/** Einstellungsbereich „Darstellung“ (in Meine Bücher unter „Daten sichern“). */
export function renderLook(container, extras = () => []) {
  const { style, accent } = currentLook();
  const rerender = () => { applyTheme(); renderLook(container, extras); };
  const styleBtns = Object.entries(STYLES).map(([k, label]) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(style === k), text: label,
    onclick: () => { settings.set('style', k); rerender(); },
  }));
  const swatches = Object.entries(ACCENTS).map(([k, a]) => el('button', {
    type: 'button', class: 'swatch', 'aria-pressed': String(accent === k), 'aria-label': a.label, title: a.label,
    style: `background:${a.color}`,
    onclick: () => { settings.set('accent', k); rerender(); },
  }));
  container.replaceChildren(
    el('div', { class: 'row' }, el('span', { class: 'lbl', text: 'Stil' }), el('span', { class: 'swatches' }, ...styleBtns)),
    el('div', { class: 'row' }, el('span', { class: 'lbl', text: 'Akzentfarbe' }), el('span', { class: 'swatches' }, ...swatches)),
    el('p', { class: 'status', text: `${ACCENTS[accent].label} · gilt nur auf diesem Gerät.` }),
    ...extras(), // z. B. „Geburtstagsgruß noch einmal ansehen“ – bleibt auch nach einem Wechsel stehen
  );
}

// Statusleisten-Farbe nachziehen, wenn das Handy zwischen hell und dunkel wechselt
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
