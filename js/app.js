import { catalog } from './catalog.js';
import { groupEditions, compareTitle, compareAuthor, normalizeText, searchableSubtitle } from './works.js';
import { exportJson, importJson } from './store.js';
import { normalizeIsbn } from './isbn.js';
import { library, loadLibrary, entryFor, onLibraryChange, refreshEntry, refreshAllFromDb } from './library.js';
import { bookCard, restoreNextSheet } from './card.js';
import { renderSeries } from './series.js';
import { renderStats } from './stats.js';
import { renderShelves } from './shelves.js';
import { renderRandom, updateRandomCount } from './random.js';
import { $, el, fmt, plural, ignoreScrollBriefly, emptyState, animateIn } from './util.js';
import { scanIsbn } from './scan.js';
import { settings } from './settings.js';
import { GENRES } from './genres.js';
import { applyTheme, renderLook } from './theme.js';
import { initGift, showGreeting, giftData, clearGift } from './gift.js';
import { registerBack, enterLevel, goBack, attachEdgeSwipe, currentDepth, rewindTo, captureView, swipingBack } from './nav.js';

// Abzeichen an „Meine Bücher“ (13.11.2026): zählt nur Bücher, die seit dem letzten Besuch von „Meine Bücher“ neu als
// „Besitze“ markiert wurden – wie ein „Neu“-Hinweis. Beim Öffnen von „Meine Bücher“ verschwindet es. Gemerkt wird die
// Liste der gesehenen Bücher pro Gerät (settings `libSeen`); beim allerersten Start zählen vorhandene Bücher als gesehen.
const ownedKeys = () => [...library.byKey.values()].filter((e) => e.owned).map((e) => e.key);
function updateLibBadge() {
  let seen = settings.get('libSeen', null);
  if (!seen) { seen = ownedKeys(); settings.set('libSeen', seen); }
  const seenSet = new Set(seen);
  const fresh = ownedKeys().filter((k) => !seenSet.has(k)).length;
  $('#libCount').textContent = fresh ? fmt.format(fresh) : '';
  $('#tab-library').setAttribute('aria-label', fresh ? `Meine Bücher, ${fresh} neu` : 'Meine Bücher');
}
function markLibrarySeen() {
  settings.set('libSeen', ownedKeys());
  updateLibBadge();
}
onLibraryChange(() => {
  if (!$('#view-library').hidden) markLibrarySeen(); // wer gerade in „Meine Bücher“ ist, sieht das neue Buch ja
  else updateLibBadge();
  if (!$('#view-random').hidden) updateRandomCount($('#randomBox'));
});

/**
 * Lade-Platzhalter (12.11.2026): graue, sanft schimmernde Karten statt leerer Fläche. Stehen schon Bücher da
 * (Live-Suche tippt weiter), bleiben sie leicht abgeblendet stehen, statt zu flackern.
 */
function showSkeleton(box) {
  if (box.querySelector('.book')) { box.classList.add('stale'); return; }
  const card = () => el('div', { class: 'skel-card', 'aria-hidden': 'true' },
    el('div', { class: 'cover' }),
    el('div', { class: 'info' }, el('span', { class: 'sk w80' }), el('span', { class: 'sk w50' }), el('span', { class: 'sk w65 thin' })),
    el('div', { class: 'actions' }, el('span', { class: 'sk pill' }), el('span', { class: 'sk pill' }), el('span', { class: 'sk pill' })));
  box.replaceChildren(...Array.from({ length: 4 }, card));
}
function clearSkeleton() {
  const box = $('#results');
  box.classList.remove('stale');
  box.querySelectorAll('.skel-card').forEach((s) => s.remove());
}

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
  box.classList.remove('stale');
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
  if (!owned.length && !others.length) {
    box.append(emptyState({
      icon: '🔍', title: 'Keine passenden Bücher',
      text: 'Tipp: Nur den Nachnamen oder ein Wort aus dem Titel versuchen – oder den Barcode scannen.',
      action: { text: 'Barcode scannen ›', onclick: () => $('#scanBtn').click() },
    }));
  }

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
    showSkeleton($('#results'));
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
    clearSkeleton();
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
$('#searchForm').addEventListener('submit', () => { cancelLive(); syncClear(); });

