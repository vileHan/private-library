// Einstellungen → „Konto“ (Anmelden, Abgleich, Passwort, Abmelden) und – nur für den Verwalter – „Datennutzung“.
// 18.11.2026.
import { el, fmt, plural } from './util.js';
import { account, login, logout, changePassword, accountRpc, register, inviteFromUrl, inviteStatus } from './account.js';
import { syncNow, syncState, firstSync, hasPending, clearLocalAfterLogout } from './sync.js';
import { library } from './library.js';
import { settings } from './settings.js';
import { currentTitle, openRename, libraryTitle, applyLibraryTitle, libraryTitleInto } from './libname.js';
import { showInstallHint, isStandalone } from './install.js';

const FREE_BYTES = 5 * 1024 ** 3; // Supabase Gratis-Tarif: 5 GB Datenverkehr im Monat

function when(iso) {
  if (!iso) return 'noch nie';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `heute ${time}` : `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })} ${time}`;
}

const mb = (bytes) => {
  const v = bytes / 1024 ** 2;
  return `${v < 10 ? v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : fmt.format(Math.round(v))} MB`;
};

/** Konto-Abschnitt zeichnen. rerender() zeichnet die ganzen Einstellungen neu (z. B. nach dem Anmelden). */
export function renderAccount(box, rerender) {
  box.replaceChildren(el('h2', { text: 'Konto' }));
  if (!account.loggedIn) return pendingInvite ? renderRegister(box, rerender) : renderLogin(box, rerender);
  renderSignedIn(box, rerender);
}

// Symbole nach Lucide (ISC-Lizenz), feste Texte
const ico = (body) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.classList.add('kl-ico'); s.innerHTML = body; return s; };
const ICONS = {
  sync: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
};
const chevron = () => el('span', { class: 'kl-chev', 'aria-hidden': 'true', text: '›' });

/** Liste wie in den Einstellungen gängiger Apps: Zeile = Symbol, Text, rechts Zusatz/Pfeil */
function listRow(icon, label, { onclick, trail } = {}) {
  const b = el('button', { type: 'button', class: 'kl-row', onclick }, ico(ICONS[icon]), el('span', { class: 'kl-label', text: label }));
  if (trail) b.append(trail);
  return b;
}

