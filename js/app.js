import { catalog } from './catalog.js';
import { groupEditions, compareTitle, compareAuthor, normalizeText, searchableSubtitle } from './works.js';
import { exportJson, importJson } from './store.js';
import { normalizeIsbn } from './isbn.js';
import { library, loadLibrary, entryFor, onLibraryChange, allTags, refreshEntry } from './library.js';
import { bookCard } from './card.js';
import { renderSeries } from './series.js';
import { renderStats } from './stats.js';
import { $, el, fmt, plural } from './util.js';
import { scanIsbn } from './scan.js';
import { settings } from './settings.js';
import { GENRES } from './genres.js';

onLibraryChange(() => {
  const owned = [...library.byKey.values()].filter((e) => e.owned).length;
  $('#libCount').textContent = owned ? fmt.format(owned) : '';
});

function matchesTokens(entry, tokens, extra = '') {
  const hay = normalizeText([entry.title, searchableSubtitle(entry.subtitle), ...(entry.authors || []), entry.series, extra].join(' '));
  return tokens.every((t) => hay.includes(t));
}

/**
 * Bände einer Reihe zusammenhalten und nach Bandnummer ordnen (Eragon 1, 2, 3 …), an der Stelle des
 * ersten gefundenen Bandes. Bände ohne Nummer folgen nach Erscheinungsjahr. Ändert die Liste direkt.
 */
function orderSeries(list) {
  const key = (w) => (w.series ? `${normalizeText(w.series)}|${normalizeText(w.authorSort || '')}` : null);
  const groups = new Map();
  for (const w of list) {
    const k = key(w);
    if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); }
  }
  const byVolume = (a, b) => (Number(a.volume) || Infinity) - (Number(b.volume) || Infinity) || (a.year || 0) - (b.year || 0);
  const out = [];
  const placed = new Set();
  for (const w of list) {
    const k = key(w);
    if (!k || groups.get(k).length < 2) { out.push(w); continue; }
    if (placed.has(k)) continue;
    placed.add(k);
    out.push(...groups.get(k).sort(byVolume));
  }
  list.splice(0, list.length, ...out);
}

// ---------- Suche ----------
// editions: von der DNB (werden hier zusammengefasst), works: aus der Datenbank (schon zusammengefasst)
const search = { query: '', editions: [], works: [], total: 0, next: null, controller: null };

function renderResults() {
  const box = $('#results');
  box.replaceChildren();
  const fromDb = search.works.length > 0;
  const works = fromDb ? search.works : groupEditions(search.editions);
  if (fromDb) works.forEach((w) => refreshEntry(w).catch(() => {})); // eigene Einträge mit Katalogdaten auffrischen
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
  // Einzelbuchstaben (Initialen wie das „R“ in „George R R Martin“) passen auf fast alles – ignorieren.
  const tokens = normalizeText(search.query).split(' ').filter((t) => t.length >= 2);
  for (const e of library.byKey.values()) {
    if (!e.owned || seen.has(e.key)) continue;
    if (isbn ? (e.isbns || []).includes(isbn) : matchesTokens(e, tokens)) owned.push(e);
  }
  // Relevanz, jeweils A–Z: 0 = alles im Titel/Reihe, 1 = Titel + Autor zusammen,
  // 2 = sonstige Treffer (z. B. Person nur als Übersetzerin beteiligt).
  const titleHit = (w) => {
    if (!tokens.length) return 0;
    const t = normalizeText([w.title, searchableSubtitle(w.subtitle), w.series].join(' '));
    if (tokens.every((x) => t.includes(x))) return 0;
    const ta = `${t} ${normalizeText((w.authors || []).join(' '))}`;
    return tokens.every((x) => ta.includes(x)) ? 1 : 2;
  };
  const byRelevance = (a, b) => titleHit(a) - titleHit(b) || compareTitle(a, b);
  owned.sort(byRelevance);
  // Die Datenbank liefert schon fertig sortiert (bei Tippfehlern: ähnlichste zuerst) – Reihenfolge behalten.
  if (!fromDb) others.sort(byRelevance);
  orderSeries(owned);
  orderSeries(others);
  // Passt die Suche zu einer Reihe („Eragon“, „Harry Potter“), steht diese Reihe ganz oben – in Bandfolge.
  const seriesHit = (w) => tokens.length > 0 && w.series && tokens.every((t) => normalizeText(w.series).includes(t));
  for (const list of [owned, others]) {
    const hits = list.filter(seriesHit);
    if (hits.length) list.splice(0, list.length, ...hits, ...list.filter((w) => !seriesHit(w)));
  }

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
  if (fromDb) {
    status.textContent = `${fmt.format(works.length)} von ${plural(search.total, 'Buch', 'Büchern')}.`;
  } else {
    status.textContent = search.total
      ? `${plural(works.length, 'Buch', 'Bücher')} aus ${fmt.format(loaded)} von ${plural(search.total, 'Ausgabe', 'Ausgaben')}`
        + (search.next ? ' – sortiert innerhalb der geladenen Treffer.' : '.')
      : '';
  }
  const more = $('#moreBtn');
  more.hidden = !search.next;
  more.disabled = false;
  more.textContent = 'Mehr laden';
}

