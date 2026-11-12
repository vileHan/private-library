// Unteransicht „Regale“ in Meine Bücher (Variante B, 10.11.2026): Übersicht aller Regale mit Anzahl und
// Cover-Streifen, „+ Neues Regal“, Antippen öffnet die Bücher darin; Umbenennen und Löschen (Bücher bleiben erhalten).
import { library, allTags, addShelf, renameShelf, deleteShelf } from './library.js';
import { bookCard, coverThumb } from './card.js';
import { el, plural, emptyState } from './util.js';
import { compareTitle } from './works.js';
import { registerBack, enterLevel, goBack } from './nav.js';

const state = { open: '' }; // geöffnetes Regal ('' = Übersicht)
let lastContainer = null;
// Geöffnetes Regal: „zurück“ (‹ Alle Regale, Wischen vom Rand, Android-Zurück) → Regal-Übersicht
registerBack(() => (state.open && lastContainer?.isConnected && !lastContainer.closest('[hidden]')
  ? () => { state.open = ''; renderShelves(lastContainer); } : null));
const openShelf = (name, rerender) => { state.open = name; enterLevel(); rerender(); };

const booksIn = (name) => [...library.byKey.values()].filter((e) => (e.tags || []).includes(name)).sort(compareTitle);

export function renderShelves(container) {
  lastContainer = container;
  const tags = allTags();
  if (state.open && !tags.includes(state.open)) state.open = '';
  const rerender = () => renderShelves(container);
  if (state.open) return renderShelf(container, state.open, rerender);

  const add = el('button', {
    type: 'button', class: 'chip shelf-add', text: '+ Neues Regal',
    onclick: () => {
      const name = addShelf(window.prompt('Name des neuen Regals (z. B. „Urlaub“, „Lieblinge“):') || '');
      if (name) openShelf(name, rerender);
    },
  });
  const intro = el('p', { class: 'status', text: tags.length
    ? 'Tippe auf ein Regal, um seine Bücher zu sehen.'
    : 'Regale sind eigene Sammlungen, z. B. „Urlaub“, „Lieblinge“ oder „Von Oma“. Bücher kommen über „⋯“ → Regale hinein.' });
  const cards = tags.map((t) => {
    const books = booksIn(t);
    return el('button', { type: 'button', class: 'shelf-card', onclick: () => openShelf(t, rerender) },
      el('div', { class: 'shelf-info' },
        el('strong', { class: 'shelf-name', text: t }),
        el('span', { class: 'shelf-count', text: books.length ? plural(books.length, 'Buch', 'Bücher') : 'noch leer' })),
      el('div', { class: 'shelf-strip' }, ...books.slice(0, 4).map(coverThumb)),
      el('span', { class: 'shelf-go', 'aria-hidden': 'true', text: '›' }));
  });
  container.replaceChildren(el('div', { class: 'shelf-top' }, intro, add), ...cards);
}

function renderShelf(container, name, rerender) {
  const books = booksIn(name);
  const back = el('button', { type: 'button', class: 'link-btn', text: '‹ Alle Regale', onclick: () => goBack() });
  const rename = el('button', {
    type: 'button', class: 'link-btn', text: 'Umbenennen',
    onclick: async () => {
      const t = window.prompt('Neuer Name des Regals:', name);
      if (!t || !t.trim() || t.trim() === name) return;
      // Gibt es den Namen schon, würden zwei Regale zusammengelegt – das lässt sich nicht rückgängig machen
      if (allTags().includes(t.trim()) && !window.confirm(`Ein Regal „${t.trim()}“ gibt es schon. Beide Regale zusammenlegen?`)) return;
      state.open = await renameShelf(name, t);
      rerender();
    },
  });
  const remove = el('button', {
    type: 'button', class: 'link-btn danger', text: 'Löschen',
    onclick: async () => {
      if (!window.confirm(`Regal „${name}“ löschen? Die Bücher bleiben erhalten, nur die Zuordnung verschwindet.`)) return;
      await deleteShelf(name);
      state.open = '';
      rerender();
    },
  });
  container.replaceChildren(...[
    el('div', { class: 'shelf-head' }, back, el('span', { class: 'shelf-actions' }, rename, remove)),
    el('h2', { class: 'shelf-title', text: name }),
    el('p', { class: 'status', text: books.length ? plural(books.length, 'Buch', 'Bücher') : '' }),
    ...books.map((e) => bookCard(e)),
    books.length ? null : emptyState({ icon: '🗂️', title: 'Noch leer', text: `Bücher kommen über „⋯“ → Regale in „${name}“.` }),
  ].filter(Boolean));
}
