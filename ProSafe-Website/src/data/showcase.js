/**
 * Web application screenshots and project videos.
 *
 * Screenshots are genuine ProSafe application screens:
 *  - admin/worker dashboards: thesis Figures 2.9 and 2.10 (worker names blurred);
 *  - analytics and helmets: frames from the UI/UX walkthrough video
 *    (browser chrome and taskbar cropped; no personal data visible).
 */
export const platformIntro =
  'The ProSafe web application provides role-based interfaces for safety administrators and construction workers, supporting worker monitoring, safety alerts, helmet management and access to safety information.';

export const screenshots = [
  {
    id: 'admin-dashboard',
    title: 'Administrator dashboard',
    caption: 'Worker status overview, helmet health (online/offline), recent alerts and site weather.',
    src: '/screenshots/admin-dashboard.webp',
    width: 1918,
    height: 1039,
    alt: 'ProSafe administrator dashboard showing counts of workers, helmets online, alerts and safe workers, a worker status chart, helmet health and a list of recent transition alerts with worker names blurred.',
  },
  {
    id: 'worker-dashboard',
    title: 'Worker dashboard',
    caption: 'The worker’s own safety status first, then the assigned helmet, latest sensor readings and alerts.',
    src: '/screenshots/worker-dashboard.webp',
    width: 1911,
    height: 1071,
    alt: 'ProSafe worker dashboard showing the current safety status, the assigned helmet, the latest heart rate, body temperature, ambient temperature, noise, gas and UV readings, and recent alerts, with the worker name blurred.',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    caption: 'Daily, weekly and monthly summaries of alerts and helmet reporting, with a downloadable PDF report.',
    src: '/screenshots/analytics.webp',
    width: 1855,
    height: 910,
    alt: 'ProSafe analytics page with daily, weekly and monthly filters, summary cards for workers with activity, alerts, emergency events and helmet reporting rate, a safety events trend chart and an alert distribution chart.',
  },
  {
    id: 'helmets',
    title: 'Helmet management',
    caption: 'Administrators register helmets, filter assigned and unassigned units and view or remove them.',
    src: '/screenshots/helmets.webp',
    width: 1855,
    height: 910,
    alt: 'ProSafe helmet management page listing unassigned helmets PS-H-006 to PS-H-010 with view and delete actions and an Add Helmet button.',
  },
];

/**
 * Videos. Set `src` to a file in public/videos (MP4, H.264) or set
 * `youtubeId` for an unlisted YouTube video. Items without a source are
 * shown as "to be added" and never render a player.
 */
export const videos = [
  {
    id: 'prosafe-uiux',
    title: 'ProSafe Web Application | UI/UX Walkthrough',
    description:
      'A screen-recorded tour of the administrator and worker interfaces: dashboard, alert details, user and helmet management, analytics with PDF reports, settings and the worker’s own dashboard.',
    note: 'Recorded for Progress Presentation 2 (September 2026) on an earlier build: some screens show gas in ppm and a location map, whereas the final system reports a relative gas response and transmits no location.',
    src: '/videos/prosafe-uiux.mp4',
    poster: '/videos/prosafe-uiux-poster.webp',
    youtubeId: null,
    duration: '3:52',
    size: '14 MB',
  },
  {
    id: 'prosafe-demonstration',
    title: 'ProSafe | System Demonstration',
    description: 'A demonstration of the ProSafe prototype in operation will be added here once the recording is available.',
    note: null,
    src: null,
    poster: null,
    youtubeId: null,
    duration: null,
    size: null,
  },
];
