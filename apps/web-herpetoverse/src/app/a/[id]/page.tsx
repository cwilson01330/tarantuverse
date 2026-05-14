/**
 * Public animal profile route — destination of label QR codes.
 *
 * ADR-003 collapsed the per-taxon `/s/[id]` (snake) and `/l/[id]`
 * (lizard) routes into this one taxon-agnostic route. The backend
 * `/api/v1/a/{id}` endpoint returns the taxon in its payload, so the
 * shared ReptilePublicProfile renderer no longer needs a taxon prop.
 *
 * This file is the route entry that resolves the dynamic `[id]` param
 * and forwards to the shared renderer.
 */
import ReptilePublicProfile from '@/components/ReptilePublicProfile'

interface Params {
  id: string
}

export default async function PublicAnimalPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = await params
  return <ReptilePublicProfile animalId={id} />
}
