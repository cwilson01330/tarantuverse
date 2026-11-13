'use client'

/**
 * Egg sacs on an animal's detail page: the mother's list of sacs (or
 * oothecae, broods), each with its status, linking through to the sac.
 *
 * Shown to keepers only, for female / unknown-sex animals of taxa with the
 * eggSacs module. It stays visible when the animal is closed (a mother that
 * died after laying still has sacs to hatch); only "Log ..." is hidden then.
 * The page fetches the list and passes it in. Web counterpart of the mobile
 * EggSacsCard. Colours come from the theme tokens (CSS variables) the
 * neighbouring Sections use, so light and dark follow the page.
 */
import Link from 'next/link'
import { sacStatus, sacStatusLabel } from '@/lib/broods'
import { clutchSectionLabel, clutchSingularLabel, isLiveBirth, taxonHasModule } from '@/lib/inverts'
import { logSacLabel, showEggSacsCard, type EggSac } from '@/lib/eggSacs'
import { formatLocalDate } from '@/lib/date'

interface Props {
  invert: { id: string; taxon: string; sex: string | null | undefined; name: string }
  canKeep: boolean
  isClosed: boolean
  /** null while loading or if the load failed. */
  sacs: EggSac[] | null
}

export default function EggSacsCard({ invert, canKeep, isClosed, sacs }: Props) {
  if (!showEggSacsCard(taxonHasModule(invert.taxon, 'eggSacs'), invert.sex, canKeep)) return null

  const live = isLiveBirth(invert.taxon)
  const logLabel = logSacLabel(clutchSingularLabel(invert.taxon))

  return (
    <div className="bg-surface border border-theme rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-theme-primary">{clutchSectionLabel(invert.taxon)}</h2>
        {!isClosed && (
          <Link
            href={`/dashboard/inverts/${invert.id}/add-egg-sac`}
            className="text-sm font-semibold text-primary-600 hover:underline"
          >
            {logLabel}
          </Link>
        )}
      </div>
      {sacs === null ? null : sacs.length === 0 ? (
        <p className="text-sm text-theme-tertiary">
          {isClosed ? 'None recorded.' : `None yet. Choose "${logLabel}" when ${invert.name} lays one.`}
        </p>
      ) : (
        <div className="space-y-2">
          {sacs.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/breeding/egg-sacs/${s.id}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-theme hover:border-primary-600 transition"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-theme-primary truncate">
                  {formatLocalDate(s.laid_date)}
                </p>
                <p className="text-xs text-theme-tertiary truncate">
                  {sacStatusLabel(sacStatus(s), live)}
                  {s.pairing_id ? '' : ' · No pairing recorded'}
                </p>
              </div>
              <span className="text-theme-tertiary text-xl" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