/** Angemeldet (20.11.2026): Kopf, Name der Bibliothek als antippbarer Titel, Liste, Abmelden ganz unten. */
function renderSignedIn(box, rerender) {
  const status = el('span', { class: 'konto-sync' });
  const showStatus = (text) => {
    const waiting = hasPending();
    status.className = `konto-sync${waiting ? ' waiting' : ''}`;
    status.textContent = text || (waiting ? 'Änderungen warten auf den Abgleich' : `Abgeglichen ${when(syncState().lastSync)}`);
  };
  showStatus();
  box.append(el('div', { class: 'konto-who' },
    el('span', { class: 'konto-label', text: 'Angemeldet als' }),
    el('strong', { class: 'konto-name', text: account.name }),
    status));

  if (account.expired) {
    box.append(el('p', { class: 'konto-hint', text: 'Die Anmeldung ist abgelaufen (z. B. neues Passwort). Bitte melde dich neu an – deine Bücher bleiben auf diesem Gerät.' }));
    renderLogin(box, rerender, account.name);
    return;
  }

  // Name der Bibliothek: großer Anfangsbuchstabe, unterstrichen wie ein Link, Stift → Umbenennen
  const libName = el('span', { class: 'konto-libname' });
  libraryTitleInto(libName);
  box.append(el('button', { type: 'button', class: 'konto-lib', onclick: openRename, 'aria-label': `Name der Bibliothek ändern: ${currentTitle()}` },
    el('span', { class: 'konto-label', text: 'Deine Bibliothek' }),
    el('span', { class: 'konto-lib-line' }, libName, ico(ICONS.pencil))));

  // Passwort ändern (autocomplete="new-password": Schlüsselbund bietet ein sicheres Passwort an und speichert es)
  const pwBox = el('form', { class: 'konto-form kl-form', hidden: true });
  const user = el('input', { type: 'text', name: 'username', autocomplete: 'username', value: account.name, hidden: true });
  const pw1 = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Neues Passwort (mind. 8 Zeichen)', 'aria-label': 'Neues Passwort' });
  const pw2 = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Neues Passwort wiederholen', 'aria-label': 'Neues Passwort wiederholen' });
  const pwMsg = el('p', { class: 'konto-msg', 'aria-live': 'polite' });
  pwBox.append(user, pw1, pw2, el('button', { type: 'submit', text: 'Passwort speichern' }), pwMsg);
  pwBox.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (pw1.value !== pw2.value) { pwMsg.textContent = 'Die beiden Passwörter sind nicht gleich.'; return; }
    pwMsg.textContent = 'Speichere …';
    try {
      await changePassword(pw1.value);
      pw1.value = pw2.value = '';
      pwMsg.textContent = 'Passwort geändert.';
    } catch (err) {
      pwMsg.textContent = err.message;
    }
  });

  const syncRow = listRow('sync', 'Jetzt abgleichen', {
    onclick: async () => {
      syncRow.disabled = true;
      syncRow.classList.add('busy');
      showStatus('Gleiche ab …');
      try {
        const n = await syncNow();
        showStatus(n ? `Abgeglichen – ${plural(n, 'Änderung', 'Änderungen')} übernommen` : 'Abgeglichen – alles aktuell');
      } catch {
        showStatus('Abgleich fehlgeschlagen – keine Verbindung? Später erneut.');
      }
      syncRow.disabled = false;
      syncRow.classList.remove('busy');
    },
  });
  const pwRow = listRow('key', 'Passwort ändern', {
    trail: chevron(),
    onclick: () => { pwBox.hidden = !pwBox.hidden; pwRow.classList.toggle('open', !pwBox.hidden); if (!pwBox.hidden) pw1.focus(); },
  });
  box.append(el('div', { class: 'konto-list' },
    syncRow,
    pwRow,
    pwBox,
    listRow('phone', 'Als App installieren', { trail: chevron(), onclick: showInstallHint })));

  box.append(el('button', {
    type: 'button', class: 'konto-logout', text: 'Abmelden',
    onclick: async () => {
      let pendingNote = '';
      if (hasPending()) {
        try { await syncNow(); } catch { /* unten nachfragen */ }
        if (hasPending()) pendingNote = '\n\nACHTUNG: Einige Änderungen konnten noch nicht hochgeladen werden (keine Verbindung) und gehen verloren.';
      }
      if (!window.confirm(`Abmelden? Deine Bücher bleiben im Konto gespeichert und werden von diesem Gerät entfernt.${pendingNote}`)) return;
      await logout();
      await clearLocalAfterLogout();
      applyLibraryTitle();
      rerender();
    },
  }));
}

function renderLogin(box, rerender, presetName = '') {
  box.append(el('p', { text: 'Mit einem Konto sind deine Bücher auf allen Geräten gleich (Handy, Tablet, Computer) und sicher aufgehoben. Ein Konto erstellst du über deinen Einladungs-Link – danach meldest du dich hier mit deinem Benutzernamen an.' }));
  const name = el('input', { type: 'text', name: 'username', autocomplete: 'username', autocapitalize: 'words', autocorrect: 'off', spellcheck: 'false', placeholder: 'Benutzername', 'aria-label': 'Benutzername', value: presetName });
  const pw = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', placeholder: 'Passwort', 'aria-label': 'Passwort' });
  const msg = el('p', { class: 'konto-msg', 'aria-live': 'polite' });
  const submit = el('button', { type: 'submit', text: 'Anmelden' });
  const form = el('form', { class: 'konto-form' }, name, pw, submit, msg);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    submit.disabled = true;
    msg.textContent = 'Melde an …';
    try {
      await login(name.value, pw.value);
      await afterLogin(msg, rerender, `Angemeldet als ${account.name}.`);
    } catch (err) {
      msg.textContent = err.message;
      submit.disabled = false;
      if (account.loggedIn) rerender(); // angemeldet, nur der Abgleich hakte – wird später wiederholt
    }
  });
  box.append(form);
  box.append(el('p', { class: 'konto-switch' }, el('button', {
    type: 'button', class: 'link-btn', text: 'Ich habe eine Einladung – Konto erstellen ›',
    onclick: () => { pendingInvite = { code: '', status: 'eingeben' }; rerender(); },
  })));
  box.append(el('div', { class: 'konto-list' }, listRow('phone', 'Als App installieren', { trail: chevron(), onclick: showInstallHint })));
}

