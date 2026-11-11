// Geschenk-Link (10.11.2026): Ein persönlicher Link …/#g=<Daten> macht aus der App ein Geschenk:
//  • Name in der Kopfleiste („Annas Bibliothek“)            • eigene Akzentfarbe (optional)
//  • Geburtstagsgruß beim ersten Öffnen (einmal pro Gerät/App, danach unter „Darstellung“ wieder abrufbar)
// Die Daten stehen nur im Link (hinter „#“ – wird nicht an den Server geschickt) und danach im Speicher des Geräts,
// nie im öffentlichen Repository. Format: Base64url eines JSON { n: Name, m: Nachricht, c: Akzentfarbe, v: Absender }.
import { settings } from './settings.js';
import { el } from './util.js';
import { ACCENTS, applyTheme } from './theme.js';

export function encodeGift(data) {
  const b = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeGift(s) {
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const data = JSON.parse(decodeURIComponent(escape(atob(b))));
    return data && typeof data.n === 'string' ? data : null;
  } catch { return null; }
}
/** Geschenk-Daten aus dem Link (#g=… oder ?g=…) */
export function giftFromUrl(loc = window.location) {
  const m = (loc.hash.match(/[#&]g=([\w-]+)/) || loc.search.match(/[?&]g=([\w-]+)/) || [])[1];
  return m ? decodeGift(m) : null;
}

/** „Anna“ → „Annas Bibliothek“, „Klaus“ → „Klaus’ Bibliothek“ */
export const libraryTitle = (name) => `${name}${/[sßxz]$/i.test(name) ? '’' : 's'} Bibliothek`;

export const giftData = () => settings.get('gift', null);
const isStandalone = () => window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;

/**
 * Beim Start aufrufen: Neuen Geschenk-Link übernehmen (nur wenn er sich vom gespeicherten unterscheidet – sonst würde
 * der Link bei jedem Start eine selbst gewählte Farbe wieder überschreiben), Namen setzen, Gruß einmal zeigen.
 * Der Link bleibt in der Adresse stehen: Beim „Zum Home-Bildschirm“ übernimmt das iPhone ihn als Startadresse,
 * so kennt auch die installierte App (eigener Speicher!) das Geschenk.
 */
export function initGift() {
  const fromUrl = giftFromUrl();
  if (fromUrl && JSON.stringify(fromUrl) !== JSON.stringify(giftData())) {
    settings.set('gift', fromUrl);
    settings.set('giftSeen', false);
    if (ACCENTS[fromUrl.c]) settings.set('accent', fromUrl.c);
    applyTheme();
  }
  const gift = giftData();
  if (!gift) return;
  const title = libraryTitle(gift.n);
  const h1 = document.querySelector('.top h1');
  if (h1) h1.textContent = title;
  document.title = title;
  // 🎂 in der Kopfleiste: Gruß jederzeit erneut abspielen (gibt es nur, wenn die App über einen Geschenk-Link kam)
  const actions = document.querySelector('.top-actions');
  if (actions && !document.getElementById('giftBtn')) {
    actions.prepend(el('button', {
      id: 'giftBtn', type: 'button', class: 'icon-btn', 'aria-label': 'Geburtstagsgruß abspielen', title: 'Geburtstagsgruß', text: '🎂',
      onclick: () => showGreeting({ music: true }),
    }));
  }
  if (!settings.get('giftSeen', false)) showGreeting();
}

/**
 * Leise „Happy Birthday“-Melodie (gemeinfrei), nur Töne, ~4 Sekunden, per Web Audio erzeugt – keine Datei, nichts
 * wird geladen. Spieluhr-Klang (Dreieckswelle, kurz angeschlagen, ausklingend). Am iPhone spielt Web Audio erst nach
 * einer Berührung und ist bei eingeschaltetem Stumm-Schalter still.
 */
let audio = null;
let playingUntil = 0; // nicht doppelt übereinander abspielen
export function playMelody() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.currentTime < playingUntil) return playingUntil - audio.currentTime;
    if (audio.state === 'suspended') audio.resume();
    const beat = 0.34;
    // [Halbtöne über G4, Länge in Schlägen] – erste zwei Zeilen
    const notes = [[0, .75], [0, .25], [2, 1], [0, 1], [5, 1], [4, 2], [0, .75], [0, .25], [2, 1], [0, 1], [7, 1], [5, 2]];
    let t = audio.currentTime + 0.05;
    for (const [semi, len] of notes) {
      const freq = 392 * 2 ** (semi / 12);
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.02); // leise
      gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.3, len * beat * 1.4));
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + len * beat * 1.5);
      t += len * beat;
    }
    playingUntil = t;
    return t - audio.currentTime; // Dauer in Sekunden
  } catch { return 0; }
}