// ---------- Suchleiste: „×“ leert alles, Tastatur schließt bei Berührung außerhalb ----------
// Die Lupe ist weg (09.11.2026) – „Suchen“ auf der Tastatur und die Live-Suche reichen.
const clearBtn = $('#searchClear');
const syncClear = () => { clearBtn.hidden = !$('#searchInput').value; };
$('#searchInput').addEventListener('input', syncClear);
clearBtn.addEventListener('pointerdown', (ev) => ev.preventDefault()); // Fokus (und Tastatur) im Feld lassen
clearBtn.addEventListener('click', () => {
  const inp = $('#searchInput');
  inp.value = '';
  inp.dispatchEvent(new Event('input')); // setzt die Suche zurück (siehe unten) und blendet „×“ aus
  inp.focus();
});
// Wer den Bildschirm hinter der Tastatur benutzt (scrollen, tippen), braucht sie nicht mehr – für ALLE Text- und
// Suchfelder (13.11.2026: Hauptsuche, „Meine Bücher“, Regal-Feld und Notiz im Detailblatt). Ausnahme: Berührung im
// Feld selbst bzw. in seinem Rahmen (Suchleiste mit „×“, Regal-Zeile mit ihren Schildchen).
document.addEventListener('touchstart', (ev) => {
  const a = document.activeElement;
  if (!a || !a.matches?.('input[type="search"], input[type="text"], textarea')) return;
  const frame = a.closest('.search-wrap, .searchbar, .tags-edit') || a;
  if (frame.contains(ev.target)) return;
  ignoreScrollBriefly();
  a.blur();
}, { capture: true, passive: true });

// „×“ am Ende jedes Suchfelds: erscheint, sobald etwas drinsteht, und leert das Feld (Hauptsuche hat ihren eigenen oben)
function attachClear(input) {
  const btn = el('button', { type: 'button', class: 'search-clear', 'aria-label': 'Eingabe löschen', title: 'Eingabe löschen', text: '×', hidden: true });
  input.after(btn);
  const sync = () => { btn.hidden = !input.value; };
  input.addEventListener('input', sync);
  btn.addEventListener('pointerdown', (ev) => ev.preventDefault()); // Tastatur bleibt offen
  btn.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });
  return sync;
}
attachClear($('#libFilter'));

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

// Stöber-Arten: Autor (Wert = Name), Genre (Wert = Gruppe), Reihe (Wert = { series, authorSort }, 09.11.2026)
const BROWSE_KINDS = { author: 'Autor', genre: 'Genre', series: 'Reihe' };
const browseTitle = () => (browse.mode === 'series' ? browse.value.series : browse.value);

/**
 * Unterreihen einer Reihe (13.11.2026): Kommen Bandnummern mehrfach vor („Die drei ??? Kids“ hat „Band 1“ viermal),
 * zählt jeder Autor seine eigene Unterreihe. Ein Band mit mehreren Autoren gehört zu dem, der die meisten Bände hat.
 * Gruppen: größte zuerst, Bände ohne Nummer am Ende jeder Gruppe. Ohne doppelte Nummern: eine Gruppe (wie bisher).
 */
function seriesGroups(list) {
  const vols = list.map((w) => w.volume).filter(Boolean);
  if (new Set(vols).size === vols.length) return [{ name: '', works: list }];
  // Schreibweisen zusammenführen („Anja Körner“ = „Anja Koerner“)
  const key = (a) => normalizeText(a);
  const count = new Map();
  const display = new Map();
  for (const w of list) for (const a of w.authors || []) {
    count.set(key(a), (count.get(key(a)) || 0) + 1);
    if (!display.has(key(a))) display.set(key(a), a);
  }
  const groups = new Map();
  for (const w of list) {
    const a = [...(w.authors || [])].map(key).sort((x, y) => count.get(y) - count.get(x))[0] || '';
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a).push(w);
  }
  // Hauptreihe (Wunsch des Nutzers 13.11.2026): Der größte Autor bildet die Hauptzählung. Andere Autoren gehören dazu,
  // wenn ihre Nummern die Hauptzählung ergänzen (Pfeiffer füllt Bände 25, 27 …). Fängt ein Autor bei Band 1 neu an
  // und überschneiden sich mindestens die Hälfte seiner Nummern mit der Hauptzählung, ist er eine eigene Unterreihe
  // (Schiefelbein „Mission …“, Körner).
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const mainWorks = sorted[0][1];
  const mainNums = new Set(mainWorks.map((w) => w.volume).filter(Boolean));
  const main = [...mainWorks];
  const subs = [];
  for (const [k, works] of sorted.slice(1)) {
    const nums = works.map((w) => Number(w.volume)).filter((n) => n > 0);
    const overlap = nums.filter((n) => mainNums.has(String(n))).length;
    if (nums.length && Math.min(...nums) === 1 && overlap >= nums.length / 2) subs.push({ name: display.get(k) || 'Ohne Autor', works });
    else main.push(...works);
  }
  if (!subs.length) return [{ name: '', works: list }];
  const vol = (w) => (w.volume ? Number(w.volume) : Infinity);
  main.sort((a, b) => vol(a) - vol(b) || (a.year || 9999) - (b.year || 9999));
  return [{ name: 'Hauptreihe', works: main }, ...subs.map((s) => ({ name: `Unterreihe von ${s.name}`, works: s.works }))];
}

