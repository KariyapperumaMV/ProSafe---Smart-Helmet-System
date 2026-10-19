# ProSafe Research Website

Academic research website for **ProSafe: Machine Learning-Based Smart Helmet for Personalized Construction Monitoring**
(SLIIT IT4010 Research Project, project ID **R26-SE-042**, researcher Methya Vosadi Kariyapperuma, IT21200892).

The site is a static React application that presents the research as a short, interactive story
(content source: thesis V4, `V4-Thesis_Draft-IT21200892.docx`):

**Home → ProSafe** (problem, research gap, objectives, interactive 3D helmet) **→ Methodology** (research process,
architecture, ML pipeline, technologies) **→ Results** (ML, laboratory, testing, user acceptance, findings)
**→ Resources** (Milestones, Documents, Presentations) **→ About & Contact**.

All SLIIT-required sections (Home, Domain, Milestones, Documents, Presentations, About Us, Contact Us) remain available;
the Domain material is summarised in ProSafe and Methodology, and links used by the previous version of the site
(`#domain`, `#documents`, `#methodology-hardware`, ...) redirect to their new location.

It is completely independent of the ProSafe monitoring system: it has no backend, database, authentication or live sensor data,
and it does not call the ProSafe API.

## Tech stack

| Purpose | Tool |
| --- | --- |
| UI | React 18, JavaScript |
| Build | Vite 5 (static output in `dist/`) |
| Styling | Tailwind CSS 3 with the ProSafe design tokens (`src/styles/index.css`) |
| 3D | three.js, React Three Fiber, Drei (lazy-loaded only for the helmet viewer) |
| Icons | lucide-react, simple-icons (technology logos) |
| Font | Segoe UI (as in the ProSafe app), with self-hosted Inter as the fallback |
| Tests | Vitest, React Testing Library, jsdom |
| Hosting | Netlify (static site + Netlify Forms) |

## Project structure

```
ProSafe-Website/
├── public/
│   ├── documents/        Research documents (PDF) linked from the Documents section
│   ├── presentations/    Slide decks (PDF) linked from the Presentations section
│   ├── images/           Logo, helmet prototype photos, worker illustration
│   ├── screenshots/      Web application screenshots (gallery)
│   ├── videos/           Project videos (MP4) and poster images
│   ├── 404.html          Page shown by Netlify for unknown paths
│   ├── favicon.ico, favicon-32.png, apple-touch-icon.png, og-image.png
├── src/
│   ├── data/             ALL editable content (see "Updating content")
│   ├── components/
│   │   ├── layout/       Header (sticky nav, dropdowns, mobile menu), Footer, BackToTop
│   │   ├── ui/           Section, Reveal, Figure, FileCard, Cite, Icon, BrandIcon
│   │   └── helmet/       Interactive 3D helmet (procedural model, viewer, showcase + fallback)
│   ├── sections/         Home, ProSafe, Methodology, Results, Resources, About (+ Contact form)
│   ├── hooks/, lib/      Active-section tracking, navigation and formatting helpers
│   ├── styles/index.css  Design tokens and shared component classes
│   ├── test/             Test setup and data-integrity tests
│   ├── App.jsx, main.jsx
├── index.html            Metadata and the hidden Netlify form definition
├── netlify.toml          Build command, publish directory, headers
├── tailwind.config.js, postcss.config.js, vite.config.js, eslint.config.js
└── package.json
```

## 1. Running locally

Requires Node.js 18 or newer (Node 20 or 22 recommended).

```bash
cd ProSafe-Website
npm install
npm run dev
```

