import FeederStockEditClient from './FeederStockEditClient'

interface PageProps {
  // Next.js 15: dynamic params are a Promise.
  params: Promise<{ id: string }>
}

export const metadata = {
  title: 'Edit feeder stock · Herpetoverse',
}

export default async function FeederStockEditPage({ params }: PageProps) {
  const { id } = await params
  return <FeederStockEditClient stockId={id} />
}
