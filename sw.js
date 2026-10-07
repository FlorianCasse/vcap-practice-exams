// Offline support: precache the whole site so it works without network.
// Pages are network-first (fresh when online), other assets stale-while-revalidate.
// Bump CACHE_VERSION when PRECACHE changes so installed apps re-download everything.
const CACHE_VERSION = 'v1';
const CACHE = 'practice-exams-' + CACHE_VERSION;
const NETWORK_TIMEOUT_MS = 3000;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'NVIDIA_NCA-AIIO_Practice_Exam.html',
  'NVIDIA_NCP-AII_Practice_Exam.html',
  'NVIDIA_NCP-AIO_Practice_Exam.html',
  'VCAP_Automation_Practice_Exam.html',
  'VCAP_Networking_Practice_Exam_Customized_for_Florian.html',
  'VCAP_Networking_Practice_Exam_Generic.html',
  'VCAP_Operations_Practice_Exam.html',
  'VCAP_Operations_Practice_Exam_Customized_for_Florian.html',
  'VCAP_Storage_Practice_Exam.html',
  'VCAP_VKS_Practice_Exam.html',
  'VCP_VCF_Administrator_Practice_Exam_2V0-17.25.html',
  'VCP_VCF_Architect_Practice_Exam_2V0-13.25.html',
  'VCP_VCF_Support_Practice_Exam_2V0-15.25.html',
  'assets/js/pwa.js',
  'assets/js/persist.js',
  'assets/fonts/Titillium-Regular.otf',
  'assets/fonts/Titillium-Semibold.otf',
  'assets/fonts/Titillium-Bold.otf',
  'assets/logo/itq-logo-white.png',
  'assets/logo/itq-glasses-orange.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/vendor/fontawesome/css/fontawesome.min.css',
  'assets/vendor/fontawesome/css/solid.min.css',
  'assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('practice-exams-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: answer from cache immediately (works in airplane mode),
// update the cached copy from the network when it is reachable.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          // Redirected responses can't be replayed for navigations (Safari rejects them).
          if (res.ok && !res.redirected) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      event.waitUntil(network);

      // Pages: network first so question fixes show up right away; fall back to
      // the cached copy when offline or when the network is slow (in-flight WiFi).
      if (cached && req.mode === 'navigate') {
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
        const res = await Promise.race([network, timeout]);
        return res && res.ok ? res : cached;
      }
      if (cached) return cached;
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('index.html');
      return Response.error();
    })
  );
});
