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
  // Disable static optimization for error pages
  generateStaticParams: false,
}

module.exports = nextConfig
