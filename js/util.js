// Kleine Helfer, die von mehreren Modulen genutzt werden.
export const $ = (sel) => document.querySelector(sel);
export const fmt = new Intl.NumberFormat('de-DE');
export const plural = (n, one, many) => `${fmt.format(n)} ${n === 1 ? one : many}`;

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Kurzes Vibrieren – nur Android (Vibration-API). Safari auf dem iPhone kennt keine Vibration; der frühere
 * Umweg (per Programm umgelegter iOS-Schalter) wirkt auf iOS 27 nicht mehr und wurde entfernt.
 * Für das iPhone siehe addSwitchHaptic(): ein echter Schalter, den der Finger selbst umlegt.
 */
export function haptic(ms = 15) {
  try { navigator.vibrate?.(ms); } catch { /* egal */ }
}

// Zeitpunkt der letzten Scroll-Bewegung irgendwo auf der Seite (Liste, Detailblatt …). Ein Finger, der eine
// laufende Scroll-Bewegung anhält, oder eine Berührung, während der gescrollt wurde, ist kein Tipp.
let lastScroll = -1e9;
let ignoreScrollUntil = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    if (performance.now() < ignoreScrollUntil) return;
    lastScroll = performance.now();
  }, { capture: true, passive: true });
}
/** Scroll-Ereignisse kurz nicht werten – z. B. wenn die Tastatur einfährt und iOS dabei die Seite verschiebt, damit
 *  der Tipp, der die Tastatur schließt, trotzdem ankommt (Prüfrunde 09.11.2026). */
export function ignoreScrollBriefly(ms = 400) { ignoreScrollUntil = performance.now() + ms; }

/**
 * Ruft fn nur bei einem ECHTEN Tipp auf – nie beim Wischen oder Scrollen:
 * Finger höchstens 10 px bewegt, kürzer als 600 ms, nicht abgebrochen, keine Scroll-Bewegung kurz vor oder
 * während der Berührung, nur ein Finger. Maus und Tastatur lösen über „click“ aus (nicht kurz nach einer Berührung,
 * sonst käme der Tipp doppelt). fn bekommt das auslösende Ereignis.
 */
export function onTap(elm, fn) {
  let s = null;
  let lastTouch = -1e9;
  let lastFire = -1e9;
  const fire = (ev) => {
    const now = performance.now();
    if (now - lastFire < 50) return; // Label + Schalter melden denselben Mausklick evtl. zweimal
    lastFire = now;
    fn(ev);
  };
  elm.addEventListener('touchstart', (ev) => {
    lastTouch = performance.now();
    if (ev.touches.length > 1) { s = null; return; }
    const t = ev.touches[0];
    s = { x: t.clientX, y: t.clientY, t: lastTouch, moved: false, scrolling: lastTouch - lastScroll < 150 };
  }, { passive: true });
  elm.addEventListener('touchmove', (ev) => {
    if (!s) return;
    const t = ev.touches[0];
    if (ev.touches.length > 1 || Math.hypot(t.clientX - s.x, t.clientY - s.y) > 10) s.moved = true;
  }, { passive: true });
  elm.addEventListener('touchcancel', () => { s = null; lastTouch = performance.now(); }, { passive: true });
  elm.addEventListener('touchend', (ev) => {
    const now = performance.now();
    lastTouch = now;
    const ok = s && !s.moved && !s.scrolling && now - s.t < 600 && lastScroll < s.t;
    s = null;
    if (ok) fire(ev);
  }, { passive: true });
  elm.addEventListener('click', (ev) => {
    if (performance.now() - lastTouch < 800) return; // nach einer Berührung entscheidet allein touchend
    fire(ev);
  });
}

/**
 * Knöpfe „Besitze / Gelesen / Merken“: <label> mit einem echten, fast unsichtbaren iOS-Schalter
 * (`<input type="checkbox" switch>`) darin. Ein Tipp legt diesen Schalter um – iOS quittiert das mit Haptik.
 * ENTSCHIEDEN wird aber nicht über das „change“ des Schalters: iOS legt ihn auch beim Darüberwischen um und meldet
 * das (zwei Fassungen, die „change“ nachträglich filterten, halfen am iPhone nicht – Nutzer 09.11.2026).
 * Stattdessen meldet das Label ein eigenes Ereignis „toggle“, und zwar nur bei einem echten Tipp (onTap).
 * Der Zustand des Schalters selbst ist egal, maßgeblich bleibt aria-pressed am Label.
 */
export function switchToggle(cls, text) {
  const label = document.createElement('label');
  label.className = `toggle ${cls}`;
  label.setAttribute('aria-pressed', 'false');
  label.innerHTML = '<input type="checkbox" switch class="haptic-switch"><span class="lbl"></span>';
  label.querySelector('.lbl').textContent = text;
  const input = label.querySelector('input');
  input.setAttribute('aria-label', text);
  return wireToggle(label);
}

/**
 * Macht aus einem fertigen Knopf-Label (auch aus der Karten-Vorlage #bookTpl in index.html!) einen Knopf, der
 * „toggle“ nur bei echtem Tipp meldet. Ohne diesen Aufruf reagiert der Knopf gar nicht (Fehler vom 09.11.2026:
 * die Karten-Knöpfe waren nicht verdrahtet).
 */
export function wireToggle(label) {
  label.querySelector('input')?.addEventListener('change', (ev) => ev.stopImmediatePropagation()); // nur für die Haptik da
  onTap(label, () => label.dispatchEvent(new CustomEvent('toggle')));
  return label;
}

/** Sichtbares Feedback statt Haptik: Element „hüpft“ kurz. */
export function pop(elm) {
  elm.classList.remove('pop');
  void elm.offsetWidth; // Animation neu starten
  elm.classList.add('pop');
}

/** „643 Seiten“ → 643 */
export function pageCount(text) {
  const n = Number(String(text || '').match(/(\d{2,5})\s*(Seiten|S\b|pages|p\b)/i)?.[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
