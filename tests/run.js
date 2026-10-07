#!/usr/bin/env node
// Runs every check: node tests/run.js
const { spawnSync } = require('child_process');
const path = require('path');

const codes = spawnSync(process.execPath, [path.join(__dirname, 'validate-banks.js'), '--codes'], { encoding: 'utf8' }).stdout.trim().split(' ');
const runs = [
  ...codes.map(c => ['validate-banks.js', c]),
  ['validate-banks.test.js'], ['labs.test.js'], ['labs-ui.test.js'], ['site.test.js']
];
let failed = 0;
for (const [file, ...args] of runs) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file), ...args], { encoding: 'utf8' });
  const lines = (r.stdout + r.stderr).trim().split('\n');
  const shown = r.status === 0 ? lines.slice(-1) : lines.slice(lines.findIndex(l => /FAIL|ERROR|Error/.test(l)));
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'} ${file} ${args.join(' ')}\n  ${shown.join('\n  ')}`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
