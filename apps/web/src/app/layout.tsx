import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import { Analytics } from '@vercel/analytics/react'
import AppStructuredData from '@/components/AppStructuredData'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Tarantuverse - Tarantula Husbandry Tracking',
  description: 'Track your tarantula collection, breeding projects, and care routines',
  icons: {
    icon: '/logo-transparent.png',
    apple: '/logo.png',
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
          <Analytics />
        </Providers>
      </body>
    </html>
  )
}
