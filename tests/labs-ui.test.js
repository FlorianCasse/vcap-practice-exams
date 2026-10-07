#!/usr/bin/env node
// UI flow tests for NVIDIA_NCP-AIO_Labs.html, run against a minimal fake DOM (no dependencies).
// Tests inside one boot() share a page, like a user clicking through it: they run in order on purpose.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'NVIDIA_NCP-AIO_Labs.html'), 'utf8');
const script = html.slice(html.indexOf('// LAB-ENGINE-START'), html.lastIndexOf('</script>', html.indexOf('assets/js/pwa.js')));
const EXPORTS = ['startLab', 'startExamMode', 'submitLab', 'nextHint', 'showSolution', 'resetLab', 'backHome', 'closeResult', 'nextExamLab', 'finishExam', 'editorSave', 'editorQuit', 'resumeSession', 'discardSession', 'LabEngine', 'STORE_KEY', 'SESSION_KEY'];

function makeEl(id) {
  const classes = new Set();
  const el = {
    id, value: '', textContent: '', className: '', disabled: false, scrollTop: 0, scrollHeight: 0, children: [], listeners: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : on ? classes.add(c) : classes.delete(c)), contains: c => classes.has(c) },
    appendChild(c) { this.children.push(c); },
    addEventListener(t, fn) { this.listeners[t] = fn; },
    focus() {},
    get text() { return this.children.map(c => c.textContent || c.innerHTML).join('\n'); }
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._html ?? ''; }, set(v) { el._html = v; if (v === '') el.children = []; } });
  return el;
}

// Boots a fresh page. `store` is localStorage, shared between boots to simulate a reload.
function boot(store) {
  const els = {}, winListeners = {};
  const page = { now: Date.parse('2026-10-07T10:00:00Z'), timer: null, confirm: true, store };
  const sandbox = {
    document: { getElementById: id => (els[id] = els[id] || makeEl(id)), createElement: () => makeEl(null), querySelector: () => null },
    window: { getSelection: () => '', addEventListener: (t, fn) => { winListeners[t] = fn; } },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    confirm: () => page.confirm,
    setInterval: fn => { page.timer = fn; return 1; }, clearInterval: () => { page.timer = null; },
    Date: class extends Date { static now() { return page.now; } }
  };
  page.api = new Function(...Object.keys(sandbox), script + `\nreturn { ${EXPORTS.join(', ')}, get exam() { return exam; }, get session() { return session; }, get editorState() { return editorState; } };`)(...Object.values(sandbox));
  page.$ = id => sandbox.document.getElementById(id);
  page.type = cmd => { page.$('termInput').value = cmd; page.$('termInput').listeners.keydown({ key: 'Enter', preventDefault() {} }); };
  page.key = (k, extra) => page.$('termInput').listeners.keydown(Object.assign({ key: k, preventDefault() {} }, extra));
  page.unload = () => { const e = { returnValue: undefined, preventDefault() { this.prevented = true; } }; winListeners.beforeunload(e); return e; };
  page.advance = ms => { page.now += ms; if (page.timer) page.timer(); };
  return page;
}

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

