import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Adds a canonical link and absolute Open Graph URLs once the public URL is
 * known. Netlify exposes the site's primary URL as `URL` during builds, and
 * `SITE_URL` can be set manually for any other host. Without either, the
 * relative tags already present in index.html are left as they are.
 */
function siteUrlPlugin() {
  const siteUrl = (process.env.SITE_URL || process.env.URL || '').replace(/\/+$/, '');
  return {
    name: 'prosafe-site-url',
    transformIndexHtml(html) {
      if (!siteUrl) return html;
      return html
        .replace('content="/og-image.png"', `content="${siteUrl}/og-image.png"`)
        .replace('<meta property="og:url" content="/" />', `<meta property="og:url" content="${siteUrl}/" />`)
        .replace('</head>', `    <link rel="canonical" href="${siteUrl}/" />\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), siteUrlPlugin()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    // three.js is isolated in the lazily loaded 3D viewer chunk (~230 KB gzipped).
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
});
