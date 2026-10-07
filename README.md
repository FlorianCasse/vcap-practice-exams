# VCAP Practice Exams

Interactive browser-based practice exams for VMware (VCAP / VCP-VCF) and NVIDIA certifications.

👉 **Live site: https://floriancasse.github.io/vcap-practice-exams/**

The repository is published via GitHub Pages. The landing page (`index.html`) lists every exam and links to it — just open the live site and pick an exam, no download required.

## Exams

### VMware

- **Automation** (3V0-21.25) - VCAP Automation 9.0
- **Networking** (3V0-41.24) - VCAP Networking 9.0
- **Operations** (3V0-22.25) - VCAP Operations 9.0
- **Storage** - VCAP Storage 9.0
- **VKS** - VCAP VKS Administrator 9.0
- **Architect** (2V0-13.25) - VCP-VCF Architect 9.0
- **Support** (2V0-15.25) - VCP-VCF Support 9.0
- **Administrator** (2V0-17.25) - VCP-VCF Administrator 9.0

### NVIDIA

- **AI Infrastructure and Operations** (NCA-AIIO) - NVIDIA-Certified Associate
- **AI Infrastructure** (NCP-AII) - NVIDIA-Certified Professional
- **AI Operations** (NCP-AIO) - NVIDIA-Certified Professional
- **Hard** versions of the three exams above: scenario-based questions with plausible distractors, weighted on the official blueprints
- **AI Operations Hands-on Labs** (NCP-AIO): terminal simulator of the exam's lab section (BCM, Slurm, Kubernetes)

Some exams include customized versions with priority/strength tagging per section.

## Features

- Configurable sessions: select specific sections to focus on
- Randomized question order
- Instant feedback with explanations
- Score breakdown by section
- Question map for navigation
- Responsive design: works on desktop, tablet (iPad), and mobile
- Touch-optimized: 44px minimum tap targets on touch devices
- Dark theme UI
- Works offline: installable as a Home Screen app (PWA), every exam cached on first visit
- Session resume: an in-progress exam survives a reload or app restart

## Usage

- **Online (recommended):** open https://floriancasse.github.io/vcap-practice-exams/ and choose an exam from the home page.
- **Local:** clone the repo and open `index.html` in any browser — it is the same landing page that lists all exams. You can also open any individual exam `.html` file directly. Offline mode needs the site served over HTTPS or `localhost`; pages opened as local files skip the service worker.

The site is hosted on GitHub Pages from this repository. No build step or dependencies required — everything is self-contained HTML/CSS/JS.

## Offline mode (iPad / airplane)

The site is a Progressive Web App: a service worker (`sw.js`) caches every exam, font and logo on first visit.

1. While online, open the live site in Safari on the iPad, then Share → **Add to Home Screen**.
2. Launch the app from the Home Screen while still online and wait for the **✔ Available offline** badge on its home page.
3. In airplane mode, open the app from the Home Screen — all exams work.

The Home Screen app has its own storage, separate from Safari: check the badge and study inside the app, not in a Safari tab. Home Screen apps are not subject to Safari's 7-day storage eviction, so the cache stays available.

The current session (questions, answers, position, results) is saved in `localStorage`; after a reload, a **Resume** banner lets you pick up where you left off.

**When adding or changing an exam:** add new files to `PRECACHE` in `sw.js` and bump `CACHE_VERSION`, otherwise the new exam is not available offline until it has been opened online once. Question fixes in existing exams reach installed apps on their own (pages are fetched network-first when online); a saved session for an exam whose questions changed is discarded with a notice. Each exam page must also include `assets/js/persist.js` and `assets/js/pwa.js` after its inline script, plus the PWA `<head>` tags (copy from an existing exam).
