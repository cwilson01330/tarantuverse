/**
 * Server layout for /features — gives the (client) page its own title,
 * description and canonical instead of inheriting the homepage's.
 */
import type { Metadata } from 'next'
import { SITE } from '@/lib/app-listing'

const TITLE = 'Features: Feeding, Molt, Growth & Breeding Tracking | Tarantuverse'
const DESCRIPTION =
  'Log feedings, molts, growth and substrate changes for tarantulas, scorpions, centipedes, mantises and more. Photos, analytics, sitters, co-keepers and colonies.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/features` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE}/features`,
    type: 'website',
    siteName: 'Tarantuverse',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
