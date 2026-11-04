import { catalog } from './catalog.js';
import { groupEditions, compareTitle, compareAuthor, normalizeText } from './works.js';
import { exportJson, importJson } from './store.js';
import { normalizeIsbn } from './isbn.js';
import { library, loadLibrary, entryFor, onLibraryChange, allTags } from './library.js';
import { bookCard } from './card.js';
import { renderSeries } from './series.js';
import { renderStats } from './stats.js';
import { $, el, fmt, plural } from './util.js';

onLibraryChange(() => {
  const owned = [...library.byKey.values()].filter((e) => e.owned).length;
  $('#libCount').textContent = owned ? fmt.format(owned) : '';
});

function matchesTokens(entry, tokens, extra = '') {
  const hay = normalizeText([entry.title, entry.subtitle, ...(entry.authors || []), entry.series, extra].join(' '));
  return tokens.every((t) => hay.includes(t));
}

// ---------- Suche ----------
const search = { query: '', editions: [], total: 0, next: null, controller: null };

function renderResults() {
  const box = $('#results');
  box.replaceChildren();
  const works = groupEditions(search.editions);
  const seen = new Set();
  const owned = [];
  const others = [];
  for (const w of works) {
    const e = entryFor(w);
    if (e) seen.add(e.key);
    (e?.owned ? owned : others).push(w);
  }
  // Eigene Bücher, die zur Suche passen, immer zeigen – auch wenn die DNB sie (noch) nicht geliefert hat.
  const isbn = normalizeIsbn(search.query);
  const tokens = normalizeText(search.query).split(' ').filter(Boolean);
  for (const e of library.byKey.values()) {
    if (!e.owned || seen.has(e.key)) continue;
    if (isbn ? (e.isbns || []).includes(isbn) : matchesTokens(e, tokens)) owned.push(e);
  }
  // Relevanz, jeweils A–Z: 0 = alles im Titel/Reihe, 1 = Titel + Autor zusammen,
  // 2 = sonstige Treffer (z. B. Person nur als Übersetzerin beteiligt).
  const titleHit = (w) => {
    if (!tokens.length) return 0;
    const t = normalizeText([w.title, w.subtitle, w.series].join(' '));
    if (tokens.every((x) => t.includes(x))) return 0;
    const ta = `${t} ${normalizeText((w.authors || []).join(' '))}`;
    return tokens.every((x) => ta.includes(x)) ? 1 : 2;
  };
  const byRelevance = (a, b) => titleHit(a) - titleHit(b) || compareTitle(a, b);
  owned.sort(byRelevance);
  others.sort(byRelevance);

  if (owned.length) {
    box.append(el('h2', { class: 'section-title', text: `In deinem Besitz (${owned.length})` }));
    for (const w of owned) box.append(bookCard(w));
  }
  if (others.length) {
    if (owned.length) box.append(el('h2', { class: 'section-title', text: `Weitere Treffer (${others.length})` }));
    for (const w of others) box.append(bookCard(w));
  }
  if (!owned.length && !others.length) box.append(el('p', { class: 'empty', text: 'Keine passenden Bücher gefunden.' }));

  const loaded = Math.min(search.total, (search.next ?? search.total + 1) - 1);
  const status = $('#searchStatus');
  status.classList.remove('error');
  status.textContent = search.total
    ? `${plural(works.length, 'Buch', 'Bücher')} aus ${fmt.format(loaded)} von ${plural(search.total, 'Ausgabe', 'Ausgaben')}`
      + (search.next ? ' – sortiert innerhalb der geladenen Treffer.' : '.')
    : '';
  const more = $('#moreBtn');
  more.hidden = !search.next;
  more.disabled = false;
  more.textContent = 'Mehr laden';
}

async function runSearch(query, append = false) {
  search.controller?.abort();
  const controller = new AbortController();
  search.controller = controller;
  const status = $('#searchStatus');
  if (!append) {
    Object.assign(search, { query, editions: [], total: 0, next: null });
    $('#moreBtn').hidden = true;
    status.classList.remove('error');
    status.textContent = 'Suche läuft …';
  } else {
    $('#moreBtn').disabled = true;
    $('#moreBtn').textContent = 'Lädt …';
  }
  try {
    const res = await catalog.search(query, append ? search.next : null, controller.signal);
    if (controller.signal.aborted) return;
    search.editions.push(...res.editions);
    search.total = res.total;
    search.next = res.next;
    renderResults();
  } catch (err) {
    if (err.name === 'AbortError') return;
    status.classList.add('error');
    status.textContent = navigator.onLine === false
      ? 'Keine Internetverbindung. „Meine Bücher“ funktioniert trotzdem.'
      : `Die Suche hat nicht geklappt: ${err.message}`;
    $('#moreBtn').disabled = false;
    $('#moreBtn').textContent = 'Erneut versuchen';
  }
}

