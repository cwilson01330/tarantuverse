/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
