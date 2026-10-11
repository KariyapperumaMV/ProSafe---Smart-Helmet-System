# ProSafe Research Website

Academic research website for **ProSafe: Machine Learning-Based Smart Helmet for Personalized Construction Monitoring**
(SLIIT IT4010 Research Project, project ID **R26-SE-042**, researcher Methya Vosadi Kariyapperuma, IT21200892).

The site is a static React application that follows the SLIIT research website structure:
**Home, Domain** (literature survey, research gap, research problem, objectives, methodology, technologies, evaluation and findings),
**Milestones, Documents, Presentations, About Us and Contact Us**.

It is completely independent of the ProSafe monitoring system: it has no backend, database, authentication or live sensor data,
and it does not call the ProSafe API.

## Tech stack

| Purpose | Tool |
| --- | --- |
| UI | React 18, JavaScript |
| Build | Vite 5 (static output in `dist/`) |
| Styling | Tailwind CSS 3 with the ProSafe design tokens (`src/styles/index.css`) |
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
│   ├── images/           Logo, helmet prototype photos, wiring diagram, dashboard screenshots
│   ├── 404.html          Page shown by Netlify for unknown paths
│   ├── favicon.ico, favicon-32.png, apple-touch-icon.png, og-image.png
├── src/
│   ├── data/             ALL editable content (see "Updating content")
│   ├── components/
│   │   ├── layout/       Header (sticky nav, Domain dropdown, mobile menu), Footer, BackToTop
│   │   ├── ui/           Section, Reveal, Tabs, Figure, FileCard, Cite, Icon, BrandIcon
│   │   └── diagrams/     Research process, architecture, ML pipeline, results chart
│   ├── sections/         Home, Domain (+ Methodology tabs), Milestones, Documents,
│   │                     Presentations, About, Contact
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

The production build is about 9.5 MB including all PDFs, which is within the 20 MB limit stated in the SLIIT website guidelines.

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
| `site.js` | Researcher, supervisors, contact details (email, LinkedIn, photo), navigation |
| `home.js` | Hero text, key facts, features and workflow |
| `domain.js` | Literature survey, research gap, problem, objectives |
| `methodology.js` | Methodology tabs, architecture, hardware, data, ML pipeline, real-time monitoring |
| `technologies.js` | Technology groups |
| `findings.js` | Experiment results, key findings, evaluation status, limitations, future work |
| `milestones.js` | Assessment dates, marks and status |
| `documents.js` | Documents and presentations |
| `references.js` | Reference list |

Common updates:

- **Contact email:** set `contact.email` in `site.js`. Mailto links and the "Open in email app" button appear automatically.
- **Researcher photo:** add an image to `public/images/` (e.g. `researcher.webp`) and set `researcher.photo: '/images/researcher.webp'`.
- **Milestone dates and marks:** edit `date`, `marks` (e.g. `'6%'`) and `status` (`'completed' | 'in-progress' | 'upcoming'`) in `milestones.js`.
- **Results:** when thesis Chapter 3 is final, update `findings.js`. Set `showExperimentResults = false` to hide the numeric results.

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
