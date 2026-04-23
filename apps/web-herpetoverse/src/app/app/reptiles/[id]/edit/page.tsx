import EditReptileClient from './EditReptileClient'

interface PageProps {
  // Next.js 15 — dynamic params are a Promise.
  params: Promise<{ id: string }>
}

export const metadata = {
  title: 'Edit reptile · Herpetoverse',
}

export default async function EditReptilePage({ params }: PageProps) {
  const { id } = await params
  // Auth gate lives in /app/reptiles/layout.tsx; the fetch must run client-side
  // because the bearer token is in localStorage.
  return <EditReptileClient snakeId={id} />
}
