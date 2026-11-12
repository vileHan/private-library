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
// Scrollstand verwaltet die App selbst (Stöbern-Stapel, Regal) – sonst springt die Seite beim Zurück nach oben
try { history.scrollRestoration = 'manual'; } catch { /* alte Browser */ }
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

// ---------- Abbild der vorigen Seite (für die Wischgeste) ----------
/** Abbild der gerade sichtbaren Ansicht samt Scrollstand – wird beim Wischen unter die aktuelle Seite gelegt. */
export function captureView() {
  const view = document.querySelector('main > section:not([hidden])');
  if (!view) return null;
  const node = view.cloneNode(true);
  node.classList.remove('enter-fwd', 'enter-back', 'enter-fade');
  node.setAttribute('aria-hidden', 'true');
  // Eingaben übernehmen (Werte gehören nicht zum DOM-Baum)
  const src = view.querySelectorAll('input, select');
  node.querySelectorAll('input, select').forEach((d, i) => {
    const s = src[i];
    if (!s) return;
    if (s.type === 'checkbox') d.checked = s.checked; else if (s.tagName === 'SELECT') d.value = s.value; else d.setAttribute('value', s.value);
  });
  const main = document.querySelector('main');
  return { node, scroll: window.scrollY, top: main.getBoundingClientRect().top + window.scrollY };
}

let swiping = false;
/** Läuft gerade ein Zurück per Wischgeste? (Dann keine zweite Einblend-Animation – die Seite war schon zu sehen.) */
export const swipingBack = () => swiping;

// ---------- Wischen vom linken Rand (nur installierte iPhone-App, sonst hat das System eine eigene Geste) ----------
// Nach iPhone-Vorbild (13.11.2026): Die Seite folgt dem Finger 1:1, darunter erscheint die vorige Seite (Abbild,
// leicht versetzt und abgedunkelt). Beim Loslassen entscheidet zuerst der Schwung: nach rechts „geworfen“ = zurück,
// nach links geworfen = bleiben – egal wie weit gezogen; ohne Schwung zählt, ob mehr als 45 % der Breite erreicht ist.
const EDGE = 24;        // Startzone am linken Rand in px
const FLICK = 0.35;     // px/ms – ab diesem Schwung entscheidet die Richtung
const HALF = 0.45;      // Anteil der Breite, ab dem es ohne Schwung zurückgeht
const PARALLAX = 0.3;   // vorige Seite startet um 30 % nach links versetzt

/** Liegt die Berührung in der Startzone der Wischgeste? (Andere Gesten, z. B. im Cover-Raster, halten sich raus.) */
export const inEdgeZone = (x) => attached && x <= EDGE;

let attached = false;
export function attachEdgeSwipe({ force = false } = {}) {
  const standaloneIos = window.navigator.standalone === true;
  if (attached || (!force && !standaloneIos)) return attached;
  attached = true;
  let g = null;      // laufende Geste
  let busy = false;  // Ausgleiten/Zurückfedern läuft noch
  const main = document.querySelector('main');
  const W = () => window.innerWidth;

  const paint = (x, transition = '') => {
    main.style.transition = transition;
    main.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    if (g?.under) {
      const p = Math.min(1, x / W());
      g.under.style.transition = transition;
      g.under.style.transform = `translate3d(${-(1 - p) * PARALLAX * W()}px, 0, 0)`;
      g.under.style.setProperty('--dim', String((1 - p).toFixed(3)));
    }
  };
  const cleanup = () => {
    document.body.classList.remove('edge-swiping');
    g?.under?.remove();
    g?.hint?.remove();
    main.style.transition = main.style.transform = '';
    g = null;
    busy = false;
  };

  document.addEventListener('touchstart', (ev) => {
    if (busy) return;
    g = null;
    const t = ev.touches[0];
    if (ev.touches.length !== 1 || t.clientX > EDGE || document.body.classList.contains('sheet-open')
      || document.querySelector('.cover-zoom, .gift-greeting') || !document.getElementById('scanner')?.hidden) return;
    const action = backAction();
    if (!action) return;
    g = { x: t.clientX, y: t.clientY, active: false, action, pts: [[t.clientX, performance.now()]], under: null, hint: null };
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', (ev) => {
    if (!g) return;
    const t = ev.touches[0];
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > dx * 1.2) { g = null; return; } // senkrecht → normal scrollen
      if (dx < 6) return;
      g.active = true;
      document.body.classList.add('edge-swiping');
      // vorige Seite darunter legen (falls ein Abbild da ist)
      const snap = g.action.snapshot;
      const under = document.createElement('div');
      under.className = 'edge-under';
      under.setAttribute('aria-hidden', 'true');
      if (snap?.node) {
        const inner = document.createElement('div');
        inner.className = 'edge-under-main';
        inner.style.transform = `translateY(${snap.top - snap.scroll}px)`;
        inner.append(snap.node.cloneNode(true));
        under.append(inner);
      }
      document.body.append(under);
      g.under = under;
    }
    if (ev.cancelable) ev.preventDefault();
    const now = performance.now();
    g.pts.push([t.clientX, now]);
    while (g.pts.length > 2 && now - g.pts[0][1] > 90) g.pts.shift(); // Schwung aus den letzten ~90 ms
    paint(Math.max(0, dx));
  }, { passive: false, capture: true });

  const end = (ev) => {
    if (!g) return;
    if (!g.active) { g = null; return; }
    const x = Math.max(0, (ev.changedTouches[0]?.clientX ?? g.x) - g.x);
    const [x0, t0] = g.pts[0];
    const [x1, t1] = g.pts[g.pts.length - 1];
    const idle = performance.now() - t1 > 80; // Finger stand vor dem Loslassen still → kein Schwung (Prüfrunde 13.11.2026)
    const v = !idle && t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
    const commit = ev.type === 'touchend' && (v > FLICK || (v > -FLICK && x > W() * HALF));
    busy = true;
    if (!commit) { // weich zurück auf die aktuelle Seite
      paint(0, 'transform .3s cubic-bezier(.2, .9, .3, 1)');
      setTimeout(cleanup, 320);
      return;
    }
    haptic();
    // Restweg in einer Zeit passend zum Schwung (schnell geworfen = kurz), wie am iPhone
    const rest = W() - x;
    const ms = Math.round(Math.max(140, Math.min(320, rest / Math.max(v, 1.2))));
    paint(W(), `transform ${ms}ms cubic-bezier(.2, .8, .3, 1)`);
    setTimeout(() => {
      swiping = true;
      const finish = () => requestAnimationFrame(() => { swiping = false; cleanup(); });
      const viaHistory = !!history.state?.bibBack;
      if (viaHistory) {
        window.addEventListener('popstate', finish, { once: true });
        setTimeout(() => { if (swiping) finish(); }, 600); // falls popstate ausbleibt
      }
      goBack();
      if (!viaHistory) finish();
    }, ms);
  };
  document.addEventListener('touchend', end, { capture: true });
  document.addEventListener('touchcancel', end, { capture: true });
  return true;
}
