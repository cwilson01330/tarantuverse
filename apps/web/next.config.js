/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
  // Skip type checking and linting in production builds
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable all static optimization
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
  // Disable static exports for problematic pages
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  // Override webpack config to exclude styled-jsx
  webpack: (config, { isServer }) => {
    // Ignore styled-jsx completely
    config.resolve.alias = {
      ...config.resolve.alias,
      'styled-jsx': false,
      'styled-jsx/style': false,
    }

    // Add null-loader for styled-jsx if needed
    config.module.rules.push({
      test: /styled-jsx/,
      use: 'null-loader'
    })

    return config
  },
}

module.exports = nextConfig
