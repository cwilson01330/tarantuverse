import AnimalDetailClient from './AnimalDetailClient'

interface PageProps {
  // Next.js 15: dynamic params are a Promise.
  params: Promise<{ id: string }>
}

export const metadata = {
  title: 'Reptile detail · Herpetoverse',
}

export default async function ReptileDetailPage({ params }: PageProps) {
  const { id } = await params
  // The detail page is authenticated — the auth gate lives in
  // /app/reptiles/layout.tsx, and the data fetch lives in the client
  // component because the token is in localStorage.
  //
  // ADR-003: one taxon-agnostic detail screen. The lizard-specific route
  // (/app/reptiles/lizards/[id]) redirects here.
  return <AnimalDetailClient animalId={id} />
}
