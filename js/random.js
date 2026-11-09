// Reiter „🎲“ – Was lese ich als Nächstes? (10.11.2026)
// Quellen frei kombinierbar: ungelesene eigene Bücher, Merkliste, ein oder mehrere Regale. Gelesene und abgebrochene
// Bücher kommen nie dran. Nicht zweimal hintereinander dasselbe Buch.
import { library, allTags } from './library.js';
import { bookCard } from './card.js';
import { el, plural, haptic } from './util.js';
import { settings } from './settings.js';

const saved = settings.get('random', {});
const state = {
  unread: saved.unread ?? true,
  wish: saved.wish ?? false,
  shelves: new Set(saved.shelves || []),
  pickKey: '',
};
const save = () => settings.set('random', { unread: state.unread, wish: state.wish, shelves: [...state.shelves] });

function pool() {
  return [...library.byKey.values()].filter((e) => !e.read && !e.abandoned && (
    (state.unread && e.owned) || (state.wish && e.wish) || (e.tags || []).some((t) => state.shelves.has(t))));
}

export function renderRandom(container, roll = false) {
  const tags = allTags();
  for (const t of [...state.shelves]) if (!tags.includes(t)) state.shelves.delete(t);
  const rerender = (r = false) => renderRandom(container, r);
  // Quelle geändert: Passt das gezeigte Buch nicht mehr dazu, verschwindet es (Hinweis statt falschem Buch).
  // Wird das gezeigte Buch dagegen gerade als gelesen markiert, bleibt es stehen, bis neu gewürfelt wird.
  const sourceChanged = () => {
    save();
    if (state.pickKey && !pool().some((e) => e.key === state.pickKey)) state.pickKey = '';
    rerender();
  };
  const list = pool();

  const toggle = (key, label) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(state[key]), text: label,
    onclick: () => { state[key] = !state[key]; sourceChanged(); },
  });
  // Regale: Aufklappliste mit Häkchen, mehrere wählbar
  const shelfMenu = el('details', { class: 'multi' },
    el('summary', { class: `chip${state.shelves.size ? ' active' : ''}`, text: state.shelves.size ? `Regale (${state.shelves.size}) ▾` : 'Regale ▾' }),
    el('div', { class: 'multi-panel' }, ...(tags.length ? tags.map((t) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = state.shelves.has(t);
      cb.addEventListener('change', () => { if (cb.checked) state.shelves.add(t); else state.shelves.delete(t); sourceChanged(); });
      return el('label', { class: 'multi-row' }, cb, el('span', { text: t }));
    }) : [el('p', { class: 'status', text: 'Noch keine Regale – anlegen unter Meine Bücher → Regale.' })])));
  // Offen lassen, solange man Häkchen setzt; schließen beim Tippen daneben
  shelfMenu.open = !!container.querySelector('details.multi[open]');

  if (roll && list.length) {
    const choices = list.length > 1 ? list.filter((e) => e.key !== state.pickKey) : list;
    state.pickKey = choices[Math.floor(Math.random() * choices.length)].key;
    haptic();
  }
  const picked = state.pickKey && library.byKey.get(state.pickKey);
  const nothingChosen = !state.unread && !state.wish && !state.shelves.size;
  const result = el('div', { class: 'random-result' }, picked ? bookCard(picked) : el('p', { class: 'random-hint', text: nothingChosen
    ? 'Wähle oben, woraus gewürfelt werden soll.'
    : list.length
      ? 'Wähle oben, woraus gewürfelt wird – ungelesene eigene Bücher, deine Merkliste oder bestimmte Regale (mehrere möglich) – und tippe auf „Würfeln“. Gelesene und abgebrochene Bücher kommen nicht dran.'
      : 'Hier ist gerade nichts Ungelesenes. Wähle eine andere Quelle.' }));

  container.replaceChildren(
    el('h2', { class: 'random-title', text: 'Was lese ich als Nächstes?' }),
    el('div', { class: 'chips' }, toggle('unread', 'Ungelesen'), toggle('wish', 'Gemerkt'), shelfMenu),
    el('button', {
      type: 'button', class: 'dice-btn', disabled: !list.length,
      text: list.length ? `🎲 ${picked ? 'Noch einmal' : 'Würfeln'} (${plural(list.length, 'Buch', 'Bücher')})` : '🎲 Würfeln',
      onclick: () => rerender(true),
    }),
    result,
  );
}

/** Nach einer Änderung an der Bibliothek nur den Würfel-Knopf (Anzahl) auffrischen – die Karte bleibt stehen. */
export function updateRandomCount(container) {
  const btn = container.querySelector('.dice-btn');
  if (!btn) return;
  const n = pool().length;
  const picked = state.pickKey && library.byKey.get(state.pickKey);
  btn.disabled = !n;
  btn.textContent = n ? `🎲 ${picked ? 'Noch einmal' : 'Würfeln'} (${plural(n, 'Buch', 'Bücher')})` : '🎲 Würfeln';
}

// Aufklappliste schließen, wenn außerhalb getippt wird
document.addEventListener('pointerdown', (ev) => { // pointerdown: kommt am iPhone auch auf nicht anklickbaren Flächen an
  for (const d of document.querySelectorAll('details.multi[open]')) if (!d.contains(ev.target)) d.open = false;
});
