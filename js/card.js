// Darstellung eines Buchs (Suche, Meine Bücher, Reihen), Detailblatt und Gesten im Cover-Raster.
import { CONFIG } from './config.js';
import { catalog } from './catalog.js';
import { entryFor, updateEntry, allTags } from './library.js';
import { ownedIsbnsOf } from './store.js';
import { formatIsbn } from './isbn.js';
import { $, el, escapeHtml, today } from './util.js';

// Untertitel wie „Roman“ oder „Thriller“ sind nur Gattungsangaben – die stehen schon beim Genre.
const GENERIC_SUBTITLE = /^(ein(e|en)?\s+)?([\wäöüß-]+\s+)?[\wäöüß-]*(roman|thriller|krimi|kriminalroman|erzählung|erzählungen|novelle|geschichten|gedichte)(\s.*)?$/i;

/** Reihenfolge: Cover der eigenen Ausgabe(n), dann Cover-IDs aus der Datenbank, dann die übrigen ISBNs. */
function coverUrls(ownIsbns, coverIds, otherIsbns) {
  const byIsbn = (i) => CONFIG.covers.sources.map((src) => src(i));
  const others = otherIsbns.filter((i) => !ownIsbns.includes(i)).slice(0, CONFIG.covers.maxIsbns);
  return [
    ...ownIsbns.slice(0, 2).flatMap(byIsbn),
    ...(coverIds || []).map(CONFIG.covers.byId),
    ...others.flatMap(byIsbn),
    ...[...ownIsbns.slice(0, 1), ...others.slice(0, 1)].map(CONFIG.covers.lastResort),
  ];
}

/** Lädt das Cover in ein Element mit .cover > img + .ph (Platzhalter-Buchstabe). */
function setCover(root, urls, title) {
  const img = root.querySelector('.cover img');
  const ph = root.querySelector('.cover .ph');
  ph.textContent = (title || '?').replace(/^(der|die|das|ein|eine)\s+/i, '').charAt(0).toUpperCase();
  let n = 0;
  let timer = null;
  let visible = false;
  // Hängt eine Quelle (z. B. Open Library unter Last), nach ein paar Sekunden die nächste versuchen.
  const arm = () => { clearTimeout(timer); timer = setTimeout(next, CONFIG.covers.timeoutMs); };
  function next() {
    clearTimeout(timer);
    if (n >= urls.length) { img.classList.remove('loaded'); img.removeAttribute('src'); ph.hidden = false; return; }
    img.src = urls[n++];
    // Lazy-Bilder außerhalb des Bildschirms laden noch gar nicht – die Zeit läuft erst, wenn sie sichtbar werden.
    if (visible) arm();
  }
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) { visible = true; if (!img.complete) arm(); obs.disconnect(); }
  }, { rootMargin: '200px' }).observe(root);
  img.onload = () => {
    clearTimeout(timer);
    if (CONFIG.covers.isPlaceholder(img)) next();
    else { img.classList.add('loaded'); ph.hidden = true; }
  };
  img.onerror = () => next();
  next();
}

/** „Erzählende Literatur: Gegenwartsliteratur ab 1945“ → „Gegenwartsliteratur ab 1945“ */
export function shortGenre(g = '') {
  const part = g.includes(':') ? g.split(':').pop().trim() : g;
  return part.length > 32 ? `${part.slice(0, 30).trim()}…` : part;
}

/** Eine Zeile unter dem Autor: Reihe Band · Jahr · Genre (kurz) · ★ · ✎ – wird bei Platzmangel abgeschnitten. */
function metaLine(work, entry) {
  const parts = [];
  // Nur „Band 2“ statt „Eragon 2“ – lange Reihennamen würden die Zeile sprengen (voller Name im Detailblatt)
  if (work.series) parts.push(work.volume ? `Band ${work.volume}` : work.series);
  if (work.year) parts.push(String(work.year));
  if (work.genre) parts.push(shortGenre(work.genre));
  if (entry?.rating) parts.push(`★${entry.rating}`);
  if (entry?.notes?.trim()) parts.push('✎');
  return parts.join(' · ');
}

/** Titel inkl. kurzem Untertitel (bis zum ersten „;“, ohne bloße Gattungsangaben wie „Roman“). */
export function fullTitle(work) {
  const sub = (work.subtitle || '').split(/\s+;\s+/)[0];
  const showSub = sub && sub.length < 60 && !GENERIC_SUBTITLE.test(sub);
  return work.title + (showSub ? ` – ${sub}` : '');
}

