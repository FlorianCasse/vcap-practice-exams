#!/usr/bin/env node
// Negative tests: the bank validator must reject broken banks.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'NVIDIA_NCP-AIO_Hard_Practice_Exam.html'), 'utf8');
const line = html.split('\n').find(l => l.startsWith('const ALL_QUESTIONS = '));
const good = JSON.parse(line.replace(/^const ALL_QUESTIONS = /, '').replace(/;\s*$/, ''));

function validate(bank) {
  const f = path.join(os.tmpdir(), `bank-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify(bank));
  const r = spawnSync(process.execPath, [path.join(__dirname, 'validate-banks.js'), 'NCP-AIO', f], { encoding: 'utf8' });
  fs.unlinkSync(f);
  return r;
}
const mutate = fn => { const b = JSON.parse(JSON.stringify(good)); fn(b); return b; };

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
const rejects = (name, bank, re) => test(name, () => { const r = validate(bank); assert.strictEqual(r.status, 1, r.stdout); assert.match(r.stdout, re); });

test('the shipped bank passes', () => assert.strictEqual(validate(good).status, 0));
rejects('3 options', mutate(b => { b[0].options.pop(); }), /must have 4 options/);
rejects('duplicate stem', mutate(b => { b[1].question = b[0].question; }), /duplicate stem/);
rejects('unknown section', mutate(b => { b[0].section = 'Domain 9 – Nope'; }), /unknown section/);
rejects('duplicate multi-select indexes', mutate(b => { const q = b.find(x => Array.isArray(x.correct)); q.correct = [0, 0]; }), /duplicate indexes|Choose" count/);
rejects('all of the above', mutate(b => { b[0].options[3] = 'All of the above'; }), /all\/none of the above/);
rejects('longest option always correct', mutate(b => b.forEach(q => { if (!Array.isArray(q.correct)) q.options[q.correct] += ' '.repeat(0) + 'x'.repeat(400); })), /longest option is correct/);
rejects('no single-answer questions', mutate(b => b.forEach(q => { q.correct = [0, 1]; q.question += ' (Choose two.)'; })), /no single-answer questions/);
rejects('raw HTML tag', mutate(b => { b[0].question += ' <script>alert(1)</script>'; }), /suspicious HTML/);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