/** Nach Anmelden/Erstellen: Bücher abgleichen, neu zeichnen, kurze Meldung. */
async function afterLogin(msg, rerender, hello, isNew = false) {
  msg.textContent = 'Angemeldet – gleiche Bücher ab …';
  const { fromAccount, fromDevice } = await firstSync();
  settings.set('libSeen', [...library.byKey.values()].filter((e) => e.owned).map((e) => e.key)); // nichts als „neu“ zählen
  // Neues Konto: Bibliothek nach dem Benutzernamen benennen – außer das Gerät hat schon einen Namen oder ein Geschenk.
  // Nur beim Erstellen, nicht bei jeder Anmeldung: sonst käme ein bewusst auf „Standard“ gesetzter Name zurück.
  if (isNew && !settings.get('libraryName', '') && !settings.get('gift', null)) settings.set('libraryName', libraryTitle(account.name));
  if (!isStandalone()) showInstallHint(); // bleibt stehen, bis „Verstanden“ getippt wird
  pendingInvite = null;
  if (inviteFromUrl()) history.replaceState(history.state, '', location.pathname + location.search); // Link ist verbraucht
  rerender();
  const parts = [];
  if (fromDevice) parts.push(`${plural(fromDevice, 'Buch', 'Bücher')} von diesem Gerät ins Konto übernommen`);
  if (fromAccount) parts.push(`${plural(fromAccount, 'Änderung', 'Änderungen')} aus dem Konto geladen`);
  window.alert(`${hello}${parts.length ? `\n${parts.join(', ')}.` : ''}`);
}

// ---------- Einladung: Konto selbst erstellen (18.11.2026) ----------
// pendingInvite = { code, status: 'frei' | 'verwendet' | 'unbekannt' | 'offline' | 'eingeben' } oder null
let pendingInvite = null;

/** Beim Start mit …/#einladung-<code>: Code merken und prüfen. Gibt true zurück, wenn das Formular gezeigt werden soll. */
export async function startInvite() {
  const code = inviteFromUrl();
  if (!code) return false;
  if (account.loggedIn) {
    history.replaceState(history.state, '', location.pathname + location.search);
    return false;
  }
  pendingInvite = { code, status: await inviteStatus(code) };
  return true;
}

function renderRegister(box, rerender) {
  const inv = pendingInvite;
  const cancel = el('p', { class: 'konto-switch' }, el('button', {
    type: 'button', class: 'link-btn', text: '‹ Ich habe schon ein Konto – anmelden',
    onclick: () => { pendingInvite = null; rerender(); },
  }));
  if (inv.status === 'verwendet' || inv.status === 'unbekannt') {
    box.append(el('p', { class: 'konto-hint', text: inv.status === 'verwendet'
      ? 'Diese Einladung wurde schon verwendet – jede Einladung gilt nur einmal. Hast du damit schon ein Konto erstellt? Dann melde dich einfach an.'
      : 'Diese Einladung kennt die App nicht. Bitte prüfe den Link oder frag nach einer neuen Einladung.' }), cancel);
    return;
  }
  box.append(el('p', { text: 'Willkommen! Wähle einen Benutzernamen und ein Passwort. Damit meldest du dich auf allen deinen Geräten an – deine Bücher sind dann überall gleich.' }));
  const code = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', placeholder: 'Einladungscode', 'aria-label': 'Einladungscode', value: inv.code });
  const name = el('input', { type: 'text', name: 'username', autocomplete: 'username', autocapitalize: 'words', autocorrect: 'off', spellcheck: 'false', placeholder: 'Benutzername (z. B. dein Vorname)', 'aria-label': 'Benutzername' });
  const pw1 = el('input', { type: 'password', name: 'password', autocomplete: 'new-password', placeholder: 'Passwort (mind. 8 Zeichen)', 'aria-label': 'Passwort' });
  const pw2 = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Passwort wiederholen', 'aria-label': 'Passwort wiederholen' });
  const msg = el('p', { class: 'konto-msg', 'aria-live': 'polite' });
  const submit = el('button', { type: 'submit', text: 'Konto erstellen' });
  const form = el('form', { class: 'konto-form' }, ...(inv.code ? [] : [code]), name, pw1, pw2, submit, msg);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (pw1.value !== pw2.value) { msg.textContent = 'Die beiden Passwörter sind nicht gleich.'; return; }
    submit.disabled = true;
    msg.textContent = 'Erstelle Konto …';
    try {
      await register(code.value, name.value, pw1.value);
      await afterLogin(msg, rerender, `Willkommen, ${account.name}! Dein Konto ist fertig.`, true);
    } catch (err) {
      msg.textContent = err.message;
      submit.disabled = false;
      if (account.loggedIn) rerender();
    }
  });
  box.append(form, el('p', { class: 'konto-sub', text: 'Tipp: Lass dein iPhone das Passwort im Schlüsselbund sichern. Groß- und Kleinschreibung beim Namen ist beim Anmelden egal.' }), cancel);
}