/** Gemeinsame Logik für „Besitze ich“, „Gelesen“, „Merken“ – genutzt von Karte, Detailblatt und Wischgesten. */
export const actions = {
  own: (work) => (x) => {
    x.owned = !x.owned;
    if (x.owned) {
      x.wish = false; // gekauft → von der Merkliste nehmen
      const all = work.editions?.length ? work.editions.map((e) => e.isbn) : work.isbns || [];
      if (!x.ownedIsbns.length && all.length === 1) x.ownedIsbns = [all[0]];
    } else x.ownedIsbns = [];
  },
  read: () => (x) => {
    x.read = !x.read;
    if (x.read && !x.readAt) x.readAt = today();
    if (!x.read) x.readAt = null;
  },
  wish: () => (x) => { x.wish = !x.wish; },
};

/** Setzt die drei Knöpfe auf den aktuellen Stand. */
function paintToggles(root, e) {
  root.querySelector('.toggle.own')?.setAttribute('aria-pressed', String(!!e?.owned));
  root.querySelector('.toggle.read')?.setAttribute('aria-pressed', String(!!e?.read));
  root.querySelector('.toggle.wish')?.setAttribute('aria-pressed', String(!!e?.wish));
}

/**
 * Baut die Karte eines Buchs. work kann ein Werk aus der Suche oder ein eigener Eintrag sein.
 * Aufbau (Variante B): Cover | Titel (max. 2 Zeilen), Autor, eine Infozeile – darunter eine feste Leiste
 * „○ Besitze · □ Gelesen · ♡ Merken · ⋯“. „⋯“ öffnet das Detailblatt (Ausgaben, Bewertung, Notiz …).
 * opts.compact: kleinere Darstellung (Reihen-Ansicht), opts.prefix: z. B. „2. “, opts.onChange: nach jeder Änderung.
 */
export function bookCard(work, opts = {}) {
  const card = $('#bookTpl').content.firstElementChild.cloneNode(true);
  if (opts.compact) card.classList.add('compact');
  let entry = entryFor(work);
  card.querySelector('.title').textContent = (opts.prefix || '') + fullTitle(work);
  card.querySelector('.author').textContent = (work.authors || []).join(', ') || 'Unbekannter Autor';
  const meta = card.querySelector('.meta');
  setCover(card, coverUrls(ownedIsbnsOf(entry), work.coverIds, work.coverIsbns || []), work.title);

  const paint = (e) => {
    entry = e;
    paintToggles(card, e);
    card.classList.toggle('owned', !!e?.owned);
    card.classList.toggle('not-owned', !e?.owned);
    card.classList.toggle('wished', !!e?.wish && !e?.owned);
    meta.textContent = metaLine(work, e);
  };
  const ctx = {
    work,
    getEntry: () => entry,
    // Änderung speichern, Karte (und ein offenes Detailblatt) neu zeichnen
    async change(fn) {
      const e = await updateEntry(work, fn);
      paint(e);
      ctx.onChange?.(e);
      opts.onChange?.();
      return e;
    },
    onChange: null, // setzt das Detailblatt, solange es offen ist
  };

  card.querySelector('.toggle.own').addEventListener('click', () => ctx.change(actions.own(work)));
  card.querySelector('.toggle.read').addEventListener('click', () => ctx.change(actions.read()));
  card.querySelector('.toggle.wish').addEventListener('click', () => ctx.change(actions.wish()));
  card.querySelector('.more-btn').addEventListener('click', () => openSheet(ctx));
  attachGridGestures(card, ctx);

  paint(entry);
  return card;
}

// ---------- Cover-Raster: Tippen, Doppeltippen, Wischen ----------
const SWIPE = 70;    // Pixel, ab denen ein Wisch zählt
const DOUBLE = 280;  // Millisekunden für einen Doppeltipp

