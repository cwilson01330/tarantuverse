import LizardDetailClient from './LizardDetailClient'

interface PageProps {
  // Next.js 15: dynamic params are a Promise.
  params: Promise<{ id: string }>
}

export const metadata = {
  title: 'Reptile detail · Herpetoverse',
}

export default async function LizardDetailPage({ params }: PageProps) {
  const { id } = await params
  // Auth gate lives in /app/reptiles/layout.tsx. The data fetch runs in the
  // client component because the bearer token is in localStorage.
  //
  // Lizards live under a `lizards/` subpath so existing snake bookmarks
  // (/app/reptiles/{id}) keep resolving to the snake detail page. See
  // /app/reptiles/page.tsx's detailHref for the routing contract.
  return <LizardDetailClient lizardId={id} />
}
