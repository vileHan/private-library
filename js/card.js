// Darstellung eines Buchs (Suche, Meine Bücher, Reihen), Detailblatt und Gesten im Cover-Raster.
import { CONFIG } from './config.js';
import { catalog } from './catalog.js';
import { entryFor, updateEntry, allTags } from './library.js';
import { ownedIsbnsOf } from './store.js';
import { formatIsbn } from './isbn.js';
import { $, el, escapeHtml, today, haptic, pop, switchToggle, wireToggle, onTap } from './util.js';
import { genreGroup } from './genres.js';

// Untertitel wie „Roman“ oder „Thriller“ sind nur Gattungsangaben – die stehen schon beim Genre.
const GENERIC_SUBTITLE = /^(ein(e|en)?\s+)?([\wäöüß-]+\s+)?[\wäöüß-]*(roman|thriller|krimi|kriminalroman|erzählung|erzählungen|novelle|geschichten|gedichte)(\s.*)?$/i;

/** Reihenfolge: Cover der eigenen Ausgabe(n), dann Cover-IDs aus der Datenbank, dann die übrigen ISBNs. */
/**
 * Reihenfolge der Cover-Quellen: eigene Ausgabe (Amazon, Google) → Open-Library-Cover-IDs → weitere Ausgaben (Amazon, Google) →
 * nur außerhalb des Katalogs: Open Library per ISBN. Für Katalog-Werke kennt die Datenbank alle Open-Library-Cover
 * schon (Workflow „Cover-IDs“) – die langsame Open-Library-ISBN-Abfrage (max. 100 pro 5 min) wäre dort überflüssig.
 * DNB-Cover bewusst NICHT (Bot-Prüfung von portal.dnb.de wird nicht umgangen, auch nicht über einen Server).
 */
function coverUrls(ownIsbns, coverIds, otherIsbns, fromDb = false) {
  const byIsbn = (i) => CONFIG.covers.sources.map((src) => src(i)).filter(Boolean);
  const others = otherIsbns.filter((i) => !ownIsbns.includes(i)).slice(0, CONFIG.covers.maxIsbns);
  const first = [...ownIsbns.slice(0, 1), ...others.slice(0, 1)];
  return [
    ...ownIsbns.slice(0, 2).flatMap(byIsbn),
    ...(coverIds || []).map(CONFIG.covers.byId),
    ...others.flatMap(byIsbn),
    ...(fromDb ? [] : first.map(CONFIG.covers.lastResort)),
  ];
}

/**
 * Größere Fassung derselben Cover-Adresse – für das Vollbild.
 * Amazon: _SY360_ → _SY900_ (liefert die Originalgröße, meist ~500 px hoch), Open Library: -M → -L. Google bleibt.
 */
export function hiResCover(url = '') {
  return url.replace('_SY360_', '_SY900_').replace(/(covers\.openlibrary\.org\/b\/(?:id|isbn)\/[^/]+)-M\.jpg/, '$1-L.jpg');
}

/**
 * Vollbild eines Covers (Liste und Detailblatt: Cover antippen). Zeigt sofort das schon geladene Bild und tauscht es
 * gegen die größere Fassung, sobald die da ist. Egal was als Nächstes kommt – Tippen, Wischen, Mausrad, eine Taste –
 * das Vollbild verschwindet sofort (Wunsch des Nutzers 09.11.2026). Die Fläche bleibt aber bis kurz nach dem Loslassen
 * liegen (unsichtbar), damit der schließende Tipp nicht auf einem Knopf darunter landet.
 */
