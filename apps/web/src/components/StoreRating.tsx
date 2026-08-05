/**
 * The store rating, shown plainly next to the download badges.
 *
 * Exists because of a Google guideline and a principle that happen to agree:
 * a rating in structured data should be visible to the person reading the page.
 * Marking up a score the visitor can't see is the kind of thing that earns a
 * manual action, and it's also just quietly dishonest.
 *
 * The count is rendered at the same weight as the average, never as a footnote.
 * Two five-star ratings is a real, early, small number — presenting it as "5.0"
 * alone would imply a track record that doesn't exist yet. Renders nothing when
 * there's no rating, rather than showing an empty shell.
 */
import { APP_RATING, APP_STORE_URL } from '@/lib/app-listing'

export default function StoreRating() {
  if (!APP_RATING) return null

  const { value, count, best, source } = APP_RATING
  const label = `${value} out of ${best} from ${count} ${
    count === 1 ? 'rating' : 'ratings'
  } on the ${source}`

  // Rounded for the glyphs only; the number beside them is the real value.
  const filled = Math.round(value)

  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition"
    >
      <span aria-hidden="true" className="text-yellow-400 tracking-tight">
        {'★'.repeat(filled)}
        {'☆'.repeat(Math.max(0, best - filled))}
      </span>
      <span>
        <span className="font-semibold text-gray-200">{value.toFixed(1)}</span>
        {' · '}
        {count} {count === 1 ? 'rating' : 'ratings'} on the {source}
      </span>
    </a>
  )
}
