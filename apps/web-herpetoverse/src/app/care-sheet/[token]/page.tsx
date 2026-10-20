/**
 * Printable care sheet for a sitter (API: routers/care_sheets.py).
 *
 * Public, but the token in the path IS the access: noindex, disallowed in
 * public/robots.txt, never cached, kept out of analytics, no Referer sent
 * (next.config.js headers + metadata below). The sheet is read here on the
 * server and drawn by CareSheetView (a client component only because the
 * taxon registry and location grouping live in client modules).
 */
import type { Metadata } from 'next'
import { loadCareSheet } from '@/lib/careSheet'
import CareSheetView from './CareSheetView'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

export const metadata: Metadata = {
  title: 'Care sheet · Herpetoverse',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

function Unavailable({ text }: { text: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <p className="max-w-md text-center text-neutral-300">{text}</p>
    </main>
  )
}

export default async function CareSheetPage({ params }: Params) {
  const { token } = await params
  const res = await loadCareSheet(token)
  if (res.status !== 'ok') {
    if (res.status === 'expired') return <Unavailable text="This care sheet has expired. Ask the keeper for a new link." />
    if (res.status === 'missing') return <Unavailable text="This care sheet isn't available. Ask the keeper for a new link." />
    return <Unavailable text="This care sheet can't be loaded right now. Try again in a minute." />
  }
  return <CareSheetView sheet={res.sheet} />
}
