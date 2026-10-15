import { moltNote } from '@/lib/inverts'

/**
 * Per-taxon molting note (registry: MOLT_NOTES in lib/inverts.ts). Renders
 * nothing for a taxon without one. Used on the invert detail page, the molt
 * form and the care sheet so the wording lives in one place.
 */
export default function MoltNote({ taxon, className = '' }: { taxon: string | null | undefined; className?: string }) {
  const note = moltNote(taxon)
  if (!note) return null
  return (
    <p
      role="note"
      className={`text-xs leading-relaxed rounded-lg border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-3 py-2 ${className}`}
    >
      {note}
    </p>
  )
}
