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
  // Ensure proper handling of pages and app directories
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  // Disable styled-jsx completely
  compiler: {
    styledComponents: false,
  },
  // Skip type checking and linting in production builds
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Experimental: use app directory without styled-jsx
  experimental: {
    optimizeCss: false,
  },
}

module.exports = nextConfig
