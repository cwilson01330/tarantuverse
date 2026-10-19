/**
 * Server layout for /contact — gives the (client) page its own title,
 * description and canonical instead of inheriting the homepage's.
 */
import type { Metadata } from 'next'
import { SITE } from '@/lib/app-listing'

const TITLE = 'Contact Tarantuverse'
const DESCRIPTION =
  'Questions, feedback or a bug to report? Contact the Tarantuverse team at support@tarantuverse.com or with the form on this page.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/contact` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE}/contact`,
    type: 'website',
    siteName: 'Tarantuverse',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