Open the address printed by Vite (normally http://localhost:5173).

The contact form does **not** send messages from the local development server; it shows a clear notice instead.
Submissions only work on the deployed Netlify site.

## 2. Building

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build locally
npm test           # run the automated tests
npm run lint       # run ESLint
```

The tests check, among other things, that every "available" document points to a real PDF whose size label is correct,
that unavailable items have no links, that every citation exists, and that the published ML metrics match
`../ProSafe-ML-V2/outputs/final_experiment_summary.csv` (skipped automatically if that file is not present).

The production build is about 24 MB: roughly 10 MB of site and PDFs plus the 14 MB UI/UX video. This is above the 20 MB limit
stated in the SLIIT website guidelines. To stay under it, host the video on YouTube (unlisted) and set `youtubeId` instead of `src`
(see "Screenshots, videos and the worker visual").

## 3. Deploying with Netlify Drop (no Git)

1. Run `npm run build`.
2. Open https://app.netlify.com/drop and drag the **`dist`** folder onto the page.
3. Netlify publishes the site and gives you a URL. You can rename the site under *Site configuration → Site details*.

Note: with Netlify Drop the build runs on your computer, so the canonical/Open Graph URL is not filled in automatically.
To include it, build with your site URL first:

```bash
# PowerShell
$env:SITE_URL="https://your-site-name.netlify.app"; npm run build
```

## 4. Deploying with GitHub integration

1. Push the repository to GitHub (the website lives in the `ProSafe-Website` folder of the main ProSafe repository).
2. In Netlify choose **Add new site → Import an existing project → GitHub** and select the repository.
3. Use these settings:

| Setting | Value |
| --- | --- |
| **Base directory** | `ProSafe-Website` |
| **Build command** | `npm run build` |
| **Publish directory** | `dist` (Netlify shows it as `ProSafe-Website/dist`) |
| Node version | 22 (already set in `netlify.toml`) |

4. Deploy. Every push to the selected branch rebuilds the site.

`netlify.toml` inside `ProSafe-Website` already contains the build command, publish directory, Node version and security headers,
so Netlify picks them up once the base directory is set. No other Netlify configuration in the repository is used or changed.

### Enable the contact form

1. After the first deploy, open *Site configuration → Forms* and make sure **form detection is enabled** (enable it and redeploy if needed).
2. A form named **`contact`** should appear. Submissions are listed there.
3. To receive submissions by email, add a notification under *Forms → Form notifications → Add notification → Email notification*.

The form includes a honeypot field for spam. It only reports success when Netlify accepts the submission; any failed
request shows an error message instead of pretending to send. Submit one test message after deploying to confirm it arrives.

### Canonical URL and social previews

During Netlify builds the site URL (`URL`) is added automatically as the canonical link and in the Open Graph tags.
For a custom domain, set an environment variable `SITE_URL` (e.g. `https://prosafe.example.com`) in Netlify.

## 5. Updating content

All text and links live in `src/data/`. You rarely need to touch components.

| File | What it controls |
| --- | --- |
| `site.js` | Researcher, supervisors, contact details (email, LinkedIn, photo), navigation, legacy anchors |
| `home.js` | Hero text, highlights, sensors, LED states |
| `prosafe.js` | Problem, research gaps, contribution, research question, objectives |
| `helmet.js` | 3D helmet components: numbered markers, approximate positions and descriptions |
| `methodology.js` | Research process, architecture, ML pipeline stages |
| `technologies.js` | Technology groups |
| `showcase.js` | Web application screenshots and project videos (sources, posters, captions) |
| `results.js` | ML, laboratory, testing and user acceptance results, findings, limitations, conclusion |
| `milestones.js` | Assessment dates, marks and status |
| `documents.js` | Documents and presentations |
| `references.js` | Reference list |

Common updates:

- **Contact email:** set `contact.email` in `site.js`. Mailto links and the "Open in email app" button appear automatically.
- **Researcher photo:** add an image to `public/images/` (e.g. `researcher.webp`) and set `researcher.photo: '/images/researcher.webp'`.
- **Milestone dates and marks:** edit `date`, `marks` (e.g. `'6%'`) and `status` (`'completed' | 'in-progress' | 'upcoming'`) in `milestones.js`.
- **Results:** all figures in `results.js` come from thesis V4 Chapter 3 and Appendices F and G. The tests cross-check the XGBoost rows
  against `ProSafe-ML-V2/outputs` (skipped if those files are absent).

### Adding a document or presentation later

1. Export it as PDF and copy it into `public/documents/` or `public/presentations/`.
   Use a lowercase, hyphenated file name, e.g. `prosafe-final-presentation.pdf`.
2. In `src/data/documents.js`, find the matching entry and set:
   - `status: 'available'`
   - `file: '/presentations/prosafe-final-presentation.pdf'`
   - `size`: the size as shown by `npm test` if it fails (e.g. `'2.3 MB'`), plus `pages` or `slides` and `date`.
3. Run `npm test` and `npm run build`, then redeploy.

Do not publish raw datasets, credentials or personal worker information.

## 6. Updating the deployed website

- **GitHub integration:** commit and push your changes; Netlify rebuilds and publishes automatically.
- **Netlify Drop:** run `npm run build` again and drag the new `dist` folder onto your site's *Deploys* page
  (*Deploys → drag and drop*), which replaces the previous version.

## Design notes

- Colours, radii and card styles are copied from the ProSafe web application (`ProSafe-Web/frontend/src/theme.css`), so the
  website matches the dashboard: near-black navy background, glass cards, safety green accent, and the same SAFE / WARNING /
  CRITICAL / EMERGENCY / UNCERTAIN status colours.
- All diagrams (research process, architecture, ML pipeline) are recreated as responsive HTML/SVG from the thesis figures.
- Dashboard screenshots are taken from the implemented application; worker names are blurred.
- The site respects `prefers-reduced-motion`, supports keyboard navigation (skip link, accessible dropdown, tabs and menu),
  and uses `#section` links so refreshes and direct links work without any server rewrites.

## The 3D helmet

- It is a **procedural, conceptual 3D reconstruction** built from three.js geometry (lathe shell, brim, ridge, harness and
  primitive sensor modules). No GLB/GLTF model, Blender file or CAD data exists for the prototype, so component positions
  follow the photographs in thesis Figure 2.4 only approximately; the ESP32 is not visible in any photograph, so its placement
  is illustrative. The page labels it accordingly.
- The viewer is code-split (`Helmet3DViewer` chunk, ~230 KB gzipped) and only loads when the section approaches the viewport.
  It renders on demand (no continuous rendering when idle or off-screen), and falls back to the prototype photographs and the
  accessible component list if WebGL is unavailable or the context is lost.
- To replace it with a measured model later: export an optimised `.glb` (Draco/meshopt compressed) into `public/models/`,
  load it in `src/components/helmet/HelmetModel.jsx` with Drei's `useGLTF`, and adjust the marker positions in `src/data/helmet.js`.

## Screenshots, videos and the worker visual

- **Screenshots** (`public/screenshots/`, listed in `src/data/showcase.js`): genuine ProSafe screens. The dashboards come from the
  thesis (worker names blurred); analytics and helmet management are frames from the UI/UX video with the browser and taskbar
  cropped. Keep any new screenshot free of personal data and export it as WebP (~1900 px wide).
- **Videos** (`src/data/showcase.js` → `videos`): each entry takes either `src` (an H.264 MP4 in `public/videos/`) or
  `youtubeId` (an unlisted YouTube video, embedded through youtube-nocookie only after the visitor presses Play).
  Nothing is downloaded until Play is pressed.
  - `prosafe-uiux` → `public/videos/prosafe-uiux.mp4` (re-encoded from `PP2/UI UX video.mp4`, 1080p30, 14 MB) and
    `public/videos/prosafe-uiux-poster.webp`.
  - `prosafe-demonstration` → not yet available. Add `public/videos/prosafe-demonstration.mp4` and a 1280×720 poster
    `public/videos/prosafe-demonstration-poster.webp`, then set `src`, `poster`, `duration`, `size` and an accurate `description`.
  - To compress a recording: `ffmpeg -i input.mp4 -vf fps=30 -c:v libx264 -preset slow -crf 30 -c:a aac -b:a 96k -movflags +faststart output.mp4`.
  - Large videos are better hosted on YouTube (unlisted) and referenced with `youtubeId`; this keeps the site small
    (the build is ~24 MB with the UI/UX video, above the 20 MB course-web limit but fine for Netlify).
- **Worker visual** (`src/data/home.js` → `workerVisual`): currently a labelled conceptual SVG illustration
  (`public/images/prosafe-worker-concept.svg`). To use a real photograph of the prototype being worn, add
  `public/images/prosafe-worker.webp` (about 1200×900, 4:3) and set `src` to it and `kind: 'photo'`; the caption updates automatically.