function attachGridGestures(card, ctx) {
  const cover = card.querySelector('.cover');
  let start = null;
  let tapTimer = null;
  let lastTap = 0;
  const isGrid = () => document.body.classList.contains('grid-view');

  const peek = () => {
    const open = cover.querySelector('.peek');
    if (open) { open.remove(); return; }
    cover.append(el('div', { class: 'peek' },
      el('strong', { text: card.querySelector('.title').textContent }),
      el('span', { text: card.querySelector('.author').textContent })));
  };

  cover.addEventListener('pointerdown', (ev) => {
    if (!isGrid()) return;
    start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, swiping: false };
  });
  cover.addEventListener('pointermove', (ev) => {
    if (!start || ev.pointerId !== start.id) return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    if (!start.swiping && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      start.swiping = true;
      cover.setPointerCapture?.(ev.pointerId);
    }
    if (start.swiping) {
      cover.style.transform = `translateX(${Math.max(-90, Math.min(90, dx))}px) rotate(${dx / 30}deg)`;
      cover.dataset.swipe = dx > SWIPE ? 'own' : dx < -SWIPE ? 'wish' : '';
    }
  });
  const end = async (ev) => {
    if (!start || ev.pointerId !== start.id) return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    const swiping = start.swiping;
    start = null;
    cover.style.transform = '';
    delete cover.dataset.swipe;
    if (swiping) {
      if (Math.abs(dx) < SWIPE || ev.type === 'pointercancel') return;
      const kind = dx > 0 ? 'own' : 'wish';
      const before = snapshot(ctx.getEntry());
      const e = await ctx.change(actions[kind](ctx.work));
      const on = kind === 'own' ? e?.owned : e?.wish;
      const label = kind === 'own'
        ? (on ? 'Als „besitze ich“ markiert' : '„Besitze ich“ entfernt')
        : (on ? 'Gemerkt' : 'Von der Merkliste entfernt');
      toast(label, () => ctx.change((x) => Object.assign(x, before)));
      return;
    }
    if (ev.type === 'pointercancel' || Math.abs(dx) > 10 || Math.abs(dy) > 10) return; // war Scrollen
    // Tippen: einfach = Titel einblenden, doppelt = Detailblatt
    const now = Date.now();
    if (now - lastTap < DOUBLE) {
      clearTimeout(tapTimer);
      lastTap = 0;
      cover.querySelector('.peek')?.remove();
      openSheet(ctx);
    } else {
      lastTap = now;
      tapTimer = setTimeout(peek, DOUBLE);
    }
  };
  cover.addEventListener('pointerup', end);
  cover.addEventListener('pointercancel', end);
}

/** Merkt sich den Stand vor einer Wischgeste – für „Rückgängig“. */
function snapshot(e) {
  return {
    owned: !!e?.owned, ownedIsbns: [...(e?.ownedIsbns || [])], wish: !!e?.wish, read: !!e?.read, readAt: e?.readAt ?? null,
  };
}

let toastTimer;
/** Kurze Meldung unten mit optionalem „Rückgängig“. */
export function toast(message, undo) {
  const box = $('#toast');
  clearTimeout(toastTimer);
  box.replaceChildren(el('span', { text: message }), undo ? el('button', {
    type: 'button', text: 'Rückgängig',
    onclick: () => { box.hidden = true; undo(); },
  }) : null);
  box.hidden = false;
  toastTimer = setTimeout(() => { box.hidden = true; }, 4000);
}

