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
 * Kurzes haptisches Feedback.
 * Android: Vibration-API. iPhone: Safari kennt keine Vibration – seit iOS 18 löst aber das Umschalten eines
 * (unsichtbaren) iOS-Schalters `<input type="checkbox" switch>` das System-Haptik-Tippen aus. Inoffizieller Umweg;
 * funktioniert er nicht, passiert einfach nichts.
 */
let hapticLabel = null;
export function haptic(ms = 15) {
  if (typeof navigator.vibrate === 'function') {
    try { if (navigator.vibrate(ms)) return; } catch { /* weiter mit dem iOS-Umweg */ }
  }
  try {
    if (!hapticLabel) {
      hapticLabel = document.createElement('label');
      hapticLabel.setAttribute('aria-hidden', 'true');
      hapticLabel.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-10px;top:0;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      hapticLabel.append(input);
      document.body.append(hapticLabel);
    }
    hapticLabel.click();
  } catch { /* egal */ }
}

/** „643 Seiten“ → 643 */
export function pageCount(text) {
  const n = Number(String(text || '').match(/(\d{2,5})\s*(Seiten|S\b|pages|p\b)/i)?.[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
