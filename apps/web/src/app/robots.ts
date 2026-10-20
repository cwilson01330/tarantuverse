import { MetadataRoute } from 'next'

/**
 * robots.txt — allow crawling of public content (care guides, community,
 * marketing), keep crawl budget off auth-gated app shells (which are
 * client-rendered and useless to index), and point at the sitemap.
 *
 * Search and AI-assistant crawlers are ALSO listed by name, with the same
 * rules. A crawler that finds a group naming it ignores the `*` group
 * entirely, so every named group must repeat the full allow/disallow lists
 * (that's why they share PUBLIC_ALLOW / PRIVATE_DISALLOW). Naming them is a
 * deliberate decision (2026-10-19): the care guides and llms.txt are meant to
 * be read and quoted by assistants (ChatGPT, Claude, Perplexity, Copilot,
 * Apple, Gemini). Remove a name here to opt that crawler out.
 */

// Link-preview images must be fetchable: X/Twitter's card crawler honours
// robots.txt, and a disallowed og:image renders as nothing. Keep `/api/og/`,
// `/api/card-link/` and `/c/` allowed or share-card previews go blank.
const PUBLIC_ALLOW = ['/', '/api/og/', '/api/card-link/', '/c/']
// `/care-sheet/` pages are private sitter links (the token is the access).
const PRIVATE_DISALLOW = ['/dashboard', '/messages', '/api/', '/care-sheet/']

const NAMED_CRAWLERS = [
  // OpenAI — training, ChatGPT search index, live fetches for a user
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google AI (Gemini) and Apple Intelligence opt-in tokens
  'Google-Extended',
  'Applebot-Extended',
  // Search engines (Bing also feeds ChatGPT search and Copilot)
  'Bingbot',
  'Googlebot',
  'Applebot',
  'DuckDuckBot',
]

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    'https://www.tarantuverse.com'

  return {
    rules: [
      { userAgent: '*', allow: PUBLIC_ALLOW, disallow: PRIVATE_DISALLOW },
      { userAgent: NAMED_CRAWLERS, allow: PUBLIC_ALLOW, disallow: PRIVATE_DISALLOW },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