/** Datennutzung aller Konten – nur für den Verwalter. */
export async function renderUsage(box) {
  box.hidden = !(account.loggedIn && account.isAdmin && !account.expired);
  if (box.hidden) return;
  box.replaceChildren(el('h2', { text: 'Datennutzung (nur für dich)' }), el('p', { class: 'konto-sub', text: 'Lade …' }));
  let rows, days;
  try {
    [rows, days] = await Promise.all([accountRpc('usage_overview', {}), accountRpc('usage_by_day', {})]);
  } catch {
    box.replaceChildren(el('h2', { text: 'Datennutzung (nur für dich)' }), el('p', { text: 'Konnte nicht geladen werden – keine Verbindung?' }));
    return;
  }
  const total = rows.reduce((s, r) => s + Number(r.month_bytes || 0), 0);
  const share = Math.min(1, total / FREE_BYTES);
  const monthName = new Date().toLocaleDateString('de-DE', { month: 'long' });

  const maxDay = Math.max(1, ...days.map((d) => Number(d.bytes)));
  const byDay = new Map(days.map((d) => [d.day, Number(d.bytes)]));
  const bars = el('div', { class: 'usage-bars', 'aria-hidden': 'true' });
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const v = byDay.get(day) || 0;
    bars.append(el('span', { style: `height:${Math.max(v ? 4 : 1, Math.round((v / maxDay) * 100))}%`, title: `${day}: ${mb(v)}` }));
  }

  const table = el('table', { class: 'usage-table' },
    el('thead', {}, el('tr', {}, ...['Konto', monthName.slice(0, 3) + '.', 'Suchen', 'Bücher', 'zuletzt'].map((t) => el('th', { text: t })))),
    el('tbody', {}, ...rows.map((r) => el('tr', {},
      el('td', { class: 'who' }, r.name, el('span', { class: 'usage-30', text: `30 Tage: ${mb(Number(r.days30_bytes))}` })),
      el('td', { class: 'num', text: mb(Number(r.month_bytes)) }),
      el('td', { class: 'num', text: fmt.format(Number(r.month_searches)) }),
      el('td', { class: 'num', text: fmt.format(Number(r.books)) }),
      el('td', { text: r.last_active ? new Date(r.last_active).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }) : '–' }))))
  );

  box.replaceChildren(
    el('h2', { text: 'Datennutzung (nur für dich)' }),
    el('p', { class: 'usage-total' }, el('strong', { text: mb(total) }), ` von 5 GB im ${monthName} (${(share * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %)`),
    el('div', { class: 'usage-meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(share * 100)), 'aria-label': 'Anteil am Gratis-Datenvolumen' },
      el('span', { style: `width:${Math.max(share * 100, total ? 0.5 : 0)}%` })),
    el('p', { class: 'konto-sub', text: 'Letzte 30 Tage, alle Konten:' }),
    bars,
    el('div', { class: 'usage-scroll' }, table),
    el('p', { class: 'konto-sub', text: 'Gezählt wird, was die App von der Datenbank lädt (ungefähr, eher etwas zu hoch). Cover kommen von anderen Diensten und zählen nicht. Die Geräte melden höchstens alle 10 Minuten. Den genauen Gesamtwert zeigt Supabase unter „Usage“.' }),
  );
}