function renderBrowse() {
  const box = $('#results');
  box.replaceChildren();
  box.classList.remove('stale');
  $('#browseBar').hidden = false;
  $('#browseTitle').textContent = browseTitle();
  $('#browseKind').textContent = BROWSE_KINDS[browse.mode];
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
  } else if (browse.mode === 'series') {
    const groups = seriesGroups(list);
    if (groups.length > 1) {
      // Mehrere Unterreihen mit eigener Zählung („Die drei ??? Kids“: Blanck, Pfeiffer, Mission-Bände …) – je Autor
      for (const g of groups) {
        box.append(el('h2', { class: 'section-title', text: `${g.name} · ${plural(g.works.length, 'Band', 'Bände')}` }));
        for (const w of g.works) box.append(bookCard(w));
      }
      status.textContent = `${plural(list.length, 'Band', 'Bände')}: Hauptreihe und ${plural(groups.length - 1, 'Unterreihe', 'Unterreihen')}, jeweils in Bandfolge.`;
    } else {
      for (const w of list) box.append(bookCard(w));
      status.textContent = `${plural(list.length, 'Band', 'Bände')} in Bandfolge.`;
    }
  } else {
    for (const w of list) box.append(bookCard(w));
    status.textContent = 'Die beliebtesten zuerst.';
  }
  if (!list.length) box.append(emptyState({ icon: '🔍', title: 'Keine Bücher gefunden', text: 'Hier gibt es (noch) keine Bücher im Katalog.' }));
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
  if (append) { $('#moreBtn').disabled = true; $('#moreBtn').textContent = 'Lädt …'; } else { status.textContent = 'Lädt …'; showSkeleton($('#results')); }
  try {
    if (browse.mode === 'author') {
      browse.works = await catalog.authorWorks(browse.value);
      browse.next = null;
    } else if (browse.mode === 'series') {
      // Alle Bände in Bandfolge, Bände ohne Nummer nach Erscheinungsjahr dahinter
      // Ganze Reihe, auch mit mehreren Autoren (Die drei ??? Kids); ohne Treffer nur mit diesem Autor (DNB-Ausweichweg)
      let works = await catalog.seriesWorks(browse.value.series, null);
      if (!works.length) works = await catalog.seriesWorks(browse.value.series, browse.value.authorSort);
      const vol = (w) => (w.volume ? Number(w.volume) : Infinity);
      browse.works = works.sort((a, b) => vol(a) - vol(b) || (a.year || 9999) - (b.year || 9999) || compareTitle(a, b));
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
    clearSkeleton();
    status.classList.add('error');
    status.textContent = `Laden hat nicht geklappt: ${err.message}`;
    $('#moreBtn').disabled = false;
    $('#moreBtn').textContent = 'Erneut versuchen';
  }
}

// Zurück führt genau dorthin, woher man kam (13.11.2026): Jede Stöbern-Seite legt den Zustand davor auf einen
// Stapel – die vorige Stöbern-Seite (Autor → Reihe → zurück = Autor) oder die Ausgangsansicht (Suche, Meine Bücher,
// Zufall) mit Scrollstand.
const browseStack = [];
let browseBaseDepth = 0; // Verlaufstiefe vor der ersten Stöbern-Seite (zum Zurückspulen bei neuer Suche)

