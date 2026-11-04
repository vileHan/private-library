// Statistik über die eigene Bibliothek.
import { library } from './library.js';
import { el, fmt, pageCount } from './util.js';

function topCounts(values, n = 6) {
  const m = new Map();
  for (const v of values) if (v) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, n);
}

function bars(title, rows, unit = '') {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r[1]));
  return el('section', { class: 'stat-block' },
    el('h3', { text: title }),
    ...rows.map(([label, n]) => el('div', { class: 'bar-row' },
      el('span', { class: 'bar-label', text: label }),
      el('span', { class: 'bar' }, el('span', { class: 'bar-fill', style: `width:${Math.max(4, (n / max) * 100)}%` })),
      el('span', { class: 'bar-num', text: `${fmt.format(n)}${unit}` }),
    )),
  );
}

/** Seitenzahl: die der eigenen Ausgabe, sonst der Median aller Ausgaben (robust gegen Sammelbände). */
function pagesOf(e) {
  const mine = (e.editions || []).filter((ed) => (e.ownedIsbns || []).includes(ed.isbn)).map((ed) => pageCount(ed.pages)).filter(Boolean);
  if (mine.length) return mine[0];
  const all = (e.editions || []).map((ed) => pageCount(ed.pages)).filter(Boolean).sort((a, b) => a - b);
  return all.length ? all[Math.floor(all.length / 2)] : null;
}

export function renderStats(container) {
  const all = [...library.byKey.values()];
  const owned = all.filter((e) => e.owned);
  const read = all.filter((e) => e.read);
  const wish = all.filter((e) => e.wish && !e.owned);
  const unreadOwned = owned.filter((e) => !e.read);
  const rated = all.filter((e) => e.rating);
  const avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : null;
  const pages = read.map(pagesOf).filter(Boolean);

  const tile = (n, label) => el('div', { class: 'tile' }, el('strong', { text: n }), el('span', { text: label }));
  container.replaceChildren(
    el('div', { class: 'tiles' },
      tile(fmt.format(owned.length), 'im Besitz'),
      tile(fmt.format(read.length), 'gelesen'),
      tile(fmt.format(unreadOwned.length), 'ungelesen im Regal'),
      tile(fmt.format(wish.length), 'auf der Merkliste'),
      tile(pages.length ? fmt.format(pages.reduce((a, b) => a + b, 0)) : '–', 'Seiten gelesen'),
      tile(avg ? avg.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' ★' : '–', 'Ø Bewertung'),
    ),
  );

  const perYear = topCounts(read.map((e) => e.readAt?.slice(0, 4)), 50).sort((a, b) => b[0].localeCompare(a[0]));
  const blocks = [
    bars('Gelesen pro Jahr', perYear),
    bars('Häufigste Genres (im Besitz)', topCounts(owned.map((e) => e.genre))),
    bars('Häufigste Autorinnen und Autoren (im Besitz)', topCounts(owned.map((e) => (e.authors || [])[0]))),
    bars('Bewertungen', [5, 4, 3, 2, 1].map((n) => [`${'★'.repeat(n)}`, rated.filter((e) => e.rating === n).length]).filter((r) => r[1])),
  ].filter(Boolean);
  container.append(...blocks);
  if (!all.length) container.append(el('p', { class: 'empty', text: 'Noch keine Daten – markiere ein paar Bücher.' }));
  if (read.length && !perYear.length) container.append(el('p', { class: 'status', text: 'Tipp: Unter „Details“ kannst du eintragen, wann du ein Buch gelesen hast.' }));
}
