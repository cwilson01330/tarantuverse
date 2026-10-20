// Crawlers that must get <title>/<meta>/<link rel=canonical> in <head>.
// Next 15 streams generateMetadata output into <body> for any user agent not
// on this list; parsers that only read <head> (and canonical, which is only
// valid in <head>) then see a page with no description. The first half is
// Next 15.5's own default list (shared/lib/router/utils/html-bots.js) — a
// custom value REPLACES it, so it's copied here; the second half adds the AI
// assistant and search crawlers. Keep in sync with web-herpetoverse.
const HTML_LIMITED_BOTS = new RegExp(
  [
    // Next default
    '[\\w-]+-Google', 'Google-[\\w-]+', 'Chrome-Lighthouse', 'Slurp', 'DuckDuckBot',
    'baiduspider', 'yandex', 'sogou', 'bitlybot', 'tumblr', 'vkShare',
    'quora link preview', 'redditbot', 'ia_archiver', 'Bingbot', 'BingPreview',
    'applebot', 'facebookexternalhit', 'facebookcatalog', 'Twitterbot',
    'LinkedInBot', 'Slackbot', 'Discordbot', 'WhatsApp', 'SkypeUriPreview',
    'Yeti', 'googleweblight',
    // AI assistants / AI search
    'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User',
    'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User', 'DuckAssistBot',
    'Amazonbot', 'meta-externalagent', 'MistralAI-User', 'CCBot',
  ].join('|'),
  'i',
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  htmlLimitedBots: HTML_LIMITED_BOTS,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
  // Ship the share-card fonts with the serverless functions (read via readFile).
  outputFileTracingIncludes: {
    '/api/card/*': ['./src/lib/share-card/fonts/*.ttf'],
    '/api/card-link/*': ['./src/lib/share-card/fonts/*.ttf'],
    '/api/og/**': ['./src/lib/share-card/fonts/*.ttf'],
  },
  // Backstop: never let the card routes trace in source, build caches or the
  // mobile apps (a runtime-built path once pulled in 430 MB).
  outputFileTracingExcludes: {
    '/api/card/*': ['./src/app/**', './.next/cache/**', '../mobile/**', '../mobile-herpetoverse/**', '../api/**'],
    '/api/card-link/*': ['./src/app/**', './.next/cache/**', '../mobile/**', '../mobile-herpetoverse/**', '../api/**'],
    '/api/og/**': ['./src/app/**', './.next/cache/**', '../mobile/**', '../mobile-herpetoverse/**', '../api/**'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async redirects() {
    return [
      // Redirect non-www to www for consistent cookies/OAuth.
      // EXCLUDE /.well-known/* — the Universal Link / App Link association
      // files (apple-app-site-association, assetlinks.json) must be served
      // with a direct 200 on BOTH hosts. A redirect here would break iOS/
      // Android domain verification, so the negative lookahead skips them.
      {
        source: '/:path((?!\\.well-known).*)',
        has: [{ type: 'host', value: 'tarantuverse.com' }],
        destination: 'https://www.tarantuverse.com/:path',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        // Apple requires the AASA (extension-less) to be served as JSON.
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        // Site-wide: send only the origin to other sites, never full paths.
        source: '/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }],
      },
      {
        // Sitter passes carry a live token in the URL fragment. Browsers never
        // send fragments anyway; these make the page itself as quiet as
        // possible: no Referer at all, never indexed, never cached.
        // Declared AFTER the site-wide rule so its Referrer-Policy wins.
        // (PRD-shared-keeping, T3.)
        source: '/sit',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        // Co-keeper invites carry a token in the fragment too (rung 3, T11).
        source: '/invite',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        // Printable sitter care sheets carry their token in the PATH
        // (routers/care_sheets.py): never send it on as a Referer, never
        // index or cache the page.
        source: '/care-sheet/:token*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ]
  },
  //
  // PostHog reverse proxy — routes analytics requests through our own
  // domain so they survive ad blockers / privacy extensions that block
  // third-party trackers. The PostHog provider sets `api_host: "/ingest"`,
  // and Next rewrites forward those requests to PostHog's servers.
  //
  // Uses `skipTrailingSlashRedirect` so PostHog's exact paths (e.g. `/e/`,
  // `/decide`) pass through unchanged — otherwise Next would 308 them.
  //
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: '/relay/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/relay/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ]
  },
}

module.exports = nextConfig
