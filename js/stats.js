// Statistik über die eigene Bibliothek.
import { library, loadLibrary } from './library.js';
import { store } from './store.js';
import { catalog } from './catalog.js';
import { el, fmt, plural, pageCount, emptyState } from './util.js';
import { settings } from './settings.js';

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
      el('span', { class: 'bar' }, el('span', { class: 'bar-fill', style: `width:${n ? Math.max(4, (n / max) * 100) : 0}%` })),
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

/**
 * Jahresziel („18 von 24 Büchern 2026“): gezählt werden Bücher mit Lesedatum im laufenden Jahr.
 * Das Ziel steht pro Gerät in den Einstellungen (wie Raster/Liste).
 */
function goalBlock(read, rerender) {
  const year = String(new Date().getFullYear());
  const goals = settings.get('readingGoals', {});
  const goal = goals[year] || 0;
  const done = read.filter((e) => e.readAt?.startsWith(year)).length;
  const setGoal = () => {
    const v = window.prompt(`Wie viele Bücher willst du ${year} lesen?`, goal || '');
    if (v === null) return;
    const n = Math.max(0, Math.min(999, parseInt(v, 10) || 0));
    settings.set('readingGoals', { ...goals, [year]: n });
    rerender();
  };
  const btn = el('button', { type: 'button', class: 'link-btn', text: goal ? 'Ziel ändern' : 'Jahresziel festlegen ›', onclick: setGoal });
  if (!goal) {
    return el('section', { class: 'stat-block goal' }, el('div', { class: 'goal-row' },
      el('h3', { text: `Jahresziel ${year}` }), btn), el('p', { class: 'status', text: `${plural(done, 'Buch', 'Bücher')} ${year} gelesen.` }));
  }
  const pct = Math.min(100, Math.round((done / goal) * 100));
  return el('section', { class: 'stat-block goal' },
    el('div', { class: 'goal-row' }, el('h3', { text: `Jahresziel ${year}` }), btn),
    el('p', { text: `${fmt.format(done)} von ${fmt.format(goal)} ${goal === 1 ? 'Buch' : 'Büchern'}${done >= goal ? ' – geschafft! 🎉' : ''}` }),
    el('div', { class: 'bar' }, el('span', { class: 'bar-fill', style: `width:${Math.max(2, pct)}%` })));
}

/**
 * Seitenzahlen nachladen: Einträge aus dem Katalog kennen ihre Ausgaben (und damit Seitenzahlen) erst, wenn man
 * „Ausgaben“ aufklappt. Für gelesene Bücher ohne Seitenzahl holt die Statistik sie im Hintergrund von der DNB
 * (höchstens 10 je Öffnen, jedes Buch einmal pro Sitzung) und speichert sie im Eintrag (Prüfrunde 09.11.2026).
 */
