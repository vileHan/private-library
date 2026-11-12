// Zurück-Navigation (12.11.2026): Wischen vom linken Rand nach rechts führt eine Ebene zurück – nur dort, wo es
// eine „Seite davor“ gibt: Stöbern-Seiten (Autor, Genre, Reihe → zurück zur Suche) und ein geöffnetes Regal
// (→ Regal-Übersicht). Läuft über den Browser-Verlauf: So wirken auch Safaris eigene Rand-Geste und die
// Zurück-Taste/-Geste von Android. Die installierte iPhone-App (ohne Safari-Leiste) kennt keine eigene Geste –
// dort übernimmt edge swipe unten.
import { haptic } from './util.js';

const providers = []; // je Bereich: () => Funktion „eine Ebene zurück“ oder null

/** Bereich meldet, wie „zurück“ bei ihm geht (nur aufrufen, solange es etwas zum Zurückgehen gibt). */
export function registerBack(provider) { providers.push(provider); }
function backAction() {
  for (const p of providers) { const fn = p(); if (fn) return fn; }
  return null;
}

/** Eine neue Ebene betreten (Stöbern-Seite, Regal): Eintrag im Verlauf, damit „Zurück“ hierher führt. */
export function enterLevel() {
  try { history.pushState({ bibBack: true }, ''); } catch { /* z. B. in Tests ohne Verlauf */ }
}

// Offene Ebenen darüber (Detailblatt): Zurück schließt zuerst sie, nicht die Seite darunter (Prüfrunde 12.11.2026)
const overlays = []; // () => Funktion „schließen“ oder null
export function registerOverlay(provider) { overlays.push(provider); }
const overlayClose = () => { for (const p of overlays) { const fn = p(); if (fn) return fn; } return null; };

// Sperre: Bis popstate ankommt, steht history.state noch auf der Ebene – ein zweiter schneller Tipp auf „‹“
// hätte sonst zweimal zurückgeblättert und die App verlassen (Prüfrunde 12.11.2026).
let pending = 0;

/** „‹“-Knöpfe und Wischgeste: über den Verlauf zurück (falls die Ebene dort steht), sonst direkt. */
export function goBack() {
  if (Date.now() < pending) return;
  if (history.state?.bibBack) { pending = Date.now() + 600; history.back(); } // → popstate führt die Aktion aus
  else backAction()?.();
}
window.addEventListener('popstate', () => {
  pending = 0;
  const close = overlayClose();
  if (close) { // Android-Zurück bei offenem Detailblatt: nur das Blatt schließen, die Ebene bleibt im Verlauf
    close();
    if (backAction()) enterLevel();
    return;
  }
  backAction()?.();
});

/** Gibt es gerade eine Seite davor? */
export const canGoBack = () => !!backAction();

// ---------- Wischen vom linken Rand (nur installierte iPhone-App, sonst hat das System eine eigene Geste) ----------
const EDGE = 18;      // Startzone am linken Rand in px (Seitenrand ist 16 px – darin liegt kaum etwas zum Antippen)
const TRIGGER = 80;   // ab dieser Strecke nach rechts geht es zurück

let attached = false;
export function attachEdgeSwipe({ force = false } = {}) {
  const standaloneIos = window.navigator.standalone === true;
  if (attached || (!force && !standaloneIos)) return attached;
  attached = true;
  let start = null;
  let hint = null;
  const main = document.querySelector('main');
  const reset = (animate) => {
    if (hint) { hint.remove(); hint = null; }
    main.style.transition = animate ? 'transform .2s ease-out' : '';
    main.style.transform = '';
    if (animate) setTimeout(() => { main.style.transition = ''; }, 220);
  };
  document.addEventListener('touchstart', (ev) => {
    start = null;
    const t = ev.touches[0];
    if (ev.touches.length !== 1 || t.clientX > EDGE || document.body.classList.contains('sheet-open')
      || document.querySelector('.cover-zoom, .gift-greeting') || !document.getElementById('scanner')?.hidden || !canGoBack()) return;
    start = { x: t.clientX, y: t.clientY, active: false };
  }, { passive: true });
  document.addEventListener('touchmove', (ev) => {
    if (!start) return;
    const t = ev.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!start.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > dx) { start = null; return; } // senkrecht → normal scrollen
      if (dx < 10) return;
      start.active = true;
      hint = Object.assign(document.createElement('div'), { className: 'edge-back', textContent: '‹' });
      hint.setAttribute('aria-hidden', 'true');
      document.body.append(hint);
    }
    if (ev.cancelable) ev.preventDefault();
    const p = Math.min(1, dx / TRIGGER);
    hint.style.transform = `translate(${-44 + p * 56}px, -50%)`;
    hint.classList.toggle('ready', p >= 1);
    main.style.transform = `translateX(${Math.max(0, dx) * 0.35}px)`; // Seite folgt dem Finger ein Stück
  }, { passive: false });
  const end = (ev) => {
    if (!start) return;
    const ok = start.active && ev.type === 'touchend' && (ev.changedTouches[0].clientX - start.x) >= TRIGGER;
    start = null;
    reset(true);
    if (ok) { haptic(); goBack(); }
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
  return true;
}
