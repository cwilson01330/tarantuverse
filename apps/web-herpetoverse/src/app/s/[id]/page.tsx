/**
 * Public snake profile route — destination of label QR codes.
 *
 * The page itself is a client component; this file is the route entry
 * that resolves the dynamic `[id]` param and forwards to the shared
 * ReptilePublicProfile renderer.
 */
import ReptilePublicProfile from '@/components/ReptilePublicProfile'

interface Params {
  id: string
}

export default async function PublicSnakePage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = await params
  return <ReptilePublicProfile taxon="snake" animalId={id} />
}
