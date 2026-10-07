#!/usr/bin/env node
// Usage: node tests/validate-banks.js <code> [<file.json|file.html>]
// code: NCA-AIIO | NCP-AII | NCP-AIO. Default file: NVIDIA_<code>_Hard_Practice_Exam.html
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const EXPECTED = {
  'NCA-AIIO': { 'Domain 1 – Essential AI Knowledge': 38, 'Domain 2 – AI Infrastructure': 40, 'Domain 3 – AI Operations': 22 },
  'NCP-AII': { 'Domain 1 – System and Server Bring-up': 31, 'Domain 2 – Physical Layer Management': 5, 'Domain 3 – Control Plane Installation and Configuration': 19, 'Domain 4 – Cluster Test and Verification': 33, 'Domain 5 – Troubleshoot and Optimize': 12 },
  'NCP-AIO': { 'Domain 1 – Installation and Deployment': 31, 'Domain 2 – Administration': 23, 'Domain 3 – Workload Management': 23, 'Domain 4 – Troubleshooting and Optimization': 23 },
};

function loadBank(file) {
  const txt = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) {
    const line = txt.split('\n').find(l => l.startsWith('const ALL_QUESTIONS = '));
    return JSON.parse(line.replace(/^const ALL_QUESTIONS = /, '').replace(/;\s*$/, ''));
  }
  return JSON.parse(txt);
}
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, 'x').trim();
const norm = s => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const MAX_LONGEST_CORRECT_PCT = 30, MAX_MULTI = 15, POSITION_SKEW = 0.08;

const code = process.argv[2];
if (code === '--codes') { console.log(Object.keys(EXPECTED).join(' ')); process.exit(0); }
if (!EXPECTED[code]) { console.error('code must be one of', Object.keys(EXPECTED)); process.exit(2); }
const file = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, `NVIDIA_${code}_Hard_Practice_Exam.html`);
const qs = loadBank(file);
const old = loadBank(path.join(root, `NVIDIA_${code}_Practice_Exam.html`));
const oldStems = new Set(old.map(q => norm(q.question)));

const errors = [], warns = [];
const total = Object.values(EXPECTED[code]).reduce((a, n) => a + n, 0);
if (qs.length !== total) errors.push(`expected ${total} questions, got ${qs.length}`);

const counts = {}, pos = [0, 0, 0, 0];
let single = 0, longestCorrect = 0, multi = 0, pre = 0;
const seen = new Set();
qs.forEach((q, i) => {
  const tag = `#${i + 1}`;
  for (const k of ['section', 'question', 'options', 'correct', 'explanation'])
    if (!(k in q)) errors.push(`${tag} missing ${k}`);
  if (!Array.isArray(q.options) || q.options.length !== 4) { errors.push(`${tag} must have 4 options`); return; }
  if (q.options.some(o => typeof o !== 'string' || !o.trim())) errors.push(`${tag} empty option`);
  if (new Set(q.options.map(norm)).size !== 4) errors.push(`${tag} duplicate options`);
  if (!(q.section in EXPECTED[code])) errors.push(`${tag} unknown section "${q.section}"`);
  counts[q.section] = (counts[q.section] || 0) + 1;
  if (/all of the above|none of the above/i.test(q.options.join(' '))) errors.push(`${tag} all/none of the above`);
  if (/<pre>/.test(q.question)) pre++;
  const n = norm(q.question);
  if (seen.has(n)) errors.push(`${tag} duplicate stem in bank`);
  seen.add(n);
  if (oldStems.has(n)) errors.push(`${tag} stem duplicated from old bank`);
  // unescaped angle brackets that are not known tags
  const bad = (q.question + q.options.join('') + q.explanation).match(/<(?!\/?(pre|code|b|i|br|em|strong|ul|li|ol|span|sub|sup)\b)[^>]*>/g);
  if (bad) errors.push(`${tag} suspicious HTML/unescaped tag: ${bad.slice(0, 3).join(' ')}`);
  if (Array.isArray(q.correct)) {
    multi++;
    if (q.correct.length < 2 || q.correct.some(c => !Number.isInteger(c) || c < 0 || c > 3)) errors.push(`${tag} bad multi correct`);
    if (new Set(q.correct).size !== q.correct.length) errors.push(`${tag} duplicate indexes in correct`);
    if (!/choose (two|three)/i.test(q.question)) warns.push(`${tag} multi-select without "Choose N"`);
    const want = { two: 2, three: 3 }[(q.question.match(/choose (two|three)/i) || [])[1]?.toLowerCase()];
    if (want && want !== q.correct.length) errors.push(`${tag} "Choose" count != correct length`);
  } else {
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) { errors.push(`${tag} bad correct`); return; }
    if (/choose (two|three)/i.test(q.question)) errors.push(`${tag} says Choose N but single answer`);
    single++;
    pos[q.correct]++;
    const lens = q.options.map(o => strip(o).length);
    const max = Math.max(...lens);
    if (lens[q.correct] === max && lens.filter(l => l === max).length === 1) longestCorrect++;
  }
});

for (const [s, n] of Object.entries(EXPECTED[code]))
  if ((counts[s] || 0) !== n) errors.push(`section "${s}": ${counts[s] || 0} (expected ${n})`);
if (!single) errors.push('no single-answer questions');
const lcPct = single ? Math.round(100 * longestCorrect / single) : 0;
if (lcPct > MAX_LONGEST_CORRECT_PCT) errors.push(`longest option is correct in ${lcPct}% of single-answer questions (max ${MAX_LONGEST_CORRECT_PCT}%)`);
if (pos.some(p => Math.abs(p - single / 4) > single * POSITION_SKEW)) warns.push(`answer position skew A-D: ${pos.join('/')}`);
if (multi > MAX_MULTI) errors.push(`${multi} multi-select (max ${MAX_MULTI})`);

console.log(`${code}: ${qs.length} Q | multi ${multi} | longest-correct ${lcPct}% | positions A-D ${pos.join('/')} | with <pre> ${pre}`);
warns.forEach(w => console.log('WARN', w));
errors.forEach(e => console.log('ERROR', e));
console.log(errors.length ? `FAIL (${errors.length} errors)` : 'OK');
process.exit(errors.length ? 1 : 0);