function startBrowse(mode, value, fromSheet = null) {
  cancelLive();
  search.controller?.abort();
  // Aus einem anderen Reiter gestartet, während im Such-Reiter noch gestöbert wurde: neuer Stapel, Herkunft = dieser Reiter
  if (browse.mode && $('#view-search').hidden) { browse.mode = null; browseStack.length = 0; }
  if (!browse.mode) browseBaseDepth = currentDepth();
  // snap: Abbild der Seite davor – beim Wischen vom Rand erscheint es unter der aktuellen Seite (wie am iPhone);
  // fromSheet: kam man aus einem Detailblatt, öffnet „zurück“ es wieder
  const snap = captureView();
  if (snap && fromSheet?.snap) Object.assign(snap, { sheet: fromSheet.snap, sheetScroll: fromSheet.scrollTop }); // Blatt gehört zum Bild der vorigen Seite
  const common = { scroll: window.scrollY, snap, fromSheet };
  browseStack.push(browse.mode
    ? { kind: 'browse', mode: browse.mode, value: browse.value, works: browse.works, next: browse.next, ...common }
    : { kind: 'origin', view: document.body.dataset.view || 'search', input: $('#searchInput').value, ...common });
  enterLevel(); // Eintrag im Verlauf: Wischen vom Rand / Android-Zurück führt eine Stufe zurück
  Object.assign(browse, { mode, value, works: [], next: null });
  showView('search');
  $('#results').replaceChildren();
  $('#moreBtn').hidden = true;
  renderGenreChips();
  $('#browseBar').hidden = false;
  $('#browseKind').textContent = BROWSE_KINDS[mode];
  $('#browseTitle').textContent = browseTitle();
  loadBrowse();
  animateIn($('#view-search'), 'fwd'); // neue Seite schiebt sich von rechts herein
}

/** Eine Stufe zurück (restore) bzw. Stöbern ganz verlassen (restore = false, z. B. neue Suche). */
function endBrowse(restore = true) {
  if (!browse.mode) return;
  browse.controller?.abort();
  const prev = restore ? browseStack.pop() : null;
  if (!restore) { browseStack.length = 0; rewindTo(browseBaseDepth); } // eigene Verlaufseinträge zurückspulen
  // Vorige Stöbern-Seite: ohne neues Laden wiederherstellen
  if (prev?.kind === 'browse') {
    Object.assign(browse, { mode: prev.mode, value: prev.value, works: prev.works, next: prev.next });
    renderBrowse();
    if (!swipingBack()) animateIn($('#view-search'), 'back'); // beim Wischen war die Seite schon zu sehen
    window.scrollTo(0, prev.scroll || 0);
    reopenSheet(prev.fromSheet, $('#view-search'));
    return;
  }
  Object.assign(browse, { mode: null, value: '', works: [], next: null });
  browseStack.length = 0;
  $('#browseBar').hidden = true;
  if (!restore) return;
  // Such-Reiter wieder auf die Suche davor setzen (auch wenn man in eine andere Ansicht zurückkehrt)
  $('#searchInput').value = prev?.input || ''; syncClear();
  if (search.query) {
    renderResults();
  } else {
    $('#results').replaceChildren();
    $('#moreBtn').hidden = true;
    $('#searchStatus').textContent = DEFAULT_STATUS;
  }
  renderGenreChips();
  const view = prev?.view || 'search';
  if (view !== 'search') showView(view); // z. B. zurück zu Meine Bücher oder Zufall
  const viewEl = $(`#view-${view}`);
  if (swipingBack()) viewEl.classList.remove('enter-fade'); else animateIn(viewEl, 'back'); // zurück: von links
  window.scrollTo(0, prev?.scroll || 0);
  reopenSheet(prev?.fromSheet, viewEl);
}

/** Nach „zurück“ das Detailblatt wieder öffnen, aus dem man kam – über die sichtbare Karte desselben Buchs. */
function reopenSheet(fromSheet, viewEl) {
  if (!fromSheet) return;
  const card = [...viewEl.querySelectorAll('.book[data-key]')].find((c) => c.dataset.key === fromSheet.key && c.offsetParent);
  const btn = card?.querySelector('.more-btn');
  restoreNextSheet(fromSheet); // sofort da: alte Scrollstelle, Cover, Hintergrund, Klappentext-Zustand
  if (btn) btn.click(); else fromSheet.reopen?.();
  // Oberste Ebene (Suche, Meine Bücher, Zufall): Verlaufseintrag für das Blatt, damit Android-Zurück nur das Blatt
  // schließt statt die App zu verlassen (Prüfrunde 13.11.2026; der popstate-Zweig für Blätter schließt es nur)
  if (currentDepth() === 0) enterLevel();
}

