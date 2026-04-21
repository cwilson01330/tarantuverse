import type { Metadata } from 'next'
import './globals.css'

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
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
