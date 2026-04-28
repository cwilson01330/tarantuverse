/**
 * Public lizard profile route — destination of label QR codes.
 *
 * Mirror of /s/[id] — both routes funnel into the shared
 * ReptilePublicProfile component which dispatches the right
 * /s/{id} or /l/{id} backend call based on the taxon prop.
 */
import ReptilePublicProfile from '@/components/ReptilePublicProfile'

interface Params {
  id: string
}

export default async function PublicLizardPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = await params
  return <ReptilePublicProfile taxon="lizard" animalId={id} />
}
