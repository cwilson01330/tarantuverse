/**
 * Legacy lizard edit route.
 *
 * ADR-003 follow-through: the edit clients collapsed into one
 * taxon-agnostic screen at /app/reptiles/[id]/edit. This file is kept
 * only so any straggler link still resolves — it permanently redirects
 * to the unified route.
 */
import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LegacyLizardEditPage({ params }: PageProps) {
  const { id } = await params
  redirect(`/app/reptiles/${id}/edit`)
}
