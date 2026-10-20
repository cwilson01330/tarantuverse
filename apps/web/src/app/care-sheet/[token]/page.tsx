/**
 * Printable care sheet for a sitter (API: routers/care_sheets.py).
 *
 * Public, but the token in the path IS the access: noindex, disallowed in
 * robots.ts, never cached, kept out of analytics, and no Referer is ever sent
 * (photos load from our storage host with referrerPolicy no-referrer, so the
 * token can't leak to it). Print-first: light on paper whatever the theme,
 * one block per animal that never splits across pages.
 */
import type { Metadata } from 'next'
import { formatStage, INVERT_TAXA, isInvertTaxon, lifeStageLabel } from '@/lib/inverts'
import { groupByLocation } from '@/lib/locations'
import { feedingLine, loadCareSheet, sheetDay, type CareSheetAnimal, type FeedState } from '@/lib/care-sheet'
import PrintButton from './PrintButton'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

export const metadata: Metadata = {
  title: 'Care sheet',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

const PRINT_CSS = `
@page { margin: 12mm; }
.cs-animal { break-inside: avoid; page-break-inside: avoid; }
@media print {
  html, body { background: #fff !important; }
  .cs-root, .cs-root * { color: #000 !important; background-color: transparent !important; box-shadow: none !important; border-color: #9ca3af !important; }
  .cs-root .cs-feed { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cs-root .cs-feed-dont_feed { border-left: 6px solid #000 !important; }
  .cs-noprint { display: none !important; }
  .cs-root { padding: 0 !important; }
}
`

const TONE: Record<FeedState, string> = {
  feed: 'border-green-600 bg-green-50 dark:bg-green-900/20',
  not_due: 'border-gray-400 bg-gray-50 dark:bg-gray-800',
  dont_feed: 'border-red-600 bg-red-50 dark:bg-red-900/30',
  ask: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20',
  graze: 'border-sky-500 bg-sky-50 dark:bg-sky-900/20',
}

function animalTitle(a: CareSheetAnimal): string {
  return (
    a.name ||
    a.common_name ||
    a.scientific_name ||
    (isInvertTaxon(a.taxon) ? INVERT_TAXA[a.taxon].label : 'Unnamed')
  )
}

function metaLine(a: CareSheetAnimal): string {
  const parts: string[] = []
  const taxon = isInvertTaxon(a.taxon) ? INVERT_TAXA[a.taxon].label : null
  if (taxon) parts.push(a.kind === 'colony' ? `${taxon} colony` : taxon)
  if (a.sex) parts.push(a.sex === 'male' ? '♂ Male' : '♀ Female')
  if (a.life_stage) parts.push(lifeStageLabel(a.taxon, a.life_stage))
  if (a.current_instar != null && a.taxon) parts.push(formatStage(a.taxon, a.current_instar))
  return parts.join(' · ')
}

function Unavailable({ text }: { text: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
      <p className="max-w-md text-center text-gray-700 dark:text-gray-300">{text}</p>
    </main>
  )
}

function AnimalBlock({ a, generatedOn }: { a: CareSheetAnimal; generatedOn: string }) {
  const line = feedingLine(a, generatedOn)
  const sci = a.scientific_name && a.scientific_name !== animalTitle(a) ? a.scientific_name : null
  const common = a.common_name && a.common_name !== animalTitle(a) ? a.common_name : null
  const meta = metaLine(a)
  const safety = a.sections.find((s) => s.key === 'safety')
  const rest = a.sections.filter((s) => s.key !== 'safety')
  return (
    <article className="cs-animal rounded-xl border border-gray-300 dark:border-gray-700 p-4 mb-4 bg-white dark:bg-gray-900">
      <header className="flex items-start gap-3">
        {a.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.photo_url}
            alt=""
            width={56}
            height={56}
            referrerPolicy="no-referrer"
            className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-tight text-gray-900 dark:text-white">{animalTitle(a)}</h3>
          {(sci || common) && (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {sci && <i>{sci}</i>}
              {sci && common ? ' — ' : ''}
              {common}
            </p>
          )}
          {meta && <p className="text-xs text-gray-600 dark:text-gray-400">{meta}</p>}
        </div>
      </header>

      <div className={`cs-feed cs-feed-${line.tone} mt-3 rounded-lg border-l-4 px-3 py-2 ${TONE[line.tone]}`}>
        <p className="text-base font-bold text-gray-900 dark:text-white">{line.label}</p>
        {line.detail && <p className="text-sm text-gray-800 dark:text-gray-200">{line.detail}</p>}
      </div>

      {safety && safety.lines.length > 0 && (
        <ul className="mt-3 text-sm text-red-800 dark:text-red-300 list-disc pl-5">
          {safety.lines.map((l, i) => (
            <li key={i}>{l.text}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rest.map((s) => (
          <section key={s.key}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{s.title}</h4>
            <ul className="text-gray-900 dark:text-gray-100">
              {s.lines.map((l, i) => (
                <li key={i} className={s.key === 'note' ? 'whitespace-pre-wrap' : undefined}>
                  {l.text}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {a.substrate && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Substrate</h4>
            <p className="text-gray-900 dark:text-gray-100">{a.substrate}</p>
          </section>
        )}
      </div>
    </article>
  )
}

export default async function CareSheetPage({ params }: Params) {
  const { token } = await params
  const res = await loadCareSheet(token)
  if (res.status !== 'ok') {
    if (res.status === 'expired') return <Unavailable text="This care sheet has expired. Ask the keeper for a new link." />
    if (res.status === 'missing') return <Unavailable text="This care sheet isn't available. Ask the keeper for a new link." />
    return <Unavailable text="This care sheet can't be loaded right now. Try again in a minute." />
  }

  const sheet = res.sheet
  const groups = groupByLocation(sheet.animals, (a) => a.location)
  const showGroups = sheet.animals.some((a) => !!a.location)
  const r = sheet.routine
  const generated = sheetDay(sheet.generated_on)

  return (
    <main className="cs-root min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-4 py-6 sm:px-8">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Care sheet</h1>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Prepared by {sheet.keeper_name}
              {generated ? ` · ${generated}` : ''} · {sheet.animals.length}{' '}
              {sheet.animals.length === 1 ? 'animal' : 'animals'} · Temperatures in{' '}
              {sheet.units === 'metric' ? '°C' : '°F'}
            </p>
          </div>
          <PrintButton className="cs-noprint print:hidden px-4 py-2 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700" />
        </header>

        {sheet.note && (
          <section className="rounded-xl border-2 border-gray-900 dark:border-gray-200 p-4 mb-4 bg-white dark:bg-gray-900">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
              From {sheet.keeper_name}
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-gray-900 dark:text-white">{sheet.note}</p>
          </section>
        )}

        {(r.steps.length > 0 || r.contact_line || r.vet_contact) && (
          <section className="cs-animal rounded-xl border border-gray-300 dark:border-gray-700 p-4 mb-4 bg-white dark:bg-gray-900 text-sm">
            {r.steps.length > 0 && (
              <>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Routine</h2>
                <ol className="mt-1 list-decimal pl-5 text-gray-900 dark:text-gray-100">
                  {r.steps.map((s, i) => (
                    <li key={i}>{s.text}</li>
                  ))}
                </ol>
              </>
            )}
            {r.contact_line && <p className="mt-2 text-gray-900 dark:text-gray-100">Contact: {r.contact_line}</p>}
            {r.vet_contact && <p className="text-gray-900 dark:text-gray-100">Vet: {r.vet_contact}</p>}
          </section>
        )}

        {sheet.skipped > 0 && (
          <p className="cs-noprint print:hidden mb-4 text-sm text-gray-600 dark:text-gray-400">
            {sheet.skipped} {sheet.skipped === 1 ? 'animal is' : 'animals are'} no longer in this collection and
            {sheet.skipped === 1 ? " isn't" : " aren't"} shown.
          </p>
        )}

        {sheet.animals.length === 0 ? (
          <p className="text-gray-700 dark:text-gray-300">There are no animals on this sheet any more.</p>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              {showGroups && (
                <h2 className="mt-2 mb-2 text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                  📍 {g.label}
                </h2>
              )}
              {g.rows.map((a, i) => (
                <AnimalBlock key={`${g.key}-${i}`} a={a} generatedOn={sheet.generated_on} />
              ))}
            </div>
          ))
        )}

        <section className="cs-animal rounded-xl border border-gray-300 dark:border-gray-700 p-4 mb-4 bg-white dark:bg-gray-900 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">For every animal</h2>
          <ul className="mt-1 list-disc pl-5 text-gray-900 dark:text-gray-100">
            {sheet.house_rules.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          {r.emergency.length > 0 && (
            <>
              <h2 className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">If something goes wrong</h2>
              <ul className="mt-1 list-disc pl-5 text-gray-900 dark:text-gray-100">
                {r.emergency.map((e, i) => (
                  <li key={i}>{e.text}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <footer className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Printed from Tarantuverse · tarantuverse.com
          {sheet.expires_at && (
            <span className="cs-noprint print:hidden">
              {' '}· This link stops working {new Date(sheet.expires_at).toUTCString().replace(/:\d\d GMT$/, ' UTC')}
            </span>
          )}
        </footer>
      </div>
    </main>
  )
}
