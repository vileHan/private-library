// Name der Bibliothek in der Kopfleiste (19.11.2026). Reihenfolge: selbst gewählter Name (settings `libraryName`,
// reist mit dem Konto auf alle Geräte) → Name aus dem Geschenk („Annas Bibliothek“) → „Meine Bibliothek“.
// Antippen des Namens öffnet ein kleines Fenster zum Umbenennen. Ändert NICHT den Benutzernamen zum Anmelden.
import { settings } from './settings.js';
import { el } from './util.js';

export const DEFAULT_TITLE = 'Meine Bibliothek';

/** „Anna“ → „Annas Bibliothek“, „Klaus“ → „Klaus’ Bibliothek“ */
export const libraryTitle = (name) => `${name}${/[sßxz]$/i.test(name) ? '’' : 's'} Bibliothek`;

export function currentTitle() {
  const custom = String(settings.get('libraryName', '') || '').trim();
  if (custom) return custom;
  const gift = settings.get('gift', null);
  return gift?.n ? libraryTitle(gift.n) : DEFAULT_TITLE;
}

/** Kopfleiste und Fenstertitel auf den aktuellen Namen setzen. */
export function applyLibraryTitle() {
  const t = currentTitle();
  const h1 = document.querySelector('.top h1');
  if (h1) h1.textContent = t;
  document.title = t;
  for (const n of document.querySelectorAll('.konto-libname')) n.textContent = t; // Anzeige unter Einstellungen → Konto
}

/** Fenster „Name der Bibliothek“ */
export function openRename() {
  if (document.querySelector('.rename-dialog')) return;
  const input = el('input', { type: 'text', maxlength: '40', value: currentTitle(), 'aria-label': 'Name der Bibliothek', autocapitalize: 'sentences', enterkeyhint: 'done' });
  const close = () => { wrap.remove(); applyLibraryTitle(); };
  const save = (value) => {
    const v = value.trim().replace(/\s+/g, ' ').slice(0, 40);
    settings.set('libraryName', v === currentTitleWithout() ? '' : v); // gleich dem Standard → nichts Eigenes speichern
    close();
  };
  const form = el('form', { class: 'rename-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Name der Bibliothek' },
    el('h2', { text: 'Name der Bibliothek' }),
    el('p', { class: 'rename-note', text: 'So heißt deine Bibliothek oben in der Kopfleiste. Dein Benutzername zum Anmelden bleibt dabei gleich.' }),
    input,
    el('div', { class: 'rename-actions' },
      el('button', { type: 'button', class: 'link-btn', text: 'Standard', onclick: () => save('') }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'ghost', text: 'Abbrechen', onclick: close }),
      el('button', { type: 'submit', class: 'primary', text: 'Speichern' })));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); save(input.value); });
  const wrap = el('div', { class: 'rename-dialog' }, form);
  wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });
  form.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
  document.body.append(wrap);
  input.focus();
  input.select();
}

/** Name ohne eigene Wahl (Geschenk oder „Meine Bibliothek“) – fürs Zurücksetzen */
function currentTitleWithout() {
  const gift = settings.get('gift', null);
  return gift?.n ? libraryTitle(gift.n) : DEFAULT_TITLE;
}

/** Kopfleisten-Namen antippbar machen (einmal beim Start). */
export function initLibraryTitle() {
  const h1 = document.querySelector('.top h1');
  if (!h1) return;
  h1.setAttribute('role', 'button');
  h1.setAttribute('tabindex', '0');
  h1.setAttribute('title', 'Namen der Bibliothek ändern');
  h1.classList.add('lib-title');
  h1.addEventListener('click', openRename);
  h1.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openRename(); } });
  applyLibraryTitle();
  settings.onSet((name) => { if (name === 'libraryName' || name === 'gift') applyLibraryTitle(); });
}
