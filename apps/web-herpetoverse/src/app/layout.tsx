import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import SafeAnalytics from '@/components/SafeAnalytics'
import './globals.css'
import { PostHogProvider } from '@/components/PostHogProvider'
import { UnitsProvider } from '@/components/UnitsProvider'
import AppStructuredData from '@/components/AppStructuredData'
import { SITE } from '@/lib/app-listing'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
})

// Site-wide defaults; pages with their own metadata override them.
// No `openGraph.url` or `alternates.canonical` here: both are inherited by
// every page that doesn't set its own, which told crawlers that /pricing
// (and every other page) was the homepage. Set them per page instead.
const SITE_TITLE = 'Herpetoverse — Reptile & Amphibian Husbandry Tracker'
const SITE_DESCRIPTION =
  'Log feedings, sheds and weights for snakes, lizards, turtles, frogs and salamanders, plus free care sheets. Free for 5 animals on iOS, Android and web.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: 'Herpetoverse',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/logo.svg' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#0B0B0B',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* Server-rendered JSON-LD (the landing page is a client component). */}
        <AppStructuredData />
        <PostHogProvider>
          <UnitsProvider>{children}</UnitsProvider>
          <SafeAnalytics />
        </PostHogProvider>
      </body>
    </html>
  )
}