const store = {};
let P = boot(store);
const { api, $, type, key } = P;

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
  type('date');
  assert.match($('termOut').text, /Wed Oct  7 \d\d:\d\d:\d\d UTC 2026/);
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
test('the lab is saved after each command and resumes after a reload', () => {
  type('kubectl create ns ml-team');
  const saved = JSON.parse(store[api.SESSION_KEY]);
  assert.strictEqual(saved.labId, 'k8s-gpu-pod');
  assert.ok(saved.actions.some(a => 'save' in a));
  const R = boot(store);
  assert.match(R.$('labList').innerHTML, /Resume your lab\?/);
  R.api.resumeSession();
  assert.ok(R.api.session.st.k8s.namespaces.some(n => n.name === 'ml-team'));
  assert.match(R.api.session.st.files['/root/gpu-test.yaml'], /limits:/);
  assert.match(R.$('termOut').text, /session restored/);
});
test('hints reveal one at a time and disable at the end', () => {
  for (let i = 0; i < 4; i++) api.nextHint();
  assert.strictEqual($('hintBox').children.length, 4);
  assert.ok($('hintBtn').disabled);
});
test('submit marks objectives and saves the best score', () => {
  ['kubectl apply -f gpu-test.yaml', 'kubectl uncordon dgx-02', 'kubectl get pods -n ml-team', 'kubectl get pods -n ml-team'].forEach(type);
  api.submitLab();
  assert.strictEqual($('resultScore').textContent, '100%');
  assert.ok(!$('resultModal').classList.contains('hidden'));
  assert.strictEqual(JSON.parse(store[api.STORE_KEY])['k8s-gpu-pod'], 100);
  api.closeResult();
});
test('declining the solution prompt keeps it hidden', () => {
  api.startLab('slurm-pending');
  P.confirm = false; api.showSolution(); P.confirm = true;
  assert.ok($('solutionBox').classList.contains('hidden'));
});
test('viewing the solution prevents saving a new best score', () => {
  api.showSolution();
  assert.match($('solutionBox').innerHTML, /scontrol update jobid=2211 qos=large/);
  api.submitLab();
  assert.match($('resultFlags').textContent, /solution viewed/);
  assert.ok(!('slurm-pending' in JSON.parse(store[api.STORE_KEY])));
  api.closeResult();
});
test('declining reset keeps the session; accepting recreates it', () => {
  type('scontrol update partitionname=gpu state=up');
  P.confirm = false; api.resetLab(); P.confirm = true;
  assert.strictEqual(api.session.st.slurm.partitions[1].state, 'UP');
  api.resetLab();
  assert.strictEqual(api.session.st.slurm.partitions[1].state, 'DOWN');
});
test('back returns home, shows the best score and clears the saved session', () => {
  api.backHome();
  assert.ok(!$('homeScreen').classList.contains('hidden'));
  assert.match($('labList').innerHTML, /Best: 100%/);
  assert.ok(!(api.SESSION_KEY in store));
});
test('exam mode: one lab per area, no hints, 3 labs then a final result', () => {
  api.startExamMode();
  const areas = api.exam.queue.map(id => api.LabEngine.LABS.find(l => l.id === id).area);
  assert.strictEqual(new Set(areas).size, 3);
  assert.ok($('hintBtn').disabled && $('solBtn').disabled);
  assert.match($('labTimer').textContent, /^60:00 · lab 1\/3$/);
  api.nextHint();
  assert.strictEqual($('hintBox').children.length, 0);
  for (let i = 0; i < 3; i++) { api.submitLab(); if (i < 2) api.nextExamLab(); }
  assert.match($('resultFlags').textContent, /Exam lab 3 of 3/);
  api.finishExam();
  assert.match($('resultTitle').textContent, /Exam simulation result/);
  assert.strictEqual($('resultScore').textContent, '0%');
  assert.strictEqual(api.exam, null);
});
test('leaving an exam asks first, and the page warns before unload', () => {
  api.startExamMode();
  assert.ok(P.unload().prevented);
  P.confirm = false; api.backHome(); P.confirm = true;
  assert.ok(api.exam);
  api.backHome();
  assert.strictEqual(api.exam, null);
  assert.ok(!P.unload().prevented);
});
test('time running out with the editor open submits the lab and closes the editor', () => {
  api.startExamMode();
  type('vi notes.txt');
  assert.ok(api.editorState);
  P.advance(61 * 60 * 1000);
  assert.strictEqual($('resultTitle').textContent, 'Time is up');
  assert.ok($('editorModal').classList.contains('hidden'));
  assert.strictEqual(api.editorState, null);
  assert.match($('resultActions').innerHTML, /See exam result/);
  api.finishExam();
});
test('time running out while a result is open still ends the exam', () => {
  api.startExamMode();
  api.submitLab();
  assert.match($('resultActions').innerHTML, /Next lab/);
  P.advance(61 * 60 * 1000);
  assert.strictEqual($('resultTitle').textContent, 'Time is up');
  assert.match($('resultActions').innerHTML, /See exam result/);
  api.finishExam();
  assert.strictEqual(api.exam, null);
});
test('an exam in progress resumes with its deadline after a reload', () => {
  api.startExamMode();
  const first = api.exam.queue[0];
  type('help');
  const R = boot(store);
  R.now = P.now;
  assert.match(R.$('labList').innerHTML, /Resume your exam simulation\?/);
  R.api.resumeSession();
  assert.strictEqual(R.api.exam.queue[0], first);
  assert.match(R.$('labTimer').textContent, /^60:00 · lab 1\/3$/);
  R.api.discardSession();
  api.backHome();
});

test('Ctrl+C on a prompt is kept when the lab is resumed', () => {
  api.startLab('slurm-pending');
  type('sacctmgr modify qos normal set MaxTRESPerUser=gres/gpu=16');
  key('c', { ctrlKey: true });
  type('scontrol update partitionname=gpu state=up');
  const R = boot(store);
  R.api.resumeSession();
  assert.strictEqual(R.api.session.st.slurm.partitions[1].state, 'UP');
  assert.strictEqual(R.api.session.st.slurm.qos.normal.maxGpuPU, 8);
  R.api.discardSession();
  api.backHome();
});
test('reloading after submitting an exam lab continues with the next lab', () => {
  api.startExamMode();
  const [first, second] = api.exam.queue;
  api.submitLab();
  const R = boot(store);
  R.now = P.now;
  R.api.resumeSession();
  assert.strictEqual(R.api.exam.idx, 1);
  assert.strictEqual(R.$('labTitle').textContent, R.api.LabEngine.LABS.find(l => l.id === second).title);
  assert.strictEqual(R.api.exam.results.filter(r => r.id === first).length, 1);
  R.api.discardSession();
  P.confirm = true; api.backHome();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
