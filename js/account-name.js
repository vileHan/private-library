// Benutzername ↔ interne Anmeldeadresse (18.11.2026). Supabase Auth braucht eine E-Mail-Adresse; die Konten haben aber
// nur einen Benutzernamen. Daraus wird „name@bibliothek.invalid“ (.invalid ist eine reservierte Endung – an diese
// Adresse kann nie eine Mail gehen). Gemeinsam genutzt von der App und scripts/accounts.mjs.
export const ACCOUNT_DOMAIN = 'bibliothek.invalid';

/** „ Anna “ → „anna“; null, wenn der Name nicht erlaubt ist. */
export function normalizeAccountName(name) {
  const n = String(name || '').trim().toLowerCase();
  return /^[a-z0-9._-]{2,30}$/.test(n) ? n : null;
}

export const accountEmail = (name) => `${normalizeAccountName(name)}@${ACCOUNT_DOMAIN}`;
