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

/**
 * iPhone-Haptik-Versuch: Die Knöpfe „Besitze / Gelesen / Merken“ sind <label>-Elemente mit einem echten,
 * unsichtbaren iOS-Schalter (`<input type="checkbox" switch>`) darin. Ein Tipp legt diesen Schalter wirklich um –
 * iOS quittiert das mit Haptik. Die App reagiert auf das „change“ des Schalters (nicht auf „click“, das bei
 * Labels doppelt käme). Der Zustand des Schalters selbst ist egal, maßgeblich bleibt aria-pressed am Label.
 */
export function switchToggle(cls, text) {
  const label = document.createElement('label');
  label.className = `toggle ${cls}`;
  label.setAttribute('aria-pressed', 'false');
  label.innerHTML = '<input type="checkbox" switch class="haptic-switch"><span class="lbl"></span>';
  label.querySelector('.lbl').textContent = text;
  const input = label.querySelector('input');
  input.setAttribute('aria-label', text);
  // iOS-Schalter lassen sich auch durch Darüberwischen umlegen – ungewollt beim Scrollen der Liste oder
  // Herunterziehen des Detailblatts. Der Schalter meldet „change“ dabei oft schon WÄHREND der Bewegung,
  // bevor der Finger 10 px weit gekommen ist (erste Fassung prüfte nur dann → Knöpfe lösten beim Wischen aus).
  // Deshalb: Kommt „change“ während einer Berührung, wird es zurückgehalten und erst beim Loslassen entschieden –
  // insgesamt mehr als 10 px bewegt oder Berührung abgebrochen (Scrollen) = Änderung zurücknehmen, sonst
  // durchlassen. Dieser Lauscher kommt zuerst und stoppt die übrigen (card.js reagiert auf „change“).
  let x0 = 0, y0 = 0, moved = false, touching = false, pending = false, endedAt = 0;
  const revert = () => { input.checked = !input.checked; };
  const accept = () => { const ev = new Event('change'); ev.accepted = true; input.dispatchEvent(ev); };
  const finish = (cancelled) => {
    touching = false;
    endedAt = Date.now();
    if (cancelled) moved = true;
    if (!pending) return;
    pending = false;
    if (moved) revert(); else accept();
  };
  label.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; moved = false; touching = true; pending = false;
  }, { passive: true });
  label.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (Math.hypot(t.clientX - x0, t.clientY - y0) > 10) moved = true;
  }, { passive: true });
  label.addEventListener('touchend', () => finish(false), { passive: true });
  label.addEventListener('touchcancel', () => finish(true), { passive: true });
  input.addEventListener('change', (e) => {
    if (e.accepted) return;
    if (touching) { pending = true; e.stopImmediatePropagation(); return; }
    // „change“ nach dem Loslassen (normaler Tipp): nur zurücknehmen, wenn die Berührung eben gewischt hat
    if (moved && Date.now() - endedAt < 600) { moved = false; revert(); e.stopImmediatePropagation(); }
  });
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
