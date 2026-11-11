// Geschenk-Link (10.11.2026): Ein persönlicher Link …/#fuer-<code> (Daten in der Datenbank, Tabelle gifts) oder
// …/#g=<Daten> (alle Daten im Link) macht aus der App ein Geschenk:
//  • Name in der Kopfleiste („Annas Bibliothek“)            • eigene Akzentfarbe (optional)
//  • Geburtstagsgruß beim ersten Öffnen (einmal pro Gerät/App, danach unter „Darstellung“ wieder abrufbar)
// Die Daten stehen nur im Link (hinter „#“ – wird nicht an den Server geschickt) und danach im Speicher des Geräts,
// nie im öffentlichen Repository. Format: Base64url eines JSON { n: Name, m: Nachricht, c: Akzentfarbe, v: Absender }.
import { settings } from './settings.js';
import { el } from './util.js';
import { ACCENTS, applyTheme } from './theme.js';
import { CONFIG } from './config.js';

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

/** Kurzlink …/#fuer-<code> (seit 10.11.2026): Code aus der Adresse */
export function codeFromUrl(loc = window.location) {
  return (loc.hash.match(/^#fuer-([a-z0-9-]{3,40})$/i) || [])[1]?.toLowerCase() || '';
}
/** Geschenk zum Kurzcode aus der Datenbank (Tabelle gifts, Funktion gift_by_code); null, wenn unbekannt/offline. */
export async function giftFromCode(code) {
  const sb = CONFIG.supabase;
  if (!code || !sb) return null;
  try {
    const res = await fetch(`${sb.url}/rest/v1/rpc/gift_by_code`, {
      method: 'POST', headers: { apikey: sb.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      signal: AbortSignal.timeout?.(3000), // hängende Verbindung (Funkloch): nach 3 s aufgeben
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data.n === 'string' ? data : null;
  } catch { return null; }
}

/** „Anna“ → „Annas Bibliothek“, „Klaus“ → „Klaus’ Bibliothek“ */
export const libraryTitle = (name) => `${name}${/[sßxz]$/i.test(name) ? '’' : 's'} Bibliothek`;

export const giftData = () => settings.get('gift', null);

/**
 * Beim Start aufrufen: Neuen Geschenk-Link übernehmen (nur wenn er sich vom gespeicherten unterscheidet – sonst würde
 * der Link bei jedem Start eine selbst gewählte Farbe wieder überschreiben), Namen setzen, Gruß einmal zeigen.
 * Der Link bleibt in der Adresse stehen: Beim „Zum Home-Bildschirm“ übernimmt das iPhone ihn als Startadresse,
 * so kennt auch die installierte App (eigener Speicher!) das Geschenk.
 */
export async function initGift() {
  // Erst das gespeicherte Geschenk sofort zeigen (kein Aufblitzen von „Meine Bibliothek“, auch bei schlechtem Netz),
  // dann den Link prüfen: Kurzlink #fuer-<code> fragt die Datenbank (max. 3 s); offline bleibt das Gespeicherte.
  showGift();
  const code = codeFromUrl();
  const fromUrl = giftFromUrl() || (code ? await giftFromCode(code) : null);
  if (fromUrl && JSON.stringify(fromUrl) !== JSON.stringify(giftData())) {
    settings.set('gift', fromUrl);
    settings.set('giftSeen', false);
    if (ACCENTS[fromUrl.c]) settings.set('accent', fromUrl.c);
    applyTheme();
    showGift();
  }
}

/** Gespeichertes Geschenk anzeigen: Titel, 🎂-Knopf, Gruß (falls noch nicht gesehen und nicht schon offen). */
function showGift() {
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
  if (!settings.get('giftSeen', false) && !document.querySelector('.gift-greeting')) showGreeting();
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
  if (/[#&]g=|^#fuer-/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  const h1 = document.querySelector('.top h1');
  if (h1) h1.textContent = 'Meine Bibliothek';
  document.title = 'Meine Bibliothek';
  document.getElementById('giftBtn')?.remove();
}

/** Der Geburtstagsgruß als Vollbild. */
export function showGreeting({ music = false } = {}) {
  const gift = giftData();
  if (!gift) return;
  // Nur der Gruß und „Los geht’s“ (Infotexte entfernt, 12.11.2026). „Los geht’s“ schließt mit einer Konfetti-Explosion
  // über der Bibliothek; lief das Ständchen noch nicht (iOS: Ton erst nach einer Berührung), startet es jetzt.
  const close = () => {
    settings.set('giftSeen', true);
    start();
    box.classList.add('closing');
    setTimeout(() => box.remove(), 300);
    burstConfetti();
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
      el('button', { type: 'button', class: 'dice-btn', text: 'Los geht’s 📚', onclick: close })));
  document.body.append(box);
  // Melodie sofort versuchen (klappt, wenn der Gruß per 🎂 geöffnet wurde); sonst beim ersten Antippen des Grußes
  // oder spätestens mit „Los geht’s“ – iOS erlaubt Ton erst nach einer Berührung.
  let played = false;
  function start() { if (!played) { played = true; playMelody(); } }
  if (music || navigator.userActivation?.isActive) start();
  box.addEventListener('pointerdown', start);
}

/**
 * Konfetti-Explosion (12.11.2026): Papierschnipsel fliegen aus der Bildschirmmitte, fallen und verblassen (~3 s).
 * Ein Canvas über der App ohne Berührungen (pointer-events: none) – man kann sofort weitertippen. Bei „Bewegung
 * reduzieren“ entfällt sie. Farben: Akzentfarbe plus ein paar fröhliche Töne.
 */
export function burstConfetti({ count = 140, duration = 3000 } = {}) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  document.querySelector('.confetti-burst')?.remove();
  const canvas = el('canvas', { class: 'confetti-burst', 'aria-hidden': 'true' });
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return null; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#b03d6e';
  const colors = [accent, accent, '#f4a3c4', '#ffd166', '#7bdcb5', '#8fb8ff', '#ff8a65', '#c39bf0'];
  const pieces = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 9;
    return {
      x: w / 2, y: h * 0.42,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 4,
      size: 6 + Math.random() * 6, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.4,
      flip: Math.random() * Math.PI, color: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() < 0.25,
    };
  });
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    if (t > duration || !canvas.isConnected) { canvas.remove(); return; }
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
    for (const p of pieces) {
      p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.32; // Luftwiderstand, Schwerkraft
      p.x += p.vx; p.y += p.vy; p.rot += p.spin; p.flip += 0.15;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.flip)) * 0.8 + 0.2); // Schnipsel dreht sich in der Luft
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return canvas;
}
