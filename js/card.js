// Darstellung eines Buchs (Suche, Meine Bücher, Reihen) inkl. Detailbereich.
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

function setCover(card, urls, title) {
  const img = card.querySelector('.cover img');
  const ph = card.querySelector('.cover .ph');
  ph.textContent = (title || '?').replace(/^(der|die|das|ein|eine)\s+/i, '').charAt(0).toUpperCase();
  let n = 0;
  let timer = null;
  // Hängt eine Quelle (z. B. Open Library unter Last), nach ein paar Sekunden die nächste versuchen.
  const arm = () => { clearTimeout(timer); timer = setTimeout(next, CONFIG.covers.timeoutMs); };
  function next() {
    clearTimeout(timer);
    if (n >= urls.length) { img.classList.remove('loaded'); img.removeAttribute('src'); ph.hidden = false; return; }
    img.src = urls[n++];
    // Lazy-Bilder außerhalb des Bildschirms laden noch gar nicht – die Zeit läuft erst, wenn sie sichtbar werden.
    if (visible) arm();
  }
  let visible = false;
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) { visible = true; if (!img.complete) arm(); obs.disconnect(); }
  }, { rootMargin: '200px' }).observe(card);
  img.onload = () => {
    clearTimeout(timer);
    if (CONFIG.covers.isPlaceholder(img)) next();
    else { img.classList.add('loaded'); ph.hidden = true; }
  };
  img.onerror = () => next();
  next();
}

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

function metaHtml(work, entry) {
  const parts = [];
  if (work.year) parts.push(String(work.year));
  if (work.genre) parts.push(`<span class="genre">${escapeHtml(work.genre)}</span>`);
  if (work.series) parts.push(escapeHtml(work.volume ? `${work.series}, Band ${work.volume}` : work.series));
  let html = parts.join(' · ');
  const extra = [];
  if (entry?.rating) extra.push(`<span class="stars" aria-label="${entry.rating} von 5 Sternen">${stars(entry.rating)}</span>`);
  for (const t of entry?.tags || []) extra.push(`<span class="tag">${escapeHtml(t)}</span>`);
  if (entry?.notes?.trim()) extra.push('<span class="note-flag" title="Notiz vorhanden">✎ Notiz</span>');
  if (extra.length) html += `<span class="extras">${extra.join('')}</span>`;
  return html;
}

/**
 * Baut die Karte eines Buchs. work kann ein Werk aus der Suche oder ein eigener Eintrag sein.
 * opts.compact: kleinere Darstellung (Reihen-Ansicht), opts.onChange: nach jeder Änderung.
 */
export function bookCard(work, opts = {}) {
  const card = $('#bookTpl').content.firstElementChild.cloneNode(true);
  if (opts.compact) card.classList.add('compact');
  let entry = entryFor(work);
  const showSub = work.subtitle && work.subtitle.length < 60 && !GENERIC_SUBTITLE.test(work.subtitle);
  card.querySelector('.title').textContent = (opts.prefix || '') + work.title + (showSub ? ` – ${work.subtitle}` : '');
  card.querySelector('.author').textContent = (work.authors || []).join(', ') || 'Unbekannter Autor';
  const meta = card.querySelector('.meta');
  const mine = ownedIsbnsOf(entry);
  setCover(card, coverUrls(mine, work.coverIds, work.coverIsbns || []), work.title);

  const own = card.querySelector('.toggle.own');
  const read = card.querySelector('.toggle.read');
  const wish = card.querySelector('.toggle.wish');
  let details = null;

  const paint = (e) => {
    entry = e;
    const isbns = ownedIsbnsOf(e);
    own.setAttribute('aria-pressed', String(!!e?.owned));
    read.setAttribute('aria-pressed', String(!!e?.read));
    wish.setAttribute('aria-pressed', String(!!e?.wish));
    card.classList.toggle('owned', !!e?.owned);
    card.classList.toggle('not-owned', !e?.owned);
    card.classList.toggle('wished', !!e?.wish && !e?.owned);
    meta.innerHTML = metaHtml(work, e);
    card.querySelectorAll('.editions input').forEach((c) => { c.checked = !!e?.owned && isbns.includes(c.value); });
    details?.refresh(e);
  };
  const change = async (fn) => { paint(await updateEntry(work, fn)); opts.onChange?.(); };

  own.addEventListener('click', () => change((x) => {
    x.owned = !x.owned;
    if (x.owned) {
      x.wish = false; // gekauft → von der Merkliste nehmen
      const all = work.editions?.length ? work.editions.map((e) => e.isbn) : work.isbns || [];
      if (!x.ownedIsbns.length && all.length === 1) x.ownedIsbns = [all[0]];
    } else x.ownedIsbns = [];
  }));
  read.addEventListener('click', () => change((x) => {
    x.read = !x.read;
    if (x.read && !x.readAt) x.readAt = today();
    if (!x.read) x.readAt = null;
  }));
  wish.addEventListener('click', () => change((x) => { x.wish = !x.wish; }));

  // Ausgaben – von der DNB schon vorhanden, aus der Datenbank nur als ISBNs (Details werden nachgeladen)
  let editions = (work.editions || []).filter((ed) => ed.isbn);
  const isbnCount = editions.length || (work.isbns || []).length;
  const edBtn = card.querySelector('.editions-btn');
  const edList = card.querySelector('.editions');
  if (isbnCount) {
    edBtn.hidden = false;
    edBtn.textContent = isbnCount === 1 ? 'Ausgabe' : `${isbnCount} Ausgaben`;
    edBtn.addEventListener('click', async () => {
      const open = edList.hidden;
      if (open && !editions.length) {
        edList.replaceChildren(el('li', { text: 'Lade Ausgaben …' }));
        edList.hidden = false;
        try {
          editions = await catalog.editionDetails(work.isbns);
        } catch {
          editions = work.isbns.map((isbn) => ({ isbn }));
        }
        renderEditions();
        paint(entry);
      }
      edList.hidden = !open;
      edBtn.setAttribute('aria-expanded', String(open));
    });
    if (editions.length) renderEditions();
  }

  function renderEditions() {
    edList.replaceChildren();
    for (const ed of editions) {
      // Mehrere Ausgaben desselben Buchs können gleichzeitig „besessen“ sein.
      const box = el('input', { type: 'checkbox', value: ed.isbn, title: 'Diese Ausgabe besitze ich' });
      box.addEventListener('change', () => {
        const checked = box.checked;
        change((x) => {
          const set = new Set(x.ownedIsbns);
          if (checked) set.add(ed.isbn); else set.delete(ed.isbn);
          x.ownedIsbns = [...set];
          if (checked) { x.owned = true; x.wish = false; }
        });
      });
      const text = el('span');
      text.innerHTML = [ed.binding, ed.publisher, ed.year, ed.pages].filter(Boolean).map(escapeHtml).join(' · ')
        + ` <span class="isbn">${formatIsbn(ed.isbn)}</span>`;
      edList.append(el('li', {}, el('label', {}, box, text)));
    }
  }

  // Details: Bewertung, Lesedatum, Regale, Notiz
  const detBtn = card.querySelector('.details-btn');
  const detBox = card.querySelector('.details');
  detBtn.addEventListener('click', () => {
    if (!details) details = buildDetails(detBox, () => entry, change);
    const open = detBox.hidden;
    detBox.hidden = !open;
    detBtn.setAttribute('aria-expanded', String(open));
  });

  paint(entry);
  return card;
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
