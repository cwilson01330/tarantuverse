'use client'

/**
 * The printable sheet, Herpetoverse styling: dark on screen, plain black on
 * white on paper whatever the screen looks like, one block per animal that
 * never splits across pages.
 */
import { ANIMAL_TAXA, type AnimalTaxon } from '@/lib/animals'
import { groupByLocation } from '@/lib/locations'
import { feedingLine, sheetDay, type CareSheet, type CareSheetAnimal, type FeedState } from '@/lib/careSheet'

const PRINT_CSS = `
@page { margin: 12mm; }
.cs-animal { break-inside: avoid; page-break-inside: avoid; }
@media print {
  html, body { background: #fff !important; color: #000 !important; }
  .cs-root, .cs-root * { color: #000 !important; background-color: transparent !important; box-shadow: none !important; border-color: #9ca3af !important; }
  .cs-root .cs-feed { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cs-root .cs-feed-dont_feed { border-left: 6px solid #000 !important; }
  .cs-noprint { display: none !important; }
  .cs-root { padding: 0 !important; }
}
`

const TONE: Record<FeedState, string> = {
  feed: 'border-herp-green bg-herp-green/10',
  not_due: 'border-neutral-600 bg-neutral-900',
  dont_feed: 'border-red-500 bg-red-500/10',
  ask: 'border-amber-500 bg-amber-500/10',
  graze: 'border-herp-teal bg-herp-teal/10',
}

function taxonLabel(taxon: string | null): string | null {
  return taxon ? ANIMAL_TAXA[taxon as AnimalTaxon]?.label ?? null : null
}

function animalTitle(a: CareSheetAnimal): string {
  return a.name || a.common_name || a.scientific_name || taxonLabel(a.taxon) || 'Unnamed'
}

function metaLine(a: CareSheetAnimal): string {
  const parts: string[] = []
  const t = taxonLabel(a.taxon)
  if (t) parts.push(t)
  if (a.sex) parts.push(a.sex === 'male' ? '♂ Male' : '♀ Female')
  return parts.join(' · ')
}

function AnimalBlock({ a, generatedOn }: { a: CareSheetAnimal; generatedOn: string }) {
  const line = feedingLine(a, generatedOn)
  const title = animalTitle(a)
  const sci = a.scientific_name && a.scientific_name !== title ? a.scientific_name : null
  const common = a.common_name && a.common_name !== title ? a.common_name : null
  const meta = metaLine(a)
  const safety = a.sections.find((s) => s.key === 'safety')
  const rest = a.sections.filter((s) => s.key !== 'safety')
  return (
    <article className="cs-animal rounded-lg border border-neutral-800 bg-neutral-950 p-4 mb-4">
      <header className="flex items-start gap-3">
        {a.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.photo_url}
            alt=""
            width={56}
            height={56}
            referrerPolicy="no-referrer"
            className="h-14 w-14 rounded-md object-cover flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-tight text-white">{title}</h3>
          {(sci || common) && (
            <p className="text-sm text-neutral-300">
              {sci && <i>{sci}</i>}
              {sci && common ? ' — ' : ''}
              {common}
            </p>
          )}
          {meta && <p className="text-xs text-neutral-500">{meta}</p>}
        </div>
      </header>

      <div className={`cs-feed cs-feed-${line.tone} mt-3 rounded-md border-l-4 px-3 py-2 ${TONE[line.tone]}`}>
        <p className="text-base font-bold text-white">{line.label}</p>
        {line.detail && <p className="text-sm text-neutral-200">{line.detail}</p>}
      </div>

      {safety && safety.lines.length > 0 && (
        <ul className="mt-3 text-sm text-red-300 list-disc pl-5">
          {safety.lines.map((l, i) => (
            <li key={i}>{l.text}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rest.map((s) => (
          <section key={s.key}>
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">{s.title}</h4>
            <ul className="text-neutral-100">
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
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Substrate</h4>
            <p className="text-neutral-100">{a.substrate}</p>
          </section>
        )}
      </div>
    </article>
  )
}

export default function CareSheetView({ sheet }: { sheet: CareSheet }) {
  const groups = groupByLocation(sheet.animals, (a) => a.location)
  const showGroups = sheet.animals.some((a) => !!a.location)
  const r = sheet.routine
  const generated = sheetDay(sheet.generated_on)

  return (
    <main className="cs-root min-h-screen px-4 py-6 sm:px-8 text-neutral-100">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Care sheet</h1>
            <p className="text-sm text-neutral-400">
              Prepared by {sheet.keeper_name}
              {generated ? ` · ${generated}` : ''} · {sheet.animals.length}{' '}
              {sheet.animals.length === 1 ? 'animal' : 'animals'} · Temperatures in{' '}
              {sheet.units === 'metric' ? '°C' : '°F'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="cs-noprint print:hidden px-4 py-2 rounded-md border border-herp-teal/40 bg-herp-teal/10 text-sm text-herp-teal hover:bg-herp-teal/20"
          >
            Print / save as PDF
          </button>
        </header>

        {sheet.note && (
          <section className="rounded-lg border-2 border-neutral-300 p-4 mb-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">From {sheet.keeper_name}</h2>
            <p className="mt-1 whitespace-pre-wrap text-white">{sheet.note}</p>
          </section>
        )}

        {(r.steps.length > 0 || r.contact_line || r.vet_contact) && (
          <section className="cs-animal rounded-lg border border-neutral-800 bg-neutral-950 p-4 mb-4 text-sm">
            {r.steps.length > 0 && (
              <>
                <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Routine</h2>
                <ol className="mt-1 list-decimal pl-5 text-neutral-100">
                  {r.steps.map((s, i) => (
                    <li key={i}>{s.text}</li>
                  ))}
                </ol>
              </>
            )}
            {r.contact_line && <p className="mt-2 text-neutral-100">Contact: {r.contact_line}</p>}
            {r.vet_contact && <p className="text-neutral-100">Vet: {r.vet_contact}</p>}
          </section>
        )}

        {sheet.skipped > 0 && (
          <p className="cs-noprint print:hidden mb-4 text-sm text-neutral-500">
            {sheet.skipped} {sheet.skipped === 1 ? 'animal is' : 'animals are'} no longer in this collection and
            {sheet.skipped === 1 ? " isn't" : " aren't"} shown.
          </p>
        )}

        {sheet.animals.length === 0 ? (
          <p className="text-neutral-300">There are no animals on this sheet any more.</p>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              {showGroups && (
                <h2 className="mt-2 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-300">📍 {g.label}</h2>
              )}
              {g.rows.map((a, i) => (
                <AnimalBlock key={`${g.key}-${i}`} a={a} generatedOn={sheet.generated_on} />
              ))}
            </div>
          ))
        )}

        <section className="cs-animal rounded-lg border border-neutral-800 bg-neutral-950 p-4 mb-4 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">For every animal</h2>
          <ul className="mt-1 list-disc pl-5 text-neutral-100">
            {sheet.house_rules.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          {r.emergency.length > 0 && (
            <>
              <h2 className="mt-3 text-xs font-medium uppercase tracking-wide text-neutral-400">If something goes wrong</h2>
              <ul className="mt-1 list-disc pl-5 text-neutral-100">
                {r.emergency.map((e, i) => (
                  <li key={i}>{e.text}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <footer className="mt-6 text-center text-xs text-neutral-500">
          Printed from Herpetoverse · herpetoverse.com
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