async function runSearch(query, append = false) {
  if (!append) { endBrowse(false); $('#genreChips').hidden = true; }
  search.controller?.abort();
  const controller = new AbortController();
  search.controller = controller;
  const status = $('#searchStatus');
  if (!append) {
    Object.assign(search, { query, editions: [], works: [], total: 0, next: null });
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
    if (res.works) search.works.push(...res.works);
    else search.editions.push(...res.editions);
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
$('#moreBtn').addEventListener('click', () => (browse.mode ? loadBrowse(true) : runSearch(search.query, true)));

// ---------- Live-Suche: Treffer erscheinen beim Tippen ----------
// Ab 3 Buchstaben, 500 ms nach dem letzten Tastendruck, dieselbe Suche wie mit der Lupe (ohne Tastatur zu schließen).
// Ressourcen geprüft: ~20 KB je Trefferseite, bei ~4 Zwischenständen je Suche und 50 Suchen am Tag ≈ 120 MB im Monat
// von 5 GB (Supabase Free, Anfragen unbegrenzt). Die Pause verhindert, dass bei jedem Buchstaben Cover geladen werden.
const live = { timer: null };
const cancelLive = () => clearTimeout(live.timer);

$('#searchInput').addEventListener('input', () => {
  const q = $('#searchInput').value.trim();
  cancelLive();
  // ISBNs (Ziffern) erst mit der Lupe/Enter suchen – halbe ISBNs ergeben keinen Sinn
  if (q.length < 3 || /^[\d\s-]+x?$/i.test(q)) return;
  live.timer = setTimeout(() => {
    if ($('#searchInput').value.trim() === q && q !== search.query) runSearch(q);
  }, 500);
});
$('#searchForm').addEventListener('submit', cancelLive);

// ---------- Stöbern: Autorenseite und Genres ----------
// Läuft im Such-Tab: Leiste „‹ Zurück · Titel“ über der Liste. „Zurück“ stellt die vorherige Suche wieder her.
// Ohne Suche zeigt der Such-Tab die Genre-Knöpfe (nur mit Datenbank – sie sortiert nach Beliebtheit).
const browse = { mode: null, value: '', works: [], next: null, saved: null, controller: null };

function renderGenreChips() {
  const box = $('#genreChips');
  const show = catalog.canBrowse && !browse.mode && !search.query;
  box.hidden = !show;
  if (!show || box.childElementCount) return;
  box.append(el('h2', { class: 'section-title', text: 'Stöbern nach Genre' }),
    el('div', { class: 'chips' }, ...GENRES.map(([name]) => el('button', {
      type: 'button', class: 'chip', text: name, onclick: () => startBrowse('genre', name),
    }))));
}

function renderBrowse() {
  const box = $('#results');
  box.replaceChildren();
  $('#browseBar').hidden = false;
  $('#browseTitle').textContent = browse.value;
  $('#browseKind').textContent = browse.mode === 'author' ? 'Autor' : 'Genre';
  const status = $('#searchStatus');
  status.classList.remove('error');
  let list = browse.works;
  list.forEach((w) => refreshEntry(w).catch(() => {}));
  if (browse.mode === 'author') {
    // Eigene Bücher oben (auch solche, die nur per ISBN in die Bibliothek kamen), Reihen zusammen, sonst A–Z
    const seen = new Set();
    const owned = [], others = [];
    for (const w of list) {
      const e = entryFor(w);
      if (e) seen.add(e.key);
      (e?.owned ? owned : others).push(w);
    }
    for (const e of library.byKey.values()) {
      if (e.owned && !seen.has(e.key) && (e.authors || []).includes(browse.value)) owned.push(e);
    }
    owned.sort(compareTitle);
    orderSeries(owned);
    orderSeries(others);
    if (owned.length) {
      box.append(el('h2', { class: 'section-title', text: `In deinem Besitz (${owned.length})` }));
      for (const w of owned) box.append(bookCard(w));
      if (others.length) box.append(el('h2', { class: 'section-title', text: `Weitere Bücher (${others.length})` }));
    }
    for (const w of others) box.append(bookCard(w));
    list = [...owned, ...others];
    status.textContent = `${plural(list.length, 'Buch', 'Bücher')}, A–Z${list.length >= 500 ? ' (die ersten 500)' : ''}.`;
  } else {
    for (const w of list) box.append(bookCard(w));
    status.textContent = 'Die beliebtesten zuerst.';
  }
  if (!list.length) box.append(el('p', { class: 'empty', text: 'Keine Bücher gefunden.' }));
  const more = $('#moreBtn');
  more.hidden = !browse.next;
  more.disabled = false;
  more.textContent = 'Mehr laden';
}

async function loadBrowse(append = false) {
  browse.controller?.abort();
  const controller = new AbortController();
  browse.controller = controller;
  const status = $('#searchStatus');
  if (append) { $('#moreBtn').disabled = true; $('#moreBtn').textContent = 'Lädt …'; } else status.textContent = 'Lädt …';
  try {
    if (browse.mode === 'author') {
      browse.works = await catalog.authorWorks(browse.value);
      browse.next = null;
    } else {
      const res = await catalog.browseGenre(browse.value, append ? browse.next : 0, controller.signal);
      browse.works = append ? [...browse.works, ...res.works] : res.works;
      browse.next = res.next;
    }
    if (controller.signal.aborted || !browse.mode) return;
    renderBrowse();
  } catch (err) {
    if (err.name === 'AbortError') return;
    status.classList.add('error');
    status.textContent = `Laden hat nicht geklappt: ${err.message}`;
    $('#moreBtn').disabled = false;
    $('#moreBtn').textContent = 'Erneut versuchen';
  }
}

function startBrowse(mode, value) {
  cancelLive();
  search.controller?.abort();
  // Vorherigen Zustand merken (nur beim ersten Schritt – Autor → Genre → Autor führt trotzdem zur Suche zurück)
  if (!browse.mode) browse.saved = { input: $('#searchInput').value, query: search.query, scroll: window.scrollY };
  Object.assign(browse, { mode, value, works: [], next: null });
  showView('search');
  $('#results').replaceChildren();
  $('#moreBtn').hidden = true;
  renderGenreChips();
  $('#browseBar').hidden = false;
  $('#browseKind').textContent = mode === 'author' ? 'Autor' : 'Genre';
  $('#browseTitle').textContent = value;
  loadBrowse();
}

function endBrowse(restore = true) {
  if (!browse.mode) return;
  browse.controller?.abort();
  const saved = browse.saved;
  Object.assign(browse, { mode: null, value: '', works: [], next: null, saved: null });
  $('#browseBar').hidden = true;
  if (!restore) return;
  $('#searchInput').value = saved?.input || '';
  if (search.query) {
    renderResults();
    window.scrollTo(0, saved?.scroll || 0);
  } else {
    $('#results').replaceChildren();
    $('#moreBtn').hidden = true;
    $('#searchStatus').textContent = DEFAULT_STATUS;
  }
  renderGenreChips();
}

const DEFAULT_STATUS = $('#searchStatus').textContent;
$('#browseBack').addEventListener('click', () => endBrowse());
document.addEventListener('browse', (ev) => startBrowse(ev.detail.mode, ev.detail.value));
// Suchfeld geleert (auch per ✕ im Feld) → zurück zur Startansicht mit den Genres
$('#searchInput').addEventListener('input', () => {
  if ($('#searchInput').value.trim()) return;
  endBrowse(false);
  search.controller?.abort();
  Object.assign(search, { query: '', editions: [], works: [], total: 0, next: null });
  $('#results').replaceChildren();
  $('#moreBtn').hidden = true;
  $('#searchStatus').classList.remove('error');
  $('#searchStatus').textContent = DEFAULT_STATUS;
  renderGenreChips();
});

// ---------- Barcode-Scan ----------
$('#scanBtn').addEventListener('click', async () => {
  cancelLive();
  const isbn = await scanIsbn();
  if (!isbn) return;
  showView('search');
  $('#searchInput').value = isbn;
  runSearch(isbn);
});

// ---------- Ansicht: Liste oder Cover-Raster (2 je Reihe), pro Gerät gespeichert ----------
// Das Symbol im Knopf zeigt die NÄCHSTE Ansicht. Eine Ansicht „Groß“ (1 Cover je Reihe) gab es kurz (09.11.2026) –
// gefiel nicht, entfernt; gespeichertes „large“ wird zum Raster. Früher: Einstellung „grid“ (true/false).
const VIEW_MODES = ['list', 'grid'];
const VIEW_TITLES = { grid: 'Zum Cover-Raster', list: 'Zur Listenansicht' };
function applyViewMode(mode) {
  if (mode === 'large') mode = 'grid';
  if (!VIEW_MODES.includes(mode)) mode = 'list';
  const next = VIEW_MODES[(VIEW_MODES.indexOf(mode) + 1) % VIEW_MODES.length];
  document.body.classList.toggle('grid-view', mode !== 'list');
  const btn = $('#viewToggle');
  btn.dataset.mode = mode;
  btn.dataset.next = next;
  btn.setAttribute('aria-pressed', String(mode !== 'list'));
  btn.title = VIEW_TITLES[next];
  btn.setAttribute('aria-label', VIEW_TITLES[next]);
}
applyViewMode(settings.get('view', settings.get('grid', false) ? 'grid' : 'list'));
$('#viewToggle').addEventListener('click', () => {
  const mode = $('#viewToggle').dataset.next;
  settings.set('view', mode);
  applyViewMode(mode);
});

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
      text: total ? 'Nichts gefunden.' : 'Noch keine Bücher. Suche ein Buch und tippe auf „Besitze“ oder „Merken“.',
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
  else if (browse.mode) renderBrowse();
  else if (search.query) renderResults();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- Start ----------
await loadLibrary();
renderGenreChips();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
