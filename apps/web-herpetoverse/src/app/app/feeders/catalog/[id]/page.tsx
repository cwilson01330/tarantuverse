import FeederCareSheetClient from './FeederCareSheetClient'

interface PageProps {
  // Next.js 15: dynamic params are a Promise.
  params: Promise<{ id: string }>
}

export const metadata = {
  title: 'Feeder care sheet · Herpetoverse',
}

export default async function FeederCareSheetPage({ params }: PageProps) {
  const { id } = await params
  return <FeederCareSheetClient speciesId={id} />
}
