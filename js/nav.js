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
  try { history.pushState({ bibBack: true, depth: currentDepth() + 1 }, ''); } catch { /* z. B. in Tests ohne Verlauf */ }
}
/** Wie viele eigene Ebenen gerade im Verlauf übereinander liegen (0 = keine). */
export const currentDepth = () => (history.state?.bibBack ? history.state.depth || 1 : 0);

// Eigene Einträge zurückspulen, z. B. wenn eine neue Suche das Stöbern beendet (sonst liefe Android-Zurück
// N-mal ins Leere, Prüfrunde 13.11.2026). Der dabei ausgelöste popstate wird nicht als „zurück“ behandelt.
let ignorePop = 0;
export function rewindTo(depth) {
  const n = currentDepth() - depth;
  if (n > 0) { ignorePop++; history.go(-n); }
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
  pending = Date.now() + 600; // auch ohne Verlaufseintrag: doppeltes „‹“ geht nur eine Stufe zurück
  if (history.state?.bibBack) history.back(); // → popstate führt die Aktion aus
  else { backAction()?.(); pending = Date.now() + 400; }
}
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; } // Zurückspulen, kein „zurück“
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
// Weicher (13.11.2026): Die Seite folgt dem Finger fast 1:1 und wird leicht blasser; beim Loslassen gleitet sie nach
// rechts hinaus, danach kommt die vorige Seite von links herein (animateIn 'back'). Ein schneller Schwung reicht auch
// bei kurzer Strecke. Nicht weit genug → federt weich zurück.
const EDGE = 18;      // Startzone am linken Rand in px (Seitenrand ist 16 px – darin liegt kaum etwas zum Antippen)
const TRIGGER = 90;   // ab dieser Strecke nach rechts geht es zurück …
const FLICK = 0.45;   // … oder ab dieser Geschwindigkeit (px/ms) mit mindestens 40 px
const FOLLOW = 0.9;   // Anteil, mit dem die Seite dem Finger folgt

let attached = false;
export function attachEdgeSwipe({ force = false } = {}) {
  const standaloneIos = window.navigator.standalone === true;
  if (attached || (!force && !standaloneIos)) return attached;
  attached = true;
  let start = null;
  let hint = null;
  let busy = false; // Ausgleiten/Zurückfedern läuft noch
  const main = document.querySelector('main');
  const setMain = (x, transition = '') => {
    main.style.transition = transition;
    main.style.transform = x ? `translateX(${x}px)` : '';
    main.style.opacity = x ? String(1 - Math.min(0.25, x / window.innerWidth * 0.4)) : '';
  };
  const clearHint = () => { hint?.remove(); hint = null; };

  document.addEventListener('touchstart', (ev) => {
    start = null;
    const t = ev.touches[0];
    if (busy || ev.touches.length !== 1 || t.clientX > EDGE || document.body.classList.contains('sheet-open')
      || document.querySelector('.cover-zoom, .gift-greeting') || !document.getElementById('scanner')?.hidden || !canGoBack()) return;
    start = { x: t.clientX, y: t.clientY, active: false, lastX: t.clientX, lastT: performance.now(), v: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', (ev) => {
    if (!start) return;
    const t = ev.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!start.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > dx) { start = null; return; } // senkrecht → normal scrollen
      if (dx < 8) return;
      start.active = true;
      hint = Object.assign(document.createElement('div'), { className: 'edge-back', textContent: '‹' });
      hint.setAttribute('aria-hidden', 'true');
      document.body.append(hint);
    }
    if (ev.cancelable) ev.preventDefault();
    const now = performance.now();
    if (now > start.lastT) start.v = 0.7 * ((t.clientX - start.lastX) / (now - start.lastT)) + 0.3 * start.v; // geglättet
    start.lastX = t.clientX; start.lastT = now;
    const p = Math.min(1, Math.max(0, dx) / TRIGGER);
    hint.style.transform = `translate(${-44 + p * 56}px, -50%)`;
    hint.classList.toggle('ready', p >= 1);
    setMain(Math.max(0, dx) * FOLLOW);
  }, { passive: false });

  const end = (ev) => {
    if (!start) return;
    const s = start;
    start = null;
    if (!s.active) return;
    const dx = (ev.changedTouches[0]?.clientX ?? s.lastX) - s.x;
    const ok = ev.type === 'touchend' && (dx >= TRIGGER || (dx >= 40 && s.v >= FLICK));
    clearHint();
    busy = true;
    if (!ok) { // weich zurückfedern
      setMain(0, 'transform .28s cubic-bezier(.2, .8, .2, 1), opacity .28s');
      setTimeout(() => { main.style.transition = ''; busy = false; }, 300);
      return;
    }
    haptic();
    setMain(window.innerWidth * 0.6, 'transform .16s ease-in, opacity .16s ease-in'); // hinausgleiten
    setTimeout(() => {
      const done = () => { setMain(0); busy = false; }; // ohne Übergang zurücksetzen; neue Seite gleitet selbst herein
      const viaHistory = !!history.state?.bibBack;
      if (viaHistory) {
        window.addEventListener('popstate', () => requestAnimationFrame(done), { once: true });
        setTimeout(() => { if (busy) done(); }, 500); // falls popstate ausbleibt
      }
      goBack();
      if (!viaHistory) done();
    }, 160);
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
  return true;
}
