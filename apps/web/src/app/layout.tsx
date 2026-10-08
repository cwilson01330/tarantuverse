import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import SafeAnalytics from '@/components/SafeAnalytics'
import AppStructuredData from '@/components/AppStructuredData'
import { SITE } from '@/lib/app-listing'

const inter = Inter({ subsets: ['latin'] })

const SITE_TITLE = 'Tarantuverse - Tarantula and Invertebrate Husbandry Tracking'
const SITE_DESCRIPTION =
  'Track your tarantulas, scorpions, mantises, isopods, and other invertebrates: feedings, molts, breeding projects, and care routines'

// Site-wide defaults. Pages with their own metadata (care guides, share
// cards) override these. Open Graph lives here so a bare tarantuverse.com
// link pasted into TikTok, Instagram or a text shows a title and image
// instead of an empty preview.
//
// No `alternates.canonical` here on purpose: a canonical in the root layout
// is inherited by every page that doesn't set its own, which would tell
// search engines that every page is a copy of the homepage. Canonicals are
// set per page.
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  icons: {
    icon: '/logo-transparent.png',
    apple: '/logo.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Tarantuverse',
    title: SITE_TITLE,
    description:
      'Log feedings, molts and care for tarantulas, jumping spiders, scorpions and more. Free for up to 15 animals on iOS, Android and the web.',
    images: [{ url: '/logo.png', alt: 'Tarantuverse' }],
  },
  twitter: {
    card: 'summary',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/logo.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Emitted from the root layout, which is a server component, so the
            markup is in the initial HTML. The landing page is a client
            component with a loading branch — putting it there would have
            server-rendered the spinner and left crawlers nothing to read. */}
        <AppStructuredData />
      </head>
      <body className={inter.className}>
        <Providers>
          {children}
          <SafeAnalytics />
        </Providers>
      </body>
    </html>
  )
}
