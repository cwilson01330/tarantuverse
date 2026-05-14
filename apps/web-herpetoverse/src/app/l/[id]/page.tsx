/**
 * Legacy public lizard profile route.
 *
 * ADR-003 collapsed the per-taxon `/s/[id]` + `/l/[id]` routes into the
 * taxon-agnostic `/a/[id]`. This file is kept only so QR labels printed
 * before the consolidation still resolve — it permanently redirects to
 * the new route.
 */
import { redirect } from 'next/navigation'

interface Params {
  id: string
}

export default async function LegacyPublicLizardPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = await params
  redirect(`/a/${id}`)
}
