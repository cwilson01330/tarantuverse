/** @type {import('next').NextConfig} */
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
  async redirects() {
    return [
      // Canonicalize to www
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'herpetoverse.com' }],
        destination: 'https://www.herpetoverse.com/:path*',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
