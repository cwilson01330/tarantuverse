import SnakeDetailClient from './SnakeDetailClient'

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
  return <SnakeDetailClient snakeId={id} />
}
