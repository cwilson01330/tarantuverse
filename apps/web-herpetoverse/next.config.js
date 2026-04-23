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
}

module.exports = nextConfig
