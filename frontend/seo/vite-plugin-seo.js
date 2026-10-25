import {
  AI_CRAWLERS,
  BILL_STEPS,
  DEFINITION,
  FAQ,
  FEATURES,
  PRIVATE_PATHS,
  PUBLIC_PAGES,
  SITE,
  absoluteUrl,
  siteJsonLd,
} from '../src/seo/content.js';

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// `<` is escaped so a stray "</script>" inside the data cannot end the tag early.
const jsonLdTag = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function buildHead(siteUrl) {
  const canonical = siteUrl ? absoluteUrl(siteUrl, '/') : null;
  const image = absoluteUrl(siteUrl, SITE.image);
  const ogLocale = SITE.locale === 'en' ? 'en_US' : SITE.locale;

  return [
    `<title>${escapeHtml(SITE.title)}</title>`,
    `<meta name="description" content="${escapeHtml(SITE.description)}" />`,
    `<meta name="keywords" content="${escapeHtml(SITE.keywords.join(', '))}" />`,
    '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />',
    `<meta name="theme-color" content="${SITE.themeColor}" />`,
    canonical ? `<link rel="canonical" href="${canonical}" />` : '',
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeHtml(SITE.name)}" />`,
    `<meta property="og:locale" content="${ogLocale}" />`,
    `<meta property="og:title" content="${escapeHtml(SITE.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(SITE.description)}" />`,
    canonical ? `<meta property="og:url" content="${canonical}" />` : '',
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escapeHtml(SITE.imageAlt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(SITE.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(SITE.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(SITE.imageAlt)}" />`,
    '<link rel="icon" type="image/svg+xml" href="/icon.svg" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<link rel="manifest" href="/manifest.webmanifest" />',
    ...siteJsonLd(siteUrl).map(jsonLdTag),
  ]
    .filter(Boolean)
    .join('\n    ');
}

/**
 * What a crawler that does not run JavaScript (most AI crawlers, link
 * previewers, text browsers) sees instead of an empty `<div id="root">`. It
 * mirrors the visible landing page, generated from the same data.
 */
function buildNoscript() {
  return `<noscript>
      <main style="max-width:44rem;margin:3rem auto;padding:0 1.25rem;font-family:system-ui,sans-serif;line-height:1.6;color:#1c1d21">
        <h1>Ledger: expense tracker with AI bill scanning</h1>
        <p>${escapeHtml(DEFINITION)}</p>
        <h2>What Ledger does</h2>
        <ul>${FEATURES.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        <h2>How to scan a bill</h2>
        <ol>${BILL_STEPS.map((step) => `<li><strong>${escapeHtml(step.name)}.</strong> ${escapeHtml(step.text)}</li>`).join('')}</ol>
        <h2>Frequently asked questions</h2>
        ${FAQ.map((item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`).join('')}
        <p>Ledger needs JavaScript to run. Enable JavaScript in your browser to sign in.</p>
      </main>
    </noscript>`;
}

function buildRobots(siteUrl) {
  const rules = PRIVATE_PATHS.map((path) => `Disallow: ${path}`).join('\n');
  const agents = ['*', ...AI_CRAWLERS].map((agent) => `User-agent: ${agent}`).join('\n');

  return [
    '# Ledger: the public pages are open to search engines and AI assistants.',
    '# Everything behind sign-in is private and not meant to be crawled.',
    agents,
    'Allow: /',
    rules,
    siteUrl ? `\nSitemap: ${absoluteUrl(siteUrl, '/sitemap.xml')}` : '',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n')
    .concat('\n');
}

function buildSitemap(siteUrl) {
  if (!siteUrl) return null;
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PUBLIC_PAGES.map(
    (page) =>
      `  <url>\n    <loc>${absoluteUrl(siteUrl, page.path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function buildLlms(siteUrl) {
  const pages = PUBLIC_PAGES.map(
    (page) => `- [${page.title}](${absoluteUrl(siteUrl, page.path)}): ${page.description}`
  ).join('\n');

  return `# ${SITE.name}

> ${DEFINITION}

Ledger is for individuals who want to see where their money goes. Amounts can be recorded in PKR, USD, EUR, GBP and INR. Bill scanning reads Pakistani-style documents (day-first dates, "Rs" amounts), and the assistant understands English, Roman Urdu and Urdu.

## Pages

${pages}

## What it does

${FEATURES.map((item) => `- ${item}`).join('\n')}

## How to scan a bill

${BILL_STEPS.map((step, index) => `${index + 1}. ${step.name}: ${step.text}`).join('\n')}

## Frequently asked questions

${FAQ.map((item) => `### ${item.question}\n\n${item.answer}`).join('\n\n')}

## Notes for assistants

- The dashboard, transactions, bills, analytics and settings pages sit behind sign-in and contain private user data. They are not public and are not indexed.
- This file is generated from the same content as the landing page. If a detail here conflicts with the page, the page is correct.
`;
}

/**
 * Search, answer-engine and AI-assistant discovery for the single-page app.
 *
 * Injects metadata and structured data into `index.html`, and produces
 * `robots.txt`, `sitemap.xml` and `llms.txt`. The absolute site URL comes from
 * `VITE_SITE_URL`. Without it the plugin still works but leaves out everything
 * that must be absolute (canonical, `og:url`, sitemap) rather than publishing
 * wrong addresses, and says so during the build.
 */
export default function seoPlugin() {
  let siteUrl = '';
  let isBuild = false;

  const files = () => ({
    '/robots.txt': { type: 'text/plain', body: buildRobots(siteUrl) },
    '/sitemap.xml': { type: 'application/xml', body: buildSitemap(siteUrl) },
    '/llms.txt': { type: 'text/plain', body: buildLlms(siteUrl) },
  });

  return {
    name: 'ledger-seo',

    configResolved(config) {
      isBuild = config.command === 'build';
      siteUrl = String(config.env.VITE_SITE_URL || '')
        .trim()
        .replace(/\/+$/, '');

      if (isBuild && !siteUrl) {
        config.logger.warn(
          '\n[seo] VITE_SITE_URL is not set. The canonical URL, og:url and sitemap.xml are left out. ' +
            'Set it (for example https://ledger.example.com) before deploying.\n'
        );
      }
    },

    transformIndexHtml(html) {
      return html
        .replace('<!--seo:head-->', buildHead(siteUrl))
        .replace('<!--seo:noscript-->', buildNoscript());
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0];
        const file = files()[path];
        if (!file || file.body === null) return next();

        res.setHeader('Content-Type', `${file.type}; charset=utf-8`);
        res.end(file.body);
        return undefined;
      });
    },

    generateBundle() {
      if (!isBuild) return;
      for (const [path, file] of Object.entries(files())) {
        if (file.body === null) continue;
        this.emitFile({ type: 'asset', fileName: path.slice(1), source: file.body });
      }
    },
  };
}