const DEFAULT_STATUS = $('#searchStatus').textContent;
$('#browseBack').addEventListener('click', () => goBack());
// Stöbern-Seite: „zurück“ (‹, Wischen vom Rand, Android-Zurück) → vorherige Suche
registerBack(() => {
  if (!browse.mode || $('#view-search').hidden) return null;
  const fn = () => endBrowse();
  fn.snapshot = browseStack.at(-1)?.snap; // vorige Seite für die Wischgeste
  return fn;
});
document.addEventListener('browse', (ev) => startBrowse(ev.detail.mode, ev.detail.value, ev.detail.fromSheet || null));
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
  $('#searchInput').value = isbn; syncClear();
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
// Liste · Reihen · Regale · Statistik (Variante B, 10.11.2026): Regale haben eine eigene Unteransicht (js/shelves.js),
// das Zufallsbuch einen eigenen Reiter „🎲“ (js/random.js) – die Liste selbst hat nur Filtern, Sortieren und Filter-Chips.
const libView = { sub: 'list', filter: 'owned' };

const FILTER_LABELS = { owned: 'Besitze', read: 'Gelesen', unread: 'Ungelesen', wish: 'Merkliste', abandoned: 'Abgebrochen', all: 'Alle' };
const SORT_LABELS = { title: 'Titel A–Z', author: 'Autor A–Z', year: 'Neueste zuerst', added: 'Zuletzt hinzugefügt', readAt: 'Zuletzt gelesen', rating: 'Beste Bewertung' };
function inFilter(e, f) {
  if (f === 'owned') return e.owned;
  if (f === 'read') return e.read;
  if (f === 'unread') return e.owned && !e.read && !e.abandoned;
  if (f === 'wish') return e.wish;
  if (f === 'abandoned') return e.abandoned;
  return true;
}
const filterCount = (f) => [...library.byKey.values()].filter((e) => inFilter(e, f)).length;

function renderLibrary() {
  const tokens = normalizeText($('#libFilter').value).split(' ').filter(Boolean);
  const items = [...library.byKey.values()].filter((e) => {
    if (!inFilter(e, libView.filter)) return false;
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
  // Anzahl im Suchfeld und im Filter-Knopf statt in einer eigenen Zeile (13.11.2026)
  const label = FILTER_LABELS[libView.filter];
  const shown = filterCount(libView.filter);
  $('#libFilter').placeholder = shown ? `${plural(shown, 'Buch', 'Bücher')} durchsuchen` : 'Bücher durchsuchen';
  $('#libFilterBtn').textContent = `${label} ▾`;
  $('#libFilterBtn').classList.toggle('narrowed', libView.filter !== 'all');
  if (!items.length) {
    box.append(total
      ? emptyState({ icon: '🔍', title: 'Nichts gefunden', text: 'Kein Buch passt zu diesem Filter.' })
      : emptyState({
        icon: '📚', title: 'Noch keine Bücher',
        text: 'Suche ein Buch oder scanne den Barcode und tippe auf „Besitze“ oder „Merken“.',
        action: { text: 'Bücher suchen ›', onclick: () => { showView('search'); $('#searchInput').focus(); } },
      }));
  }
  if (!$('#filterSheet').hidden) renderFilterSheet();
}

// Filter-Blatt: große Knöpfe mit Anzahl, Sortierung als Liste; Änderungen wirken sofort
function renderFilterSheet() {
  for (const chip of document.querySelectorAll('#filterSheet .chip[data-filter]')) {
    const f = chip.dataset.filter;
    chip.replaceChildren(el('span', { text: FILTER_LABELS[f] }), el('span', { class: 'n', text: fmt.format(filterCount(f)) }));
    chip.setAttribute('aria-pressed', String(libView.filter === f));
  }
  const cur = $('#libSort').value;
  $('#sortList').replaceChildren(...Object.entries(SORT_LABELS).map(([k, label]) => el('button', {
    type: 'button', class: 'sort-opt', 'aria-pressed': String(cur === k), text: label,
    onclick: () => { $('#libSort').value = k; renderLibrary(); renderFilterSheet(); },
  })));
}
function openFilterSheet() {
  renderFilterSheet();
  $('#filterSheet').hidden = false;
  document.body.classList.add('mini-open');
}
function closeFilterSheet() {
  $('#filterSheet').hidden = true;
  document.body.classList.remove('mini-open');
}
$('#libFilterBtn').addEventListener('click', openFilterSheet);
$('#filterDone').addEventListener('click', closeFilterSheet);
$('#filterSheet .mini-backdrop').addEventListener('click', closeFilterSheet);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#filterSheet').hidden) closeFilterSheet(); });

// Kopf von „Meine Bücher“ beim Scrollen (13.11.2026): beim Runterscrollen weg, beim kleinsten Hochscrollen sofort
// wieder da (wie Safari und viele Apps) – mehr Platz für die Bücher. Ganz oben immer sichtbar.
{
  let lastY = window.scrollY;
  const head = $('#libHead');
  const topBar = document.querySelector('.top');
  const setTop = () => document.documentElement.style.setProperty('--top-h', `${topBar.offsetHeight}px`);
  setTop();
  window.addEventListener('resize', setTop);
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const d = y - lastY;
    lastY = y;
    if ($('#view-library').hidden) return;
    if (y < 40 || d < -1) head.classList.remove('away');
    else if (d > 3 && y > head.offsetHeight + 40 && !head.contains(document.activeElement)) head.classList.add('away');
  }, { passive: true });
}

