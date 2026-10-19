/**
 * Server layout for /blog — gives the (client) page its own title,
 * description and canonical instead of inheriting the homepage's.
 */
import type { Metadata } from 'next'
import { SITE } from '@/lib/app-listing'

const TITLE = 'Blog | Tarantuverse'
const DESCRIPTION =
  'News and guides from Tarantuverse.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/blog` },
  // Noindexed while the posts are placeholders (no bodies, links go to
  // "#"). Remove this, and add /blog back to sitemap.ts, once real posts exist.
  robots: { index: false, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE}/blog`,
    type: 'website',
    siteName: 'Tarantuverse',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
