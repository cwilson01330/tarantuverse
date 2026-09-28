import type { Metadata } from 'next'

// Belt and braces with the X-Robots-Tag header in next.config.js: a sitter
// pass is never something a search engine should see.
export const metadata: Metadata = {
  title: 'Feeding list · Tarantuverse',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

export default function SitLayout({ children }: { children: React.ReactNode }) {
  return children
}
