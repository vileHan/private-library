// Hält das Supabase-Gratis-Projekt aktiv (siehe .github/workflows/keepalive.yml).
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const r = await client.query("select now() as t, (select count(*) from works) as works");
console.log(`Supabase erreichbar: ${r.rows[0].t.toISOString()}, ${r.rows[0].works} Werke`);
await client.end();
