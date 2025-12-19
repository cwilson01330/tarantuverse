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
      // Redirect non-www to www for consistent cookies/OAuth
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'tarantuverse.com' }],
        destination: 'https://www.tarantuverse.com/:path*',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
