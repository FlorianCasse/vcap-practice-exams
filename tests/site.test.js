#!/usr/bin/env node
// Static checks for the site: every page is precached for offline use and every index link resolves.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failed++; };

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const start = sw.indexOf('const PRECACHE');
const precache = [...sw.slice(start, sw.indexOf('];', start)).matchAll(/'([^']+)'/g)].map(m => m[1]);
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));

for (const f of precache.filter(f => f !== './')) check(fs.existsSync(path.join(root, f)), `precached file exists: ${f}`);
for (const p of pages) check(precache.includes(p), `page is precached: ${p}`);

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, href] of index.matchAll(/href="([^"#:]+\.html)"/g)) check(fs.existsSync(path.join(root, href)), `index link resolves: ${href}`);

for (const p of pages.filter(p => p.startsWith('NVIDIA_'))) {
  const html = fs.readFileSync(path.join(root, p), 'utf8');
  check(html.includes('manifest.webmanifest') && html.includes('assets/js/pwa.js'), `PWA tags present: ${p}`);
}

console.log(failed ? `\n${failed} failed` : '\nall site checks passed');
process.exit(failed ? 1 : 0);
