import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Herpetoverse — A husbandry platform for reptile keepers',
  description:
    'Track your reptiles with care. Built by the team behind Tarantuverse.',
  openGraph: {
    title: 'Herpetoverse',
    description:
      'A husbandry platform for reptile keepers. Built by the team behind Tarantuverse.',
    url: 'https://herpetoverse.com',
    siteName: 'Herpetoverse',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Herpetoverse',
    description: 'A husbandry platform for reptile keepers.',
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
        {children}
        <Analytics />
      </body>
    </html>
  )
}
