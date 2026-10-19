/**
 * Server layout for /help — gives the (client) page its own title,
 * description and canonical instead of inheriting the homepage's.
 */
import type { Metadata } from 'next'
import { SITE } from '@/lib/app-listing'

const TITLE = 'Help Center | Tarantuverse'
const DESCRIPTION =
  'Help with Tarantuverse: getting started, managing your collection, logging feedings and molts, photos, community features, and account and billing.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/help` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE}/help`,
    type: 'website',
    siteName: 'Tarantuverse',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
