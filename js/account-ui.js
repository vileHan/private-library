// Einstellungen → „Konto“ (Anmelden, Abgleich, Passwort, Abmelden) und – nur für den Verwalter – „Datennutzung“.
// 18.11.2026.
import { el, fmt, plural } from './util.js';
import { account, login, logout, changePassword, accountRpc } from './account.js';
import { syncNow, syncState, firstSync, hasPending, clearLocalAfterLogout } from './sync.js';
import { library } from './library.js';
import { settings } from './settings.js';

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
  if (!account.loggedIn) return renderLogin(box, rerender);

  const status = el('p', { class: 'konto-status' });
  const showStatus = (text) => {
    const s = syncState();
    status.replaceChildren(
      el('span', {}, 'Angemeldet als ', el('strong', { text: account.name })),
      el('span', { class: 'konto-sub', text: text || `Zuletzt abgeglichen: ${when(s.lastSync)}${hasPending() ? ' · Änderungen warten' : ''}` }),
    );
  };
  showStatus();
  box.append(status);

  if (account.expired) {
    box.append(el('p', { class: 'konto-hint', text: 'Die Anmeldung ist abgelaufen (z. B. neues Passwort). Bitte melde dich neu an – deine Bücher bleiben auf diesem Gerät.' }));
    renderLogin(box, rerender, account.name);
    return;
  }

  const pwBox = el('form', { class: 'konto-form', hidden: true });
  const actions = el('div', { class: 'data-actions' },
    el('button', {
      type: 'button', text: 'Jetzt abgleichen',
      onclick: async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        showStatus('Gleiche ab …');
        try {
          const n = await syncNow();
          showStatus(n ? `Abgeglichen – ${plural(n, 'Änderung', 'Änderungen')} übernommen.` : 'Abgeglichen – alles aktuell.');
        } catch {
          showStatus('Abgleich fehlgeschlagen – keine Verbindung? Es wird später erneut versucht.');
        }
        btn.disabled = false;
      },
    }),
    el('button', { type: 'button', text: 'Passwort ändern', onclick: () => { pwBox.hidden = !pwBox.hidden; if (!pwBox.hidden) pwBox.querySelector('input').focus(); } }),
    el('button', {
      type: 'button', class: 'danger', text: 'Abmelden',
      onclick: async () => {
        let pendingNote = '';
        if (hasPending()) {
          try { await syncNow(); } catch { /* unten nachfragen */ }
          if (hasPending()) pendingNote = '\n\nACHTUNG: Einige Änderungen konnten noch nicht hochgeladen werden (keine Verbindung) und gehen verloren.';
        }
        if (!window.confirm(`Abmelden? Deine Bücher bleiben im Konto gespeichert und werden von diesem Gerät entfernt.${pendingNote}`)) return;
        await logout();
        await clearLocalAfterLogout();
        rerender();
      },
    }));
  box.append(actions);

  // Passwort ändern (autocomplete="new-password": Schlüsselbund bietet ein sicheres Passwort an und speichert es)
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
  box.append(pwBox);
}

function renderLogin(box, rerender, presetName = '') {
  box.append(el('p', { text: 'Mit einem Konto sind deine Bücher auf allen Geräten gleich (Handy, Tablet, Computer) und sicher aufgehoben. Benutzername und Passwort bekommst du persönlich.' }));
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
      msg.textContent = 'Angemeldet – gleiche Bücher ab …';
      const { fromAccount, fromDevice } = await firstSync();
      settings.set('libSeen', [...library.byKey.values()].filter((e) => e.owned).map((e) => e.key)); // nichts als „neu“ zählen
      rerender();
      const parts = [];
      if (fromDevice) parts.push(`${plural(fromDevice, 'Buch', 'Bücher')} von diesem Gerät ins Konto übernommen`);
      if (fromAccount) parts.push(`${plural(fromAccount, 'Änderung', 'Änderungen')} aus dem Konto geladen`);
      window.alert(`Angemeldet als ${account.name}.${parts.length ? `\n${parts.join(', ')}.` : ''}`);
    } catch (err) {
      msg.textContent = err.message;
      submit.disabled = false;
      if (account.loggedIn) rerender(); // angemeldet, nur der Abgleich hakte – wird später wiederholt
    }
  });
  box.append(form);
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
    el('thead', {}, el('tr', {}, ...['Konto', monthName, '30 Tage', 'Suchen', 'Bücher', 'zuletzt'].map((t) => el('th', { text: t })))),
    el('tbody', {}, ...rows.map((r) => el('tr', {},
      el('td', { text: r.name }),
      el('td', { class: 'num', text: mb(Number(r.month_bytes)) }),
      el('td', { class: 'num', text: mb(Number(r.days30_bytes)) }),
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
