// Saves the in-progress session to localStorage and offers to resume it after a reload.
// Loaded after the exam's inline script: wraps its global functions, no changes needed there.
(function () {
  const KEY = 'practice-exam:' + location.pathname.split('/').pop();

  // Fingerprint of the question bank: a saved session is discarded if questions, options
  // or answers changed (saved answers are option indexes, so they would no longer line up).
  let h = 0;
  const bank = JSON.stringify(ALL_QUESTIONS.map((q) => [q.question, q.options, q.correct]));
  for (let i = 0; i < bank.length; i++) h = (h * 31 + bank.charCodeAt(i)) | 0;
  const FINGERPRINT = ALL_QUESTIONS.length + ':' + h;

  let retry = false;

  function save(screen) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        fp: FINGERPRINT, ids: examQuestions.map((q) => q.id),
        currentIndex, answers, revealed, screen, retry, ts: Date.now(),
      }));
    } catch (e) { /* storage full or disabled: keep working without persistence */ }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    const banner = document.getElementById('resumeBanner');
    if (banner) banner.remove();
  }

  // Returns the saved session, null if none, or 'outdated' if the exam was updated since.
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s) return null;
      if (s.fp !== FINGERPRINT || !s.ids.length || s.ids.some((id) => !ALL_QUESTIONS[id])) return 'outdated';
      return s;
    } catch (e) { return null; }
  }

  function wrap(name, after) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      const r = orig.apply(this, arguments);
      after();
      return r;
    };
  }

  wrap('startExam', () => {
    retry = false; save('exam');
    const banner = document.getElementById('resumeBanner');
    if (banner) banner.remove();
  });
  wrap('retryWrong', () => {
    // retryWrong returns early (results stay on screen) when nothing was wrong.
    if (document.getElementById('examScreen').classList.contains('hidden')) return;
    retry = true; save('exam');
  });
  wrap('renderQuestion', () => save('exam'));
  wrap('showResults', () => save('results'));
  wrap('resetExam', clear);

  function resume(s) {
    examQuestions = s.ids.map((id) => ALL_QUESTIONS[id]);
    currentIndex = Math.min(s.currentIndex, examQuestions.length - 1);
    answers = s.answers || {};
    revealed = s.revealed || {};
    retry = !!s.retry;
    document.getElementById('resumeBanner').remove();
    document.getElementById('setupScreen').classList.add('hidden');
    document.getElementById('headerStats').innerHTML = `
    <div class="stat">Questions: <b>${examQuestions.length}</b></div>
    <div class="stat">Answered: <b id="answeredCount">${Object.keys(revealed).length}</b></div>
    <div class="stat">Score: <b id="liveScore">-</b></div>
    ${retry ? '<div class="stat" style="color:var(--orange)">Retry Mode</div>' : ''}
  `;
    if (s.screen === 'results') {
      showResults();
    } else {
      document.getElementById('examScreen').classList.remove('hidden');
      buildQuestionMap();
      renderQuestion();
    }
  }

  const saved = load();
  if (!saved) return;

  const banner = document.createElement('div');
  banner.id = 'resumeBanner';
  banner.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between;' +
    'background:var(--surface2);border:1px solid var(--border);border-left:4px solid var(--accent);' +
    'border-radius:8px;padding:14px 16px;margin-bottom:18px;';
  const setup = document.getElementById('setupScreen');
  setup.insertBefore(banner, setup.firstChild);

  if (saved === 'outdated') {
    banner.innerHTML = `<span style="font-weight:600;">Your previous session could not be restored: this exam's questions were updated since.</span>
    <button class="btn btn-secondary btn-small" id="discardBtn">OK</button>`;
    document.getElementById('discardBtn').onclick = clear;
    return;
  }

  const answered = Object.keys(saved.revealed || {}).length;
  const when = new Date(saved.ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  const label = saved.screen === 'results'
    ? `Finished session (${saved.ids.length} questions) — results from ${when}`
    : `Session in progress — question ${saved.currentIndex + 1} of ${saved.ids.length}, ${answered} answered (${when})`;

  banner.innerHTML = `<span style="font-weight:600;">${label}</span>
    <span style="display:flex;gap:8px;">
      <button class="btn btn-primary btn-small" id="resumeBtn">${saved.screen === 'results' ? 'View Results' : 'Resume'}</button>
      <button class="btn btn-secondary btn-small" id="discardBtn">Discard</button>
    </span>`;
  document.getElementById('resumeBtn').onclick = () => resume(saved);
  document.getElementById('discardBtn').onclick = clear;
})();
