'use client'

import { Utensils } from 'lucide-react'
import { feedingFigures, feedingSentence, type CollectionAnalytics } from '@/lib/analyticsView'
import { CARD, CardHeading, Figure } from './AnalyticsParts'

/** Feedings, average gap and per-animal rate, plus the one honest sentence. */
export default function FeedingCard({ data }: { data: CollectionAnalytics }) {
  const figs = feedingFigures(data, true)
  const sentence = feedingSentence(data)
  return (
    <section aria-label="Feeding" className={`${CARD} flex flex-col gap-3 px-5 py-[18px]`}>
      <CardHeading icon={Utensils} title="Feeding" />
      <div className="flex flex-wrap gap-x-7 gap-y-3">
        <Figure value={figs.feedings} caption="feedings" />
        <Figure value={figs.between} caption="between, average" />
        <Figure value={figs.perAnimal} caption="per animal" />
      </div>
      {sentence && <p className="text-[13px] leading-[18px] text-theme-secondary">{sentence}</p>}
    </section>
  )
}
