// Registers the service worker and drives the optional #offlineStatus badge.
(function () {
  const badge = document.getElementById('offlineStatus');

  function setBadge(text, color) {
    if (!badge) return;
    badge.textContent = text;
    badge.style.color = color;
    badge.style.borderColor = color;
    badge.style.display = 'inline-flex';
  }

  let ready = false;
  function refresh() {
    if (!navigator.onLine) setBadge(ready ? '✔ Offline mode — all exams available' : '⚠ Offline — exams not cached yet', ready ? '#4ADE80' : '#FBBF24');
    else if (ready) setBadge('✔ Available offline', '#4ADE80');
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      navigator.serviceWorker.ready.then(() => { ready = true; refresh(); });
    });
  }
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  refresh();
})();
