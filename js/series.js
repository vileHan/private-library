// Reihen-Ansicht: Welche Bände einer Reihe habe ich, welche fehlen?
import { catalog } from './catalog.js';
import { normalizeText, compareTitle } from './works.js';
import { library, entryFor } from './library.js';
import { bookCard } from './card.js';
import { el, fmt } from './util.js';

const loaded = new Map(); // Reihen-Schlüssel → vollständige Bandliste von der DNB

const seriesKey = (series, authorSort) => `${normalizeText(series)}|${normalizeText(authorSort || '')}`;

function byVolume(a, b) {
  const va = Number(a.volume) || Infinity;
  const vb = Number(b.volume) || Infinity;
  return va - vb || (a.year || 0) - (b.year || 0) || compareTitle(a, b);
}

const loadAllVolumes = (series, authorSort) => catalog.seriesWorks(series, authorSort);

export function renderSeries(container) {
  const groups = new Map();
  for (const e of library.byKey.values()) {
    if (!e.series) continue;
    const k = seriesKey(e.series, e.authorSort);
    if (!groups.has(k)) groups.set(k, { series: e.series, authorSort: e.authorSort, authors: e.authors, entries: [] });
    groups.get(k).entries.push(e);
  }
  const list = [...groups.entries()].sort((a, b) => a[1].series.localeCompare(b[1].series, 'de'));
  container.replaceChildren();
  if (!list.length) {
    container.append(el('p', { class: 'empty', text: 'Noch keine Reihen. Markiere ein Buch, das zu einer Reihe gehört (z. B. Eragon oder Harry Potter).' }));
    return;
  }
  for (const [key, g] of list) container.append(seriesBlock(key, g, () => renderSeries(container)));
}

function seriesBlock(key, g, rerender) {
  const block = el('section', { class: 'series' });
  const body = el('div', { class: 'list' });
  const summary = el('p', { class: 'series-summary' });
  const btn = el('button', { type: 'button', class: 'more small', text: 'Alle Bände laden' });

  const draw = () => {
    const known = loaded.get(key);
    const works = known
      ? [...known, ...g.entries.filter((e) => !known.some((w) => entryFor(w)?.key === e.key))]
      : g.entries;
    works.sort(byVolume);
    const owned = works.filter((w) => entryFor(w)?.owned).length;
    const read = works.filter((w) => entryFor(w)?.read).length;
    summary.textContent = known
      ? `${fmt.format(owned)} von ${fmt.format(works.length)} Bänden im Besitz · ${fmt.format(read)} gelesen`
      : `${fmt.format(owned)} im Besitz · ${fmt.format(read)} gelesen`;
    body.replaceChildren(...works.map((w) => bookCard(w, {
      compact: true,
      prefix: w.volume ? `${w.volume}. ` : '',
      onChange: () => draw(),
    })));
    btn.hidden = !!known;
  };

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Lädt …';
    try {
      loaded.set(key, await loadAllVolumes(g.series, g.authorSort));
      draw();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Erneut versuchen';
      summary.textContent = `Laden fehlgeschlagen: ${err.message}`;
    }
  });

  block.append(
    el('h2', { class: 'series-title', text: g.series }),
    el('p', { class: 'author', text: (g.authors || []).join(', ') }),
    summary, body, btn,
  );
  draw();
  return block;
}
