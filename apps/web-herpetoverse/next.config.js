/** @type {import('next').NextConfig} */
//
// Canonicalization note: we canonicalize on the APEX (herpetoverse.com),
// not www. That redirect is handled at the Vercel domain-config layer
// (www → 308 → apex). Do NOT add an app-level `redirects()` rule here
// for host canonicalization — doing so duplicates the rule and, if the
// direction disagrees with the Vercel domain, creates a redirect loop.
//
// Crawlers that must get <title>/<meta>/<link rel=canonical> in <head>.
// Next 15 streams generateMetadata output into <body> for any user agent not
// on this list. First half = Next 15.5's default list (a custom value
// REPLACES it); second half = AI assistant / AI search crawlers. Keep in sync
// with apps/web/next.config.js.
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

const nextConfig = {
  reactStrictMode: true,
  htmlLimitedBots: HTML_LIMITED_BOTS,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
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
    ]
  },
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
