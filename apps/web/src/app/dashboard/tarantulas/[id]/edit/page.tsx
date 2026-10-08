import { redirect } from 'next/navigation'

/** Retired (B5, 2026-10-07): tarantulas edit on the shared animal form. */
export default async function LegacyTarantulaEdit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/dashboard/inverts/${encodeURIComponent(id)}/edit`)
}
