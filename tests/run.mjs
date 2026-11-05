// Tests in Node (GitHub Actions, Workflow „Tests“): node tests/run.mjs
import { DOMParser } from '@xmldom/xmldom';

globalThis.DOMParser = DOMParser;
const { runAll } = await import('./cases.js');
const results = await runAll();
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} von ${results.length} Tests fehlgeschlagen` : `\nAlle ${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
