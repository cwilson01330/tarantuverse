/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
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
  // Skip generating static error pages
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
  // Use dynamic rendering to avoid SSR issues with error pages
  experimental: {
    missingSuspenseWithCSRBailout: false,
    // Force runtime rendering for error pages to avoid styled-jsx SSR issues
    isrMemoryCacheSize: 0,
  },
  // Disable static generation for error pages
  generateStaticParams: false,
}

module.exports = nextConfig