function openCoverZoom(src, title) {
  const img = el('img', { src, alt: `Cover: ${title}`, decoding: 'async' });
  const box = el('div', { class: 'cover-zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Cover: ${title}` }, img);
  let closed = false;
  const remove = (ms) => setTimeout(() => box.remove(), ms);
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    box.classList.add('closing');
    remove(3000); // spätestens dann weg, falls das Loslassen nicht gemeldet wird
  };
  const onKey = (ev) => { ev.stopPropagation(); close(); remove(150); }; // nur das Vollbild schließen, nicht auch das Detailblatt
  box.addEventListener('pointerdown', close);
  box.addEventListener('touchstart', close, { passive: true });
  box.addEventListener('wheel', () => { close(); remove(150); }, { passive: true });
  for (const type of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) {
    box.addEventListener(type, () => { if (closed) remove(350); });
  }
  // Nach einem Fingertipp schickt der Browser noch einen „Geisterklick“ hinterher – der landet schon auf dem Vollbild
  // und darf es nicht gleich wieder schließen (Prüfrunde 09.11.2026). Klicks in den ersten 500 ms nur schlucken.
  const openedAt = performance.now();
  box.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (performance.now() - openedAt < 500 && !closed) return;
    close(); remove(150);
  });
  const big = hiResCover(src);
  if (big !== src) {
    const pre = new Image();
    pre.onload = () => { if (pre.naturalWidth > 10 && !closed) img.src = big; };
    pre.src = big;
  }
  document.addEventListener('keydown', onKey, true);
  document.body.append(box);
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
  setCover(card, coverUrls(ownedIsbnsOf(entry), work.coverIds, work.coverIsbns || [], !!(work.fromDb || entry?.fromDb)), work.title);

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

  // „toggle“ kommt nur bei einem echten Tipp, nie beim Wischen (switchToggle in util.js); der Schalter darin sorgt am iPhone für Haptik
  const onToggle = (cls, fn) => wireToggle(card.querySelector(`.toggle.${cls}`)).addEventListener('toggle', () => { haptic(); ctx.change(fn()); });
  onToggle('own', () => actions.own(work));
  onToggle('read', () => actions.read());
  onToggle('wish', () => actions.wish());
  card.querySelector('.more-btn').addEventListener('click', () => openSheet(ctx));
  attachGridGestures(card, ctx);
  // Liste: Cover antippen → Vollbild (nur bei echtem Tipp, nie beim Scrollen; im Raster hat der Tipp eine andere Bedeutung)
  const listCover = card.querySelector('.cover');
  onTap(listCover, () => {
    if (document.body.classList.contains('grid-view')) return;
    const img = listCover.querySelector('img.loaded');
    if (img) openCoverZoom(img.src, fullTitle(work));
  });

  paint(entry);
  return card;
}

// ---------- Cover-Raster: Gesten ----------
// einmal tippen = Titel einblenden (mit „Details ›“), doppelt tippen = Besitze ich,
// nach rechts wischen = Merken, nach links wischen = Gelesen, gedrückt halten = Detailblatt.
// Jede Änderung per Geste zeigt kurz „Rückgängig“.
const SWIPE = 70;    // Pixel, ab denen ein Wisch zählt
const DOUBLE = 280;  // Millisekunden für einen Doppeltipp
const HOLD = 500;    // Millisekunden für „gedrückt halten“

