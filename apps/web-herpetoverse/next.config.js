/** @type {import('next').NextConfig} */
//
// Canonicalization note: we canonicalize on the APEX (herpetoverse.com),
// not www. That redirect is handled at the Vercel domain-config layer
// (www → 308 → apex). Do NOT add an app-level `redirects()` rule here
// for host canonicalization — doing so duplicates the rule and, if the
// direction disagrees with the Vercel domain, creates a redirect loop.
//
const nextConfig = {
  reactStrictMode: true,
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
