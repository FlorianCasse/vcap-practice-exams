#!/usr/bin/env node
// Runs every check: node tests/run.js
const { spawnSync } = require('child_process');
const path = require('path');

const runs = [
  ['validate-banks.js', 'NCA-AIIO'], ['validate-banks.js', 'NCP-AII'], ['validate-banks.js', 'NCP-AIO'],
  ['labs.test.js'], ['labs-ui.test.js'], ['site.test.js']
];
let failed = 0;
for (const [file, ...args] of runs) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file), ...args], { encoding: 'utf8' });
  const lines = (r.stdout + r.stderr).trim().split('\n');
  const shown = r.status === 0 ? lines.slice(-1) : lines.filter(l => /FAIL|ERROR|Error/.test(l)).concat(lines.slice(-1));
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'} ${file} ${args.join(' ')}\n  ${shown.join('\n  ')}`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