const pagesTried = new Set();
async function fillPages(read, container) {
  const todo = read.filter((e) => !pagesTried.has(e.key) && !pagesOf(e) && (e.isbns || []).length).slice(0, 10);
  if (!todo.length) return;
  todo.forEach((e) => pagesTried.add(e.key));
  let changed = false;
  for (const e of todo) {
    try {
      const list = await catalog.editionDetails(e.isbns.slice(0, 10));
      if (list.some((ed) => ed.pages)) {
        await store.put({ ...library.byKey.get(e.key), editions: list });
        changed = true;
      }
    } catch { /* ohne Netz: beim nächsten Mal */ }
  }
  if (!changed) return;
  await loadLibrary();
  if (container.isConnected && !container.closest('[hidden]')) renderStats(container);
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

  const abandoned = all.filter((e) => e.abandoned);
  const tile = (n, label) => el('div', { class: 'tile' }, el('strong', { text: n }), el('span', { text: label }));
  container.replaceChildren(
    goalBlock(read, () => renderStats(container)),
    el('div', { class: 'tiles' },
      tile(fmt.format(owned.length), 'im Besitz'),
      tile(fmt.format(read.length), 'gelesen'),
      tile(fmt.format(unreadOwned.filter((e) => !e.abandoned).length), 'ungelesen im Regal'),
      tile(fmt.format(wish.length), 'auf der Merkliste'),
      tile(pages.length ? fmt.format(pages.reduce((a, b) => a + b, 0)) : '–', 'Seiten gelesen'),
      tile(avg ? avg.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' ★' : '–', 'Ø Bewertung'),
      tile(pages.length ? fmt.format(Math.round(pages.reduce((a, b) => a + b, 0) / pages.length)) : '–', 'Ø Seiten je Buch'),
      tile(fmt.format(abandoned.length), 'abgebrochen'),
    ),
  );

  const perYear = topCounts(read.map((e) => e.readAt?.slice(0, 4)), 50).sort((a, b) => b[0].localeCompare(a[0]));
  // Seiten pro Jahr (nur Bücher mit Lesedatum und bekannter Seitenzahl)
  const pagesYear = new Map();
  for (const e of read) {
    const y = e.readAt?.slice(0, 4);
    const p = pagesOf(e);
    if (y && p) pagesYear.set(y, (pagesYear.get(y) || 0) + p);
  }
  // Gelesen pro Monat im laufenden Jahr
  const year = String(new Date().getFullYear());
  const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const perMonth = MONTHS.map((m, i) => [m, read.filter((e) => e.readAt?.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`)).length])
    .slice(0, new Date().getMonth() + 1);
  // Längstes und kürzestes gelesenes Buch
  const withPages = read.map((e) => [e, pagesOf(e)]).filter(([, p]) => p).sort((a, b) => b[1] - a[1]);
  const extremes = withPages.length >= 2 ? el('section', { class: 'stat-block' },
    el('h3', { text: 'Dickstes und dünnstes gelesenes Buch' }),
    el('p', { text: `${withPages[0][0].title} – ${fmt.format(withPages[0][1])} Seiten` }),
    el('p', { text: `${withPages.at(-1)[0].title} – ${fmt.format(withPages.at(-1)[1])} Seiten` })) : null;
  // Lieblingsautoren nach Bewertung (mind. 2 bewertete Bücher)
  const byAuthor = new Map();
  for (const e of rated) {
    const a = (e.authors || [])[0];
    if (!a) continue;
    const v = byAuthor.get(a) || [];
    byAuthor.set(a, [...v, e.rating]);
  }
  const favAuthors = [...byAuthor].filter(([, r]) => r.length >= 2)
    .map(([a, r]) => [a, Math.round((r.reduce((s, x) => s + x, 0) / r.length) * 10) / 10])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, 6);
  const blocks = [
    bars(`Gelesen pro Monat (${year})`, perMonth.some((r) => r[1]) ? perMonth : []),
    bars('Gelesen pro Jahr', perYear),
    bars('Seiten pro Jahr', [...pagesYear].sort((a, b) => b[0].localeCompare(a[0]))),
    bars('Genres (gelesen)', topCounts(read.map((e) => e.genre))),
    bars('Lieblingsautoren (Ø Bewertung, ab 2 Büchern)', favAuthors, ' ★'),
    extremes,
    bars('Häufigste Genres (im Besitz)', topCounts(owned.map((e) => e.genre))),
    bars('Häufigste Autorinnen und Autoren (im Besitz)', topCounts(owned.map((e) => (e.authors || [])[0]))),
    bars('Bewertungen', [5, 4, 3, 2, 1].map((n) => [`${'★'.repeat(n)}`, rated.filter((e) => e.rating === n).length]).filter((r) => r[1])),
  ].filter(Boolean);
  container.append(...blocks);
  if (!all.length) container.append(emptyState({ icon: '📊', title: 'Noch keine Statistik', text: 'Markiere ein paar Bücher als „Besitze“ oder „Gelesen“ – dann füllt sich diese Seite.' }));
  if (read.length && !perYear.length) container.append(el('p', { class: 'status', text: 'Tipp: Unter „Details“ kannst du eintragen, wann du ein Buch gelesen hast.' }));
  fillPages(read, container);
}