$('#searchForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = $('#searchInput').value.trim();
  if (q.length < 2) return;
  $('#searchInput').blur();
  runSearch(q);
});
$('#moreBtn').addEventListener('click', () => runSearch(search.query, true));

// ---------- Meine Bücher ----------
const libView = { sub: 'list', filter: 'owned', tag: '' };

function renderTagFilter() {
  const sel = $('#tagFilter');
  const tags = allTags();
  if (libView.tag && !tags.includes(libView.tag)) libView.tag = '';
  sel.hidden = !tags.length;
  sel.replaceChildren(el('option', { value: '', text: 'Alle Regale' }), ...tags.map((t) => el('option', { value: t, text: `Regal: ${t}` })));
  sel.value = libView.tag;
}

function renderLibrary() {
  renderTagFilter();
  const tokens = normalizeText($('#libFilter').value).split(' ').filter(Boolean);
  const items = [...library.byKey.values()].filter((e) => {
    if (libView.filter === 'owned' && !e.owned) return false;
    if (libView.filter === 'read' && !e.read) return false;
    if (libView.filter === 'unread' && (!e.owned || e.read)) return false;
    if (libView.filter === 'wish' && !e.wish) return false;
    if (libView.tag && !(e.tags || []).includes(libView.tag)) return false;
    return tokens.length ? matchesTokens(e, tokens, `${e.genre || ''} ${(e.tags || []).join(' ')} ${e.notes || ''}`) : true;
  });
  const cmp = {
    title: compareTitle,
    author: compareAuthor,
    year: (a, b) => (b.year || 0) - (a.year || 0) || compareTitle(a, b),
    added: (a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || compareTitle(a, b),
    readAt: (a, b) => (b.readAt || '').localeCompare(a.readAt || '') || compareTitle(a, b),
  }[$('#libSort').value];
  items.sort(cmp);

  const box = $('#libList');
  box.replaceChildren(...items.map((e) => bookCard(e)));
  const total = library.byKey.size;
  $('#libStatus').textContent = total ? `${fmt.format(items.length)} von ${plural(total, 'Eintrag', 'Einträgen')}` : '';
  if (!items.length) {
    box.append(el('p', {
      class: 'empty',
      text: total ? 'Nichts gefunden.' : 'Noch keine Bücher. Suche ein Buch und tippe auf „Besitze ich“ oder „Merken“.',
    }));
  }
}

function renderSub() {
  for (const b of document.querySelectorAll('.segmented button')) {
    const active = b.dataset.sub === libView.sub;
    b.setAttribute('aria-pressed', String(active));
    $(`#sub-${b.dataset.sub}`).hidden = !active;
  }
  if (libView.sub === 'list') renderLibrary();
  else if (libView.sub === 'series') renderSeries($('#seriesList'));
  else renderStats($('#statsBox'));
}

document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
  libView.sub = b.dataset.sub;
  renderSub();
}));
$('#libFilter').addEventListener('input', renderLibrary);
$('#libSort').addEventListener('change', renderLibrary);
$('#tagFilter').addEventListener('change', (ev) => {
  libView.tag = ev.target.value;
  // Ein Regal zeigt alle seine Bücher – egal ob im Besitz, gelesen oder gemerkt.
  if (libView.tag) {
    libView.filter = 'all';
    document.querySelectorAll('.chip[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === 'all')));
  }
  renderLibrary();
});
document.querySelectorAll('.chip[data-filter]').forEach((chip) => chip.addEventListener('click', () => {
  libView.filter = chip.dataset.filter;
  document.querySelectorAll('.chip[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  renderLibrary();
}));

// ---------- Sicherung ----------
$('#exportBtn').addEventListener('click', async () => {
  const blob = new Blob([await exportJson()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bibliothek-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#importInput').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const n = await importJson(await file.text());
    await loadLibrary();
    renderSub();
    alert(`${n} Einträge übernommen.`);
  } catch (err) {
    alert(`Import fehlgeschlagen: ${err.message}`);
  }
  ev.target.value = '';
});

// ---------- Tabs ----------
function showView(name) {
  for (const btn of document.querySelectorAll('.tabs button')) {
    const active = btn.dataset.view === name;
    btn.setAttribute('aria-selected', String(active));
    $(`#view-${btn.dataset.view}`).hidden = !active;
  }
  if (name === 'library') renderSub();
  else if (search.query) renderResults();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- Start ----------
await loadLibrary();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
