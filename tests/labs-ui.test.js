#!/usr/bin/env node
// UI flow tests for NVIDIA_NCP-AIO_Labs.html, run against a minimal fake DOM (no dependencies).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'NVIDIA_NCP-AIO_Labs.html'), 'utf8');
const script = html.slice(html.indexOf('// LAB-ENGINE-START'), html.lastIndexOf('</script>', html.indexOf('assets/js/pwa.js')));

function makeEl(id) {
  const classes = new Set();
  const el = {
    id, value: '', textContent: '', className: '', disabled: false, scrollTop: 0, scrollHeight: 0, children: [], listeners: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : on ? classes.add(c) : classes.delete(c)), contains: c => classes.has(c) },
    appendChild(c) { this.children.push(c); this._html = null; },
    addEventListener(t, fn) { this.listeners[t] = fn; },
    focus() {},
    get text() { return this.children.map(c => c.textContent || c.innerHTML).join('\n'); }
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._html ?? ''; }, set(v) { el._html = v; if (v === '') el.children = []; } });
  return el;
}
const els = {};
const store = {};
let confirmAnswer = true;
const sandbox = {
  document: { getElementById: id => (els[id] = els[id] || makeEl(id)), createElement: () => makeEl(null) },
  window: { getSelection: () => '' },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
  confirm: () => confirmAnswer,
  setInterval: () => 1, clearInterval: () => {}
};
const api = new Function(...Object.keys(sandbox), script + '\nreturn { startLab, startExamMode, submitLab, nextHint, showSolution, resetLab, backHome, closeResult, nextExamLab, finishExam, editorSave, editorQuit, LabEngine, get exam() { return exam; }, get session() { return session; } };')(...Object.values(sandbox));
const $ = id => sandbox.document.getElementById(id);
const type = cmd => { $('termInput').value = cmd; $('termInput').listeners.keydown({ key: 'Enter', preventDefault() {} }); };
const key = (k, extra) => $('termInput').listeners.keydown(Object.assign({ key: k, preventDefault() {} }, extra));

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

test('home lists 6 labs in 3 areas', () => {
  assert.strictEqual(($('labList').innerHTML.match(/class="lab-card"/g) || []).length, 6);
  assert.strictEqual(($('labList').innerHTML.match(/class="area"/g) || []).length, 3);
  assert.match($('headerStats').textContent, /6 labs · 0 attempted/);
});
test('start lab shows the brief, objectives and prompt', () => {
  api.startLab('k8s-gpu-pod');
  assert.strictEqual($('labTitle').textContent, 'Run a GPU validation pod');
  assert.strictEqual(($('labObjectives').innerHTML.match(/<li>/g) || []).length, 4);
  assert.strictEqual($('termPrompt').textContent, 'root@bcm-head:~# ');
  assert.ok($('homeScreen').classList.contains('hidden'));
});
test('Enter runs a command and prints prompt + output', () => {
  type('kubectl get nodes');
  assert.match($('termOut').text, /root@bcm-head:~# kubectl get nodes/);
  assert.match($('termOut').text, /dgx-02 +Ready,SchedulingDisabled/);
});
test('history: ArrowUp recalls the last command, ArrowDown clears', () => {
  key('ArrowUp');
  assert.strictEqual($('termInput').value, 'kubectl get nodes');
  key('ArrowDown');
  assert.strictEqual($('termInput').value, '');
});
test('clear and Ctrl+L empty the terminal', () => {
  type('clear');
  assert.strictEqual($('termOut').children.length, 0);
  type('ls'); key('l', { ctrlKey: true });
  assert.strictEqual($('termOut').children.length, 0);
});
test('vi opens the editor modal; save writes the file', () => {
  type('vi gpu-test.yaml');
  assert.ok(!$('editorModal').classList.contains('hidden'));
  assert.match($('editorArea').value, /requests:/);
  $('editorArea').value = $('editorArea').value.replace('requests:', 'limits:');
  api.editorSave();
  assert.ok($('editorModal').classList.contains('hidden'));
  type('cat gpu-test.yaml');
  assert.match($('termOut').text, /limits:/);
});
test('editor quit without saving keeps the file', () => {
  type('vi gpu-test.yaml');
  $('editorArea').value = 'garbage';
  api.editorQuit();
  type('cat gpu-test.yaml');
  assert.ok(!/garbage/.test($('termOut').text));
});
test('hints reveal one at a time and disable at the end', () => {
  for (let i = 0; i < 4; i++) api.nextHint();
  assert.strictEqual($('hintBox').children.length, 4);
  assert.ok($('hintBtn').disabled);
});
test('submit marks objectives and saves the best score', () => {
  ['kubectl create ns ml-team', 'kubectl apply -f gpu-test.yaml', 'kubectl uncordon dgx-02', 'kubectl get pods -n ml-team', 'kubectl get pods -n ml-team'].forEach(type);
  api.submitLab();
  assert.strictEqual($('resultScore').textContent, '100%');
  assert.ok(!$('resultModal').classList.contains('hidden'));
  assert.strictEqual(JSON.parse(store['nvidia-ncp-aio-labs-v1'])['k8s-gpu-pod'], 100);
  api.closeResult();
});
test('viewing the solution prevents saving a new best score', () => {
  api.startLab('slurm-pending');
  api.showSolution();
  assert.ok(!$('solutionBox').classList.contains('hidden'));
  assert.match($('solutionBox').innerHTML, /scontrol update jobid=2211 qos=large/);
  api.submitLab();
  assert.match($('resultFlags').textContent, /solution viewed/);
  assert.ok(!('slurm-pending' in JSON.parse(store['nvidia-ncp-aio-labs-v1'])));
});
test('reset recreates the session; back returns home with the best score', () => {
  type('scontrol update partitionname=gpu state=up');
  api.resetLab();
  assert.strictEqual(api.session.st.slurm.partitions[1].state, 'DOWN');
  api.backHome();
  assert.ok(!$('homeScreen').classList.contains('hidden'));
  assert.match($('labList').innerHTML, /Best: 100%/);
});
test('exam mode: one lab per area, no hints, 3 labs then a final result', () => {
  api.startExamMode();
  const areas = api.exam.queue.map(id => api.LabEngine.LABS.find(l => l.id === id).area);
  assert.strictEqual(new Set(areas).size, 3);
  assert.ok($('hintBtn').disabled && $('solBtn').disabled);
  api.nextHint();
  assert.strictEqual($('hintBox').children.length, 0);
  for (let i = 0; i < 3; i++) { api.submitLab(); if (i < 2) api.nextExamLab(); }
  api.finishExam();
  assert.match($('resultTitle').textContent, /Exam simulation result/);
  assert.strictEqual($('resultScore').textContent, '0%');
  assert.strictEqual(api.exam, null);
});
test('exam time-up submits the current lab and ends the exam', () => {
  api.startExamMode();
  api.submitLab(true);
  assert.strictEqual($('resultTitle').textContent, 'Time is up');
  assert.match($('resultActions').innerHTML, /See exam result/);
  api.finishExam();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
