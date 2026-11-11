// Darstellung (10.11.2026): Stil „Papier & Tinte“ oder „Klassisch“ und eine Akzentfarbe – pro Gerät gespeichert.
// Setzt data-style / data-accent an <html>; die Farben stehen in css/style.css.
import { settings } from './settings.js';
import { el } from './util.js';

export const STYLES = { paper: 'Papier & Tinte', classic: 'Klassisch' };
// Hell/Dunkel: „Automatisch“ folgt der Handy-Einstellung (Standard), sonst fest (data-scheme an <html>, 10.11.2026)
export const SCHEMES = { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' };
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
  const scheme = SCHEMES[settings.get('scheme')] ? settings.get('scheme') : 'auto';
  return { style, accent, scheme };
}

export function applyTheme() {
  const { style, accent, scheme } = currentLook();
  if (scheme === 'auto') delete document.documentElement.dataset.scheme; else document.documentElement.dataset.scheme = scheme;
  document.documentElement.dataset.style = style;
  document.documentElement.dataset.accent = accent;
  // Farbe der Statusleiste am Handy passend zur Kopfleiste
  const meta = document.querySelector('meta[name="theme-color"]');
  const css = getComputedStyle(document.documentElement);
  if (meta) meta.content = (css.getPropertyValue(style === 'paper' ? '--bg' : '--accent').trim()) || ACCENTS[accent].color;
}

/** Einstellungsbereich „Darstellung“ (in Meine Bücher unter „Daten sichern“). */
export function renderLook(container, extras = () => []) {
  const { style, accent, scheme } = currentLook();
  const rerender = () => { applyTheme(); renderLook(container, extras); };
  const styleBtns = Object.entries(STYLES).map(([k, label]) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(style === k), text: label,
    onclick: () => { settings.set('style', k); rerender(); },
  }));
  const schemeBtns = Object.entries(SCHEMES).map(([k, label]) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(scheme === k), text: label,
    onclick: () => { settings.set('scheme', k); rerender(); },
  }));
  const swatches = Object.entries(ACCENTS).map(([k, a]) => el('button', {
    type: 'button', class: 'swatch', 'aria-pressed': String(accent === k), 'aria-label': a.label, title: a.label,
    style: `background:${a.color}`,
    onclick: () => { settings.set('accent', k); rerender(); },
  }));
  container.replaceChildren(
    el('div', { class: 'row' }, el('span', { class: 'lbl', text: 'Modus' }), el('span', { class: 'swatches' }, ...schemeBtns)),
    el('div', { class: 'row' }, el('span', { class: 'lbl', text: 'Stil' }), el('span', { class: 'swatches' }, ...styleBtns)),
    el('div', { class: 'row' }, el('span', { class: 'lbl', text: 'Akzentfarbe' }), el('span', { class: 'swatches' }, ...swatches)),
    el('p', { class: 'status', text: `${ACCENTS[accent].label} · gilt nur auf diesem Gerät.` }),
    ...extras(), // z. B. „Geburtstagsgruß noch einmal ansehen“ – bleibt auch nach einem Wechsel stehen
  );
}

// Statusleisten-Farbe nachziehen, wenn das Handy zwischen hell und dunkel wechselt
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