/**
 * Geschenk von DIESEM Gerät entfernen (z. B. nach einem Test auf dem eigenen Handy): Name, Gruß und Merkzeichen weg,
 * Kopfleiste wieder „Meine Bibliothek“. Andere Geräte (das der Beschenkten) sind davon nicht betroffen.
 * Achtung: Steht der Link noch in der Adresszeile, würde er beim nächsten Laden wieder übernommen – deshalb entfernen.
 */
export function clearGift() {
  settings.set('gift', null);
  settings.set('giftSeen', false);
  if (/[#&]g=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  const h1 = document.querySelector('.top h1');
  if (h1) h1.textContent = 'Meine Bibliothek';
  document.title = 'Meine Bibliothek';
  document.getElementById('giftBtn')?.remove();
}

/** Der Geburtstagsgruß als Vollbild. */
export function showGreeting({ music = false } = {}) {
  const gift = giftData();
  if (!gift) return;
  const close = () => {
    settings.set('giftSeen', true);
    box.classList.add('closing');
    setTimeout(() => box.remove(), 300);
  };
  const confetti = el('div', { class: 'gift-confetti', 'aria-hidden': 'true' },
    ...Array.from({ length: 18 }, (_, i) => el('span', {
      text: ['📖', '✨', '📚', '🎉', '⭐'][i % 5],
      style: `left:${(i * 53) % 100}%; animation-delay:${(i % 6) * 0.35}s; animation-duration:${3.2 + (i % 4) * 0.6}s`,
    })));
  const box = el('div', { class: 'gift-greeting', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Geburtstagsgruß' },
    confetti,
    el('div', { class: 'gift-card' },
      el('div', { class: 'gift-emoji', 'aria-hidden': 'true', text: '🎂' }),
      el('h2', { text: `Alles Gute zum Geburtstag, ${gift.n}!` }),
      gift.m ? el('p', { class: 'gift-message', text: gift.m }) : null,
      gift.v ? el('p', { class: 'gift-from', text: `– ${gift.v}` }) : null,
      el('p', { class: 'gift-intro', text: 'Hier sammelst du alle deine Bücher: Suche ein Buch und tippe auf „Besitze“, „Gelesen“ oder „Merken“. Unter „Meine Bücher“ findest du Regale und Statistik, mit 🎲 ein Zufallsbuch.' }),
      isStandalone() ? null : el('p', { class: 'gift-install', text: 'Tipp: Über „Teilen“ → „Zum Home-Bildschirm“ wird daraus eine App auf deinem Handy.' }),
      el('button', { type: 'button', class: 'link-btn gift-music', text: '🎵 Ständchen abspielen', onclick: (ev) => { ev.stopPropagation(); playMelody(); } }),
      el('button', { type: 'button', class: 'dice-btn', text: 'Los geht’s 📚', onclick: close })));
  document.body.append(box);
  // Melodie sofort versuchen (klappt, wenn der Gruß per Knopf geöffnet wurde); sonst beim ersten Antippen des Grußes
  // – iOS erlaubt Ton erst nach einer Berührung. Nicht beim Tipp auf „Los geht’s“ (der schließt).
  let played = false;
  const start = () => { if (!played) { played = true; playMelody(); } };
  if (music || navigator.userActivation?.isActive) start();
  box.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.dice-btn, .gift-music')) start(); });
}