// ---------- Detailblatt („⋯“ bzw. Doppeltippen im Raster) ----------
function openSheet(ctx) {
  const { work } = ctx;
  const sheet = $('#sheet');
  const body = sheet.querySelector('.sheet-body');
  let entry = ctx.getEntry();

  // Kopf: Cover, voller Titel, Autor, alle Angaben
  const facts = [
    work.series ? `Reihe: ${work.series}${work.volume ? `, Band ${work.volume}` : ''}` : null,
    work.year ? `Erschienen: ${work.year}` : null,
    work.genre ? `Genre: ${work.genre}` : null,
  ].filter(Boolean);
  const head = el('div', { class: 'sheet-head' },
    el('div', { class: 'cover' }, el('span', { class: 'ph' }), el('img', { alt: '', decoding: 'async' })),
    el('div', {},
      el('h2', { class: 'sheet-title', text: fullTitle(work) }),
      el('p', { class: 'author', text: (work.authors || []).join(', ') || 'Unbekannter Autor' }),
      el('ul', { class: 'sheet-facts' }, ...facts.map((t) => el('li', { text: t })))));
  setCover(head, coverUrls(ownedIsbnsOf(entry), work.coverIds, work.coverIsbns || []), work.title);

  // Dieselben drei Knöpfe, ausgeschrieben
  const toggle = (cls, label, fn) => {
    const b = el('button', { class: `toggle ${cls}`, type: 'button', 'aria-pressed': 'false' }, el('span', { class: 'lbl', text: label }));
    b.addEventListener('click', () => ctx.change(fn));
    return b;
  };
  const bar = el('div', { class: 'actions sheet-actions' },
    toggle('own', 'Besitze ich', actions.own(work)), toggle('read', 'Gelesen', actions.read()), toggle('wish', 'Merken', actions.wish()));

  // Ausgaben: Häkchen für jede Ausgabe, die ich besitze (Details werden bei Bedarf von der DNB geladen)
  let editions = (work.editions || []).filter((ed) => ed.isbn);
  const isbnCount = editions.length || (work.isbns || []).length;
  const edList = el('ul', { class: 'editions' });
  const edSection = el('section', { class: 'sheet-section' },
    el('h3', { text: isbnCount === 1 ? 'Ausgabe' : `${isbnCount} Ausgaben – welche besitzt du?` }), edList);
  const renderEditions = () => {
    const mine = ownedIsbnsOf(entry);
    edList.replaceChildren(...editions.map((ed) => {
      const box = el('input', { type: 'checkbox', value: ed.isbn });
      box.checked = !!entry?.owned && mine.includes(ed.isbn);
      box.addEventListener('change', () => {
        const checked = box.checked;
        ctx.change((x) => {
          const set = new Set(x.ownedIsbns);
          if (checked) set.add(ed.isbn); else set.delete(ed.isbn);
          x.ownedIsbns = [...set];
          if (checked) { x.owned = true; x.wish = false; }
        });
      });
      const text = el('span');
      text.innerHTML = ([ed.binding, ed.publisher, ed.year, ed.pages].filter(Boolean).map(escapeHtml).join(' · ') || 'Ausgabe')
        + ` <span class="isbn">${formatIsbn(ed.isbn)}</span>`;
      return el('li', {}, el('label', {}, box, text));
    }));
  };
  if (isbnCount && !editions.length) {
    edList.replaceChildren(el('li', { text: 'Lade Ausgaben …' }));
    catalog.editionDetails(work.isbns)
      .catch(() => work.isbns.map((isbn) => ({ isbn })))
      .then((list) => { editions = list; renderEditions(); });
  } else renderEditions();

  // Bewertung, Lesedatum, Regale, Notiz
  const detBox = el('section', { class: 'sheet-section details' }, el('h3', { text: 'Meine Angaben' }));
  const details = buildDetails(detBox, () => entry, ctx.change);

  body.replaceChildren(...[head, bar, isbnCount ? edSection : null, detBox].filter(Boolean));
  const refresh = (e) => {
    entry = e;
    paintToggles(bar, e);
    if (editions.length) renderEditions();
    details.refresh(e);
  };
  refresh(entry);
  ctx.onChange = refresh;

  const close = () => {
    sheet.hidden = true;
    ctx.onChange = null;
    document.body.classList.remove('sheet-open');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  sheet.querySelector('.sheet-backdrop').onclick = close;
  sheet.querySelector('.sheet-close').onclick = close;
  document.addEventListener('keydown', onKey);
  document.body.classList.add('sheet-open');
  sheet.hidden = false;
  body.scrollTop = 0;
}

function buildDetails(box, getEntry, change) {
  // Bewertung
  const starBtns = [1, 2, 3, 4, 5].map((n) => el('button', {
    type: 'button', class: 'star', 'aria-label': `${n} von 5 Sternen`, text: '☆',
    onclick: () => change((x) => { x.rating = x.rating === n ? null : n; }),
  }));
  // Lesedatum – ein Datum setzt automatisch „Gelesen“
  const date = el('input', { type: 'date', max: today() });
  date.addEventListener('change', () => change((x) => {
    x.readAt = date.value || null;
    if (date.value) x.read = true;
  }));
  // Regale
  const tagList = el('span', { class: 'tag-list' });
  const listId = `tags-${Math.random().toString(36).slice(2)}`;
  const datalist = el('datalist', { id: listId });
  const tagInput = el('input', { type: 'text', placeholder: 'Regal hinzufügen …', list: listId, enterkeyhint: 'done' });
  const addTag = () => {
    const t = tagInput.value.trim().replace(/,$/, '');
    if (!t) return;
    tagInput.value = '';
    change((x) => { if (!x.tags.includes(t)) x.tags = [...x.tags, t]; });
  };
  tagInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); addTag(); } });
  tagInput.addEventListener('change', addTag);
  // Notiz – speichert kurz nach dem Tippen
  const notes = el('textarea', { rows: '3', placeholder: 'Eigene Notiz …' });
  let timer;
  notes.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => change((x) => { x.notes = notes.value; }), 600);
  });

  box.append(
    el('div', { class: 'row' }, el('span', { class: 'lbl', text: 'Bewertung' }), el('span', { class: 'stars-input' }, ...starBtns)),
    el('label', { class: 'row' }, el('span', { class: 'lbl', text: 'Gelesen am' }), date),
    el('div', { class: 'row' }, el('span', { class: 'lbl', text: 'Regale' }), el('span', { class: 'tags-edit' }, tagList, tagInput, datalist)),
    el('label', { class: 'row col' }, el('span', { class: 'lbl', text: 'Notiz' }), notes),
  );

  const refresh = (e) => {
    starBtns.forEach((b, i) => {
      const on = (e?.rating || 0) > i;
      b.textContent = on ? '★' : '☆';
      b.classList.toggle('on', on);
    });
    date.value = e?.readAt || '';
    tagList.replaceChildren(...(e?.tags || []).map((t) => el('span', { class: 'tag' }, t, el('button', {
      type: 'button', class: 'tag-x', 'aria-label': `Regal ${t} entfernen`, text: '×',
      onclick: () => change((x) => { x.tags = x.tags.filter((y) => y !== t); }),
    }))));
    datalist.replaceChildren(...allTags().map((t) => el('option', { value: t })));
    if (document.activeElement !== notes) notes.value = e?.notes || '';
  };
  refresh(getEntry());
  return { refresh };
}
