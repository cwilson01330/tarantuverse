/**
 * Legacy lizard detail route.
 *
 * ADR-003 follow-through: the snake- and lizard-shaped detail clients
 * collapsed into one taxon-agnostic screen at /app/reptiles/[id]. This
 * file is kept only so any straggler link to the old `lizards/` subpath
 * still resolves — it permanently redirects to the unified route.
 */
import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LegacyLizardDetailPage({ params }: PageProps) {
  const { id } = await params
  redirect(`/app/reptiles/${id}`)
}
