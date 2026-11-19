// Hinweis „Als App auf den Home-Bildschirm“ (19.11.2026). Erscheint nach der ersten Anmeldung auf einem Gerät, wenn
// die Seite noch im Browser läuft, und bleibt – auch nach Neuladen – stehen, bis „Verstanden“ getippt wird
// (settings `installHint`, pro Gerät). So bleibt die Anleitung sichtbar, während man die Schritte macht.
// Jederzeit wieder aufrufbar unter Einstellungen → Konto.
import { settings } from './settings.js';
import { el } from './util.js';

export const isStandalone = () => navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/.test(navigator.userAgent);

function steps() {
  if (isStandalone()) return [el('p', { text: 'Du nutzt die Bibliothek schon als App vom Home-Bildschirm. 👍' })];
  const list = isIos()
    ? ['Diese Seite in <b>Safari</b> öffnen.', 'Unten auf <b>Teilen</b> tippen (Quadrat mit Pfeil nach oben).', 'Nach unten wischen und <b>„Zum Home-Bildschirm“</b> wählen, dann <b>„Hinzufügen“</b>.']
    : isAndroid()
      ? ['Diese Seite in <b>Chrome</b> öffnen.', 'Oben rechts auf <b>⋮</b> tippen.', '<b>„App installieren“</b> bzw. <b>„Zum Startbildschirm hinzufügen“</b> wählen.']
      : ['Im Browser-Menü <b>„App installieren“</b> bzw. <b>„Zum Startbildschirm“</b> wählen (Chrome, Edge, Safari).'];
  const ol = el('ol');
  for (const s of list) { const li = el('li'); li.innerHTML = s; ol.append(li); } // feste Texte, keine Eingaben
  return [ol, el('p', { class: 'install-note', text: 'Danach die App vom Home-Bildschirm öffnen und dich dort einmal anmelden – die App hat ihren eigenen Speicher. Deine Bücher kommen dann aus dem Konto.' })];
}

/** Hinweis zeigen (bleibt, bis „Verstanden“ getippt wird). */
export function showInstallHint() {
  if (document.querySelector('.install-hint')) return;
  settings.set('installHint', true);
  const card = el('aside', { class: 'install-hint', role: 'dialog', 'aria-label': 'Als App installieren' },
    el('div', { class: 'install-head' },
      el('span', { class: 'install-ico', 'aria-hidden': 'true', text: '📲' }),
      el('h2', { text: 'Als App auf den Home-Bildschirm' })),
    ...steps(),
    el('button', {
      type: 'button', class: 'install-ok', text: 'Verstanden',
      onclick: () => { settings.set('installHint', false); card.remove(); },
    }));
  document.body.append(card);
}

/** Beim Start: noch nicht weggeklickter Hinweis kommt wieder (nicht in der installierten App). */
export function initInstallHint() {
  if (settings.get('installHint', false) && !isStandalone()) showInstallHint();
}
