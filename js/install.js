// Hinweis „Bibliothek als App“ (19./20.11.2026). Erscheint nach der ersten Anmeldung auf einem Gerät, wenn die Seite noch
// im Browser läuft, und bleibt – auch nach Neuladen – stehen, bis „Verstanden“ getippt wird (settings `installHint`,
// pro Gerät). Schritt für Schritt mit den Symbolen, die man wirklich sieht – passend zu Handy und Browser; die Wege für
// andere Geräte/Browser lassen sich aufklappen. Jederzeit wieder aufrufbar unter Einstellungen → Konto.
// Symbole nach Lucide (ISC-Lizenz), als feste Texte eingebaut (keine Eingaben → innerHTML unbedenklich).
import { settings } from './settings.js';
import { el } from './util.js';

export const isStandalone = () => navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;

const svg = (body) => `<svg class="ih-ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICON = {
  share: svg('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>'),
  dotsH: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  dotsV: svg('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>'),
  plus: svg('<rect width="18" height="18" x="3" y="3" rx="3"/><path d="M8 12h8"/><path d="M12 8v8"/>'),
  menu: svg('<line x1="4" x2="20" y1="7" y2="7"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="17" y2="17"/>'),
  install: svg('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M12 7v6"/><path d="m9 10 3 3 3-3"/><path d="M8 21h8"/>'),
};
const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => ICON[k] || '');

const FINISH = 'Fertig! Öffne die Bibliothek ab jetzt über das neue Symbol auf dem Home-Bildschirm und melde dich dort <b>einmal mit Benutzername und Passwort</b> an – die App hat ihren eigenen Speicher.';
const ADD_IOS = 'Keine Sorge, du schickst die Seite <b>niemandem</b>. Wisch im Menü nach oben und scroll nach unten bis <b>„Zum Home-Bildschirm“</b> {plus} – dort antippen. (Fehlt der Eintrag: ganz unten „Aktionen bearbeiten“ und ihn hinzufügen.)';

const GUIDES = {
  iosSafari: {
    title: 'iPhone / iPad mit Safari',
    steps: [
      'Tippe unten auf das <b>Teilen-Symbol</b> {share}. Siehst du es nicht, tippe zuerst auf die <b>drei Punkte</b> {dotsH} neben der Adresszeile und dann auf <b>„Teilen“</b>.',
      ADD_IOS,
      'Oben rechts auf <b>„Hinzufügen“</b> tippen.',
      FINISH,
    ],
  },
  iosOther: {
    title: 'iPhone / iPad mit Chrome, Edge oder Firefox',
    steps: [
      'Tippe oben rechts in der Adresszeile auf das <b>Teilen-Symbol</b> {share}. Bei Chrome kann es auch hinter den <b>drei Punkten</b> {dotsH} unter „Teilen“ liegen.',
      ADD_IOS,
      'Oben rechts auf <b>„Hinzufügen“</b> tippen.',
      FINISH,
    ],
  },
  androidChrome: {
    title: 'Android mit Chrome',
    steps: [
      'Tippe oben rechts auf die <b>drei Punkte</b> {dotsV}.',
      'Wähle <b>„Zum Startbildschirm hinzufügen“</b> {plus} oder <b>„App installieren“</b> – je nach Handy heißt es so. Eventuell ein Stück nach unten scrollen.',
      'Mit <b>„Installieren“</b> bzw. <b>„Hinzufügen“</b> bestätigen.',
      FINISH,
    ],
  },
  androidSamsung: {
    title: 'Samsung Internet',
    steps: [
      'Tippe unten rechts auf das <b>Menü</b> {menu} (drei Striche).',
      'Wähle <b>„Seite hinzufügen zu“</b> und dann <b>„Startbildschirm“</b>.',
      'Mit <b>„Hinzufügen“</b> bestätigen.',
      FINISH,
    ],
  },
  androidFirefox: {
    title: 'Android mit Firefox',
    steps: [
      'Tippe auf die <b>drei Punkte</b> {dotsV} (unten oder oben rechts).',
      'Wähle <b>„Installieren“</b> bzw. <b>„Zum Startbildschirm hinzufügen“</b> {plus}.',
      'Mit <b>„Hinzufügen“</b> bestätigen.',
      FINISH,
    ],
  },
  desktopChrome: {
    title: 'Computer mit Chrome oder Edge',
    steps: [
      'Rechts in der Adresszeile auf das <b>Installieren-Symbol</b> {install} klicken.',
      'Nicht da? Menü {dotsV} bzw. {dotsH} → <b>„Streamen, speichern und teilen“ → „Seite als App installieren“</b> (Edge: <b>„Apps“ → „Diese Website als App installieren“</b>).',
      'Mit <b>„Installieren“</b> bestätigen – die Bibliothek öffnet sich als eigenes Fenster.',
    ],
  },
  desktopSafari: {
    title: 'Mac mit Safari',
    steps: [
      'Oben im Menü <b>„Ablage“</b> → <b>„Zum Dock hinzufügen“</b> wählen (oder das Teilen-Symbol {share} → „Zum Dock hinzufügen“).',
      'Mit <b>„Hinzufügen“</b> bestätigen.',
    ],
  },
};

/** Welche Anleitung passt zu diesem Gerät? */
function detect() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'iosOther' : 'iosSafari';
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return 'androidSamsung';
    if (/Firefox/.test(ua)) return 'androidFirefox';
    return 'androidChrome';
  }
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return 'desktopSafari';
  return 'desktopChrome';
}

function stepList(key) {
  const ol = el('ol', { class: 'ih-steps' });
  for (const s of GUIDES[key].steps) {
    const li = el('li');
    li.innerHTML = fill(s); // nur feste Texte aus GUIDES
    ol.append(li);
  }
  return ol;
}

/** Hinweis zeigen (bleibt, bis „Verstanden“ getippt wird). */
export function showInstallHint() {
  if (document.querySelector('.install-hint')) return;
  settings.set('installHint', true);
  const mine = detect();
  const body = isStandalone()
    ? [el('p', { class: 'ih-lead', text: 'Du nutzt die Bibliothek schon als App vom Home-Bildschirm. 👍' })]
    : [
        el('p', { class: 'ih-lead', text: 'So liegt die Bibliothek wie eine App auf deinem Home-Bildschirm – ohne App Store, in wenigen Sekunden.' }),
        el('p', { class: 'ih-for', text: `So geht’s auf deinem Gerät (${GUIDES[mine].title}):` }),
        stepList(mine),
        el('details', { class: 'ih-more' },
          el('summary', { text: 'Anderes Handy oder anderer Browser?' }),
          ...Object.keys(GUIDES).filter((k) => k !== mine).flatMap((k) => [el('h3', { text: GUIDES[k].title }), stepList(k)])),
      ];
  const card = el('aside', { class: 'install-hint', role: 'dialog', 'aria-label': 'Bibliothek als App installieren' },
    el('div', { class: 'ih-head' },
      el('img', { class: 'ih-app', src: 'icons/apple-touch-icon.png', alt: '' }),
      el('div', {}, el('h2', { text: 'Bibliothek als App' }), el('span', { class: 'ih-sub', text: 'auf den Home-Bildschirm legen' }))),
    el('div', { class: 'ih-body' }, ...body),
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
