import FeederStockDetailClient from './FeederStockDetailClient'

interface PageProps {
  // Next.js 15: dynamic params are a Promise.
  params: Promise<{ id: string }>
}

export const metadata = {
  title: 'Feeder stock · Herpetoverse',
}

export default async function FeederStockDetailPage({ params }: PageProps) {
  const { id } = await params
  // Auth gate lives in /app/layout.tsx; the token is in localStorage so the
  // data fetch happens in the client component.
  return <FeederStockDetailClient stockId={id} />
}