function renderSub() {
  for (const b of document.querySelectorAll('.segmented button')) {
    const active = b.dataset.sub === libView.sub;
    b.setAttribute('aria-pressed', String(active));
    $(`#sub-${b.dataset.sub}`).hidden = !active;
  }
  $('#libTools').hidden = libView.sub !== 'list'; // Suchfeld + Filter nur in der Liste
  $('#libHead').classList.remove('away');
  if (libView.sub === 'list') renderLibrary();
  else if (libView.sub === 'series') renderSeries($('#seriesList'));
  else if (libView.sub === 'shelves') renderShelves($('#shelvesBox'));
  else renderStats($('#statsBox'));
}

document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
  libView.sub = b.dataset.sub;
  renderSub();
  animateIn($(`#sub-${libView.sub}`), 'fade');
}));
$('#libFilter').addEventListener('input', renderLibrary);
$('#libSort').addEventListener('change', renderLibrary);
document.querySelectorAll('.chip[data-filter]').forEach((chip) => chip.addEventListener('click', () => {
  libView.filter = chip.dataset.filter;
  document.querySelectorAll('.chip[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  renderLibrary();
  window.scrollTo(0, 0);
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
  const changed = document.body.dataset.view !== name;
  document.body.dataset.view = name; // z. B. Raster-Schalter nur bei Listen zeigen
  if (changed) animateIn($(`#view-${name}`), 'fade'); // Reiterwechsel: kurz einblenden
  if (name === 'library') { renderSub(); markLibrarySeen(); }
  else if (name === 'random') renderRandom($('#randomBox'));
  else if (name === 'settings') renderSettings();
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
// Eigene Einträge im Hintergrund mit dem Katalog abgleichen (Band, Reihe, Cover …), höchstens alle 12 Stunden
refreshAllFromDb((keys) => catalog.worksByKeys(keys)).then((n) => {
  if (n && !$('#view-library').hidden) renderSub();
}).catch(() => {});

// Darstellung und Geschenk (10.11.2026)
applyTheme();
initGift();
attachEdgeSwipe(); // Wischen vom linken Rand = zurück (nur installierte iPhone-App; sonst hat das System eine Geste)
function renderSettings() {
  renderLook($('#lookControls'), () => (giftData()
    ? [el('p', { class: 'gift-actions' },
        el('button', { type: 'button', class: 'link-btn', text: 'Geburtstagsgruß noch einmal ansehen ›', onclick: () => showGreeting({ music: true }) }),
        el('button', {
          type: 'button', class: 'link-btn danger', text: 'Geschenk von diesem Gerät entfernen',
          onclick: () => { if (window.confirm('Name und Geburtstagsgruß von diesem Gerät entfernen? Bücher und Einstellungen bleiben.')) { clearGift(); renderSettings(); } },
        }))]
    : []));
}
