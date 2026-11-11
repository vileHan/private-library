// Geschenke speichern (Workflow „Geschenke speichern“, .github/workflows/gifts.yml).
// Liest das GitHub-Secret GIFTS – ein JSON-Objekt { "<code>": { "n": Name, "m": Gruß, "c": Farbe, "v": Absender }, … } –
// und schreibt es in die Tabelle gifts (schema.sql). Gibt nur die Codes aus, nie Namen oder Gruß (öffentliche Logs!).
import pg from 'pg';

let gifts;
try {
  gifts = JSON.parse(process.env.GIFTS || '{}');
} catch {
  console.log('GIFTS ist kein gültiges JSON.');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
for (const [code, data] of Object.entries(gifts)) {
  if (!/^[a-z0-9-]{3,40}$/.test(code) || !data || typeof data.n !== 'string') {
    console.log(`Übersprungen (ungültig): Code mit ${code.length} Zeichen`);
    continue;
  }
  await client.query(
    `insert into gifts (code, data, updated_at) values ($1, $2, now())
     on conflict (code) do update set data = excluded.data, updated_at = now()`,
    [code, data],
  );
  console.log(`Gespeichert: ein Geschenk (Code mit ${code.length} Zeichen)`); // Code nicht ins öffentliche Log
}
const n = (await client.query('select count(*)::int as n from gifts')).rows[0].n;
console.log(`Geschenke in der Datenbank: ${n}`);
await client.end();
