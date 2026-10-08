import { redirect } from 'next/navigation'

/** Retired (B5, 2026-10-07): husbandry fields live on the shared animal form. */
export default async function LegacyTarantulaHusbandry({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/dashboard/inverts/${encodeURIComponent(id)}/edit`)
}
