import { MetadataRoute } from 'next'

/**
 * robots.txt — allow crawling of public content (care guides, community,
 * marketing), keep crawl budget off auth-gated app shells (which are
 * client-rendered and useless to index), and point at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    'https://tarantuverse.com'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/messages', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