function attachGridGestures(card, ctx) {
  const cover = card.querySelector('.cover');
  let start = null;
  let tapTimer = null;
  let holdTimer = null;
  let lastTap = 0;
  const isGrid = () => document.body.classList.contains('grid-view');

  const apply = async (kind) => {
    haptic(); // Android vibriert; am iPhone gibt es für Gesten keine Haptik – dafür hüpft das Cover sichtbar
    pop(cover);
    const before = snapshot(ctx.getEntry());
    await ctx.change(actions[kind](ctx.work));
    toast(() => ctx.change((x) => Object.assign(x, before)));
  };
  const details = () => { cover.querySelector('.peek')?.remove(); openSheet(ctx); };

  const peek = () => {
    const open = cover.querySelector('.peek');
    if (open) { open.remove(); return; }
    const btn = el('button', { type: 'button', class: 'peek-details', text: 'Details ›' });
    // Eigene Behandlung, damit der Tipp auf den Knopf nicht als Cover-Tipp zählt
    btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    btn.addEventListener('pointerup', (ev) => ev.stopPropagation());
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); details(); });
    cover.append(el('div', { class: 'peek' },
      el('strong', { text: card.querySelector('.title').textContent }),
      el('span', { text: card.querySelector('.author').textContent }), btn));
  };

  // Langes Drücken soll kein Bild-/Kontextmenü öffnen
  cover.addEventListener('contextmenu', (ev) => { if (isGrid()) ev.preventDefault(); });
  // Safari: den zweiten Tipp eines Doppeltipps „verschlucken“, damit er nicht als Zoom-Befehl gilt.
  // Unsere Geste läuft über Pointer-Events und bekommt den Tipp trotzdem.
  let lastTouchEnd = 0;
  cover.addEventListener('touchend', (ev) => {
    if (!isGrid()) return;
    const now = Date.now();
    if (now - lastTouchEnd < 350) ev.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  cover.addEventListener('pointerdown', (ev) => {
    if (!isGrid()) return;
    start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, swiping: false, held: false };
    clearTimeout(holdTimer);
    cover.classList.add('pressing'); // sichtbar: Cover drückt sich während des Haltens langsam ein
    holdTimer = setTimeout(() => {
      if (!start || start.swiping) return;
      start.held = true;
      haptic(20);
      cover.classList.remove('pressing');
      pop(cover);
      details();
    }, HOLD);
  });
  cover.addEventListener('pointermove', (ev) => {
    if (!start || ev.pointerId !== start.id) return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { clearTimeout(holdTimer); cover.classList.remove('pressing'); } // Bewegung = kein Halten
    if (!start.swiping && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      start.swiping = true;
      cover.setPointerCapture?.(ev.pointerId);
    }
    if (start.swiping) {
      cover.style.transform = `translateX(${Math.max(-90, Math.min(90, dx))}px) rotate(${dx / 30}deg)`;
      cover.dataset.swipe = dx > SWIPE ? 'wish' : dx < -SWIPE ? 'read' : '';
    }
  });
  const end = async (ev) => {
    cover.classList.remove('pressing');
    clearTimeout(holdTimer);
    if (!start || ev.pointerId !== start.id) return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    const { swiping, held } = start;
    start = null;
    cover.style.transform = '';
    delete cover.dataset.swipe;
    if (held) return; // Detailblatt ist schon offen
    if (swiping) {
      if (Math.abs(dx) < SWIPE || ev.type === 'pointercancel') return;
      apply(dx > 0 ? 'wish' : 'read');
      return;
    }
    if (ev.type === 'pointercancel' || Math.abs(dx) > 10 || Math.abs(dy) > 10) return; // war Scrollen
    const now = Date.now();
    if (now - lastTap < DOUBLE) {
      clearTimeout(tapTimer);
      lastTap = 0;
      cover.querySelector('.peek')?.remove();
      apply('own');
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
/** Kleiner „Rückgängig“-Knopf unten nach einer Geste – verschwindet nach 2,5 Sekunden. */
export function toast(undo) {
  const box = $('#toast');
  clearTimeout(toastTimer);
  box.replaceChildren(el('button', {
    type: 'button', text: '↶ Rückgängig',
    onclick: () => { box.hidden = true; undo(); },
  }));
  box.hidden = false;
  toastTimer = setTimeout(() => { box.hidden = true; }, 2500);
}

// ---------- Detailblatt („⋯“ bzw. Doppeltippen im Raster) ----------
function openSheet(ctx) {
  const { work } = ctx;
  const sheet = $('#sheet');
  const body = sheet.querySelector('.sheet-body');
  let entry = ctx.getEntry();

  // Kopf: Cover, voller Titel, Autor, alle Angaben
  // Autor und Genre führen zum Stöbern (Autorenseite bzw. beliebteste Bücher des Genres), siehe js/app.js
  const browseTo = (mode, value) => {
    sheetClose?.();
    document.dispatchEvent(new CustomEvent('browse', { detail: { mode, value } }));
  };
  const link = (text, mode, value) => el('button', { type: 'button', class: 'link-btn', text, onclick: () => browseTo(mode, value) });
  const group = catalog.canBrowse ? genreGroup(work.genre) : '';
  const facts = [
    work.series ? `Reihe: ${work.series}${work.volume ? `, Band ${work.volume}` : ''}` : null,
    work.year ? `Erschienen: ${work.year}` : null,
    work.genre ? el('span', {}, `Genre: ${work.genre}`, group ? el('br') : null, group ? link(`Mehr ${group} ›`, 'genre', group) : null) : null,
  ].filter(Boolean);
  // Link zu Amazon (Cover kommen meist von dort – Gegenleistung laut Amazon-Bedingungen); eigene Ausgabe bevorzugt
  const amazonUrl = [...ownedIsbnsOf(entry), ...(work.coverIsbns || []), ...(work.isbns || []).map(String)]
    .map(CONFIG.covers.amazonLink).find(Boolean);
  if (amazonUrl) facts.push(el('a', { class: 'link-btn amazon-link', href: amazonUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Bei Amazon ansehen ›' }));
  const authors = work.authors || [];
  const authorLine = el('p', { class: 'author' });
  if (!authors.length) authorLine.textContent = 'Unbekannter Autor';
  authors.forEach((a, i) => authorLine.append(i ? ', ' : '', link(`${a} ›`, 'author', a)));
  const head = el('div', { class: 'sheet-head' },
    el('div', { class: 'cover' }, el('span', { class: 'ph' }), el('img', { alt: '', decoding: 'async' })),
    el('div', {},
      el('h2', { class: 'sheet-title', text: fullTitle(work) }),
      authorLine,
      el('ul', { class: 'sheet-facts' }, ...facts.map((t) => el('li', {}, t)))));
  setCover(head, coverUrls(ownedIsbnsOf(entry), work.coverIds, work.coverIsbns || [], !!(work.fromDb || entry?.fromDb)), work.title);
  // Cover antippen → Vollbild (nur wenn ein echtes Cover geladen ist)
  const headCover = head.querySelector('.cover');
  onTap(headCover, () => {
    const img = headCover.querySelector('img.loaded');
    if (img) openCoverZoom(img.src, fullTitle(work));
  });

  // Dieselben drei Knöpfe, ausgeschrieben
  const toggle = (cls, label, fn) => {
    const b = switchToggle(cls, label); // echter iOS-Schalter im Knopf → Haptik am iPhone
    b.addEventListener('toggle', () => { haptic(); ctx.change(fn); }); // nur bei echtem Tipp, siehe switchToggle
    return b;
  };
  const bar = el('div', { class: 'actions sheet-actions' },
    toggle('own', 'Besitze', actions.own(work)), toggle('read', 'Gelesen', actions.read()), toggle('wish', 'Merken', actions.wish()));

  // Ausgaben: Häkchen für jede Ausgabe, die ich besitze (Details werden bei Bedarf von der DNB geladen)
  let editions = (work.editions || []).filter((ed) => ed.isbn);
  const isbnCount = editions.length || (work.isbns || []).length;
  const edList = el('ul', { class: 'editions' });
  // Ganz unten und zugeklappt – Bewertung, Notiz usw. sind wichtiger. Details werden erst beim Aufklappen geladen.
  const edSection = el('details', { class: 'sheet-section editions-box' },
    el('summary', { text: isbnCount === 1 ? 'Ausgabe' : `${isbnCount} Ausgaben – welche besitzt du?` }), edList);
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
    edSection.addEventListener('toggle', () => {
      if (!edSection.open || editions.length) return;
      catalog.editionDetails(work.isbns)
        .catch(() => work.isbns.map((isbn) => ({ isbn })))
        .then((list) => { editions = list; renderEditions(); });
    });
  } else renderEditions();

  // Bewertung, Lesedatum, Regale, Notiz
  const detBox = el('section', { class: 'sheet-section details' }, el('h3', { text: 'Meine Angaben' }));
  const details = buildDetails(detBox, () => entry, ctx.change);

  // Klappentext (Verlagstext über die DNB): erst Platzhalterzeilen, dann 5 Zeilen mit „Mehr lesen“; ohne Text verschwindet der Abschnitt
  const blurbText = el('p', { class: 'blurb-text' });
  const blurbMore = el('button', { type: 'button', class: 'blurb-more', text: 'Mehr lesen', hidden: true });
  const blurbBox = el('section', { class: 'sheet-section blurb loading' },
    el('h3', { text: 'Klappentext' }), blurbText, blurbMore);
  blurbText.append(el('span', { class: 'skel' }), el('span', { class: 'skel' }), el('span', { class: 'skel short' }));
  const toggleBlurb = () => {
    if (blurbMore.hidden && !blurbBox.classList.contains('open')) return;
    const open = blurbBox.classList.toggle('open');
    blurbMore.hidden = false;
    blurbMore.textContent = open ? 'Weniger' : 'Mehr lesen';
  };
  blurbMore.addEventListener('click', toggleBlurb);
  blurbText.addEventListener('click', toggleBlurb);
  catalog.blurb([...ownedIsbnsOf(entry), ...(work.isbns || [])])
    .catch(() => '')
    .then((text) => {
      if (!text) { blurbBox.remove(); return; }
      blurbBox.classList.remove('loading');
      blurbText.textContent = text;
      requestAnimationFrame(() => { blurbMore.hidden = blurbText.scrollHeight <= blurbText.clientHeight + 2; });
    });

  body.replaceChildren(...[head, bar, blurbBox, detBox, isbnCount ? edSection : null].filter(Boolean));
  const refresh = (e) => {
    entry = e;
    paintToggles(bar, e);
    if (editions.length) renderEditions();
    details.refresh(e);
  };
  refresh(entry);
  ctx.onChange = refresh;

  const close = (fromDrag = false) => {
    if (sheetClose !== close) return;
    sheetClose = null;
    ctx.onChange = null;
    document.removeEventListener('keydown', onKey);
    slideOut(sheet, fromDrag);
  };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  sheet.querySelector('.sheet-backdrop').onclick = () => close();
  sheet.querySelector('.sheet-close').onclick = () => close();
  document.addEventListener('keydown', onKey);
  sheetClose = close;
  attachSheetDrag(sheet);
  resetSheetStyles(sheet);
  document.body.classList.add('sheet-open');
  sheet.hidden = false;
  body.scrollTop = 0;
}

// ---------- Detailblatt herunterziehen (wie in üblichen Apps) ----------
// Ziehen am Griff/Kopf schiebt das Blatt immer; im Inhalt nur, wenn er ganz oben steht und der Finger nach unten geht.
// Loslassen: weiter als 30 % der Höhe oder schnell nach unten „geschnippt“ → schließen, sonst zurückfedern.
let sheetClose = null;
let sheetDragReady = false;

function resetSheetStyles(sheet) {
  const panel = sheet.querySelector('.sheet-panel');
  const backdrop = sheet.querySelector('.sheet-backdrop');
  panel.style.transition = panel.style.transform = backdrop.style.transition = backdrop.style.opacity = '';
}

function slideOut(sheet, fromDrag) {
  const panel = sheet.querySelector('.sheet-panel');
  const backdrop = sheet.querySelector('.sheet-backdrop');
  const done = () => {
    if (sheetClose) return; // inzwischen schon wieder geöffnet
    sheet.hidden = true;
    resetSheetStyles(sheet);
    document.body.classList.remove('sheet-open');
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
  panel.style.transition = `transform ${fromDrag ? 180 : 230}ms ${fromDrag ? 'ease-out' : 'cubic-bezier(.4,0,1,1)'}`;
  backdrop.style.transition = 'opacity 200ms linear';
  requestAnimationFrame(() => {
    panel.style.transform = 'translateY(100%)';
    backdrop.style.opacity = '0';
  });
  setTimeout(done, fromDrag ? 190 : 240);
}

function attachSheetDrag(sheet) {
  if (sheetDragReady) return;
  sheetDragReady = true;
  const panel = sheet.querySelector('.sheet-panel');
  const body = sheet.querySelector('.sheet-body');
  const backdrop = sheet.querySelector('.sheet-backdrop');
  let y0 = 0, x0 = 0, state = 'idle', dy = 0, samples = [];

  panel.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || !sheetClose) { state = 'idle'; return; }
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; dy = 0; samples = [[t.clientY, e.timeStamp]];
    // Mehrzeilige Notiz, die selbst gescrollt ist, behält ihre Wischgeste
    const ta = e.target.closest('textarea');
    state = ta && ta.scrollTop > 0 ? 'scroll' : 'maybe';
  }, { passive: true });

  panel.addEventListener('touchmove', (e) => {
    if (state === 'idle' || state === 'scroll') return;
    const t = e.touches[0];
    const mx = t.clientX - x0, my = t.clientY - y0;
    if (state === 'maybe') {
      if (Math.abs(my) < 6 && Math.abs(mx) < 6) return;
      const inContent = body.contains(e.target);
      const atTop = body.scrollTop <= 0;
      if (my > 0 && Math.abs(my) > Math.abs(mx) && (!inContent || atTop)) {
        state = 'drag';
        y0 = t.clientY; // ohne Sprung beginnen
        panel.style.transition = backdrop.style.transition = 'none';
      } else { state = 'scroll'; return; }
    }
    e.preventDefault(); // kein Scrollen/Gummiband, während das Blatt gezogen wird
    const raw = t.clientY - y0;
    dy = raw > 0 ? raw : raw / 4; // nach oben nur leicht nachgeben
    panel.style.transform = `translateY(${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / panel.offsetHeight));
    samples.push([t.clientY, e.timeStamp]);
    if (samples.length > 5) samples.shift();
  }, { passive: false });

  const end = () => {
    if (state !== 'drag') { state = 'idle'; return; }
    state = 'idle';
    const [[ya, ta], [yb, tb]] = [samples[0], samples[samples.length - 1]];
    const velocity = tb > ta ? (yb - ya) / (tb - ta) : 0; // Pixel pro Millisekunde, positiv = nach unten
    const far = dy > panel.offsetHeight * 0.3;
    if ((far && velocity > -0.3) || velocity > 0.5) { sheetClose?.(true); return; }
    panel.style.transition = 'transform 260ms cubic-bezier(.2,.9,.3,1.15)';
    backdrop.style.transition = 'opacity 200ms linear';
    panel.style.transform = '';
    backdrop.style.opacity = '';
  };
  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', end);
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
