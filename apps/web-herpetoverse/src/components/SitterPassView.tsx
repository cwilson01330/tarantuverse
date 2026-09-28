'use client'

/**
 * The sitter's view of a pass — shared by /sit (the sitter) and the keeper's
 * "preview as sitter" screen, so the preview is the page, not an imitation of it.
 * Renders only what /sitter/pass returns; it never fetches or writes anything.
 */

import { API_URL } from '@/lib/apiClient'

export type Source = 'safety' | 'keeper' | 'record' | 'species' | 'default'
export type FeedState = 'feed' | 'not_due' | 'dont_feed' | 'ask' | 'graze'

export interface Line { text: string; source: Source }
export interface Section { key: string; title: string; lines: Line[] }
export interface Card {
  kind: 'invert' | 'colony' | 'animal'
  id: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
  taxon: string | null
  photo_url: string | null
  feeding: {
    state: FeedState
    headline: string
    last_fed_on: string | null
    next_due_on: string | null
  } | null
  sections: Section[]
}
export interface Payload {
  keeper_name: string
  label: string | null
  starts_at: string
  expires_at: string
  routine: {
    summary: { feed_today: number; dont_feed: number; not_due: number; check: number; total: number }
    steps: Line[]
    emergency: Line[]
    contact_line: string | null
    vet_contact: string | null
  }
  cards: Card[]
}

const GROUPS: { state: FeedState; title: string }[] = [
  { state: 'feed', title: 'Feed today' },
  { state: 'ask', title: 'Check before feeding' },
  { state: 'dont_feed', title: "Don't feed" },
  { state: 'not_due', title: 'Not today' },
  { state: 'graze', title: 'Colonies & grazers' },
]

const STATE_STYLE: Record<FeedState, string> = {
  feed: 'bg-green-500/15 text-green-300',
  ask: 'bg-amber-500/15 text-amber-200',
  dont_feed: 'bg-red-500/15 text-red-300',
  not_due: 'bg-neutral-800 text-neutral-200',
  graze: 'bg-sky-500/15 text-sky-200',
}

const SOURCE_LABEL: Partial<Record<Source, string>> = {
  keeper: 'From the keeper',
  record: 'From their records',
  species: 'From the care sheet',
}

function imageUrl(url: string | null): string | null {
  if (!url) return null
  return url.startsWith('http') ? url : `${API_URL}${url}`
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function SitterPassView({ data }: { data: Payload }) {
  const { routine } = data
  const s = routine.summary
  return (
    <>
      <header className="mb-6">
        {data.label && <p className="text-neutral-300">Hi {data.label},</p>}
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-100">
          {data.keeper_name}&apos;s feeding list
        </h1>
        <p className="mt-1 text-sm text-neutral-400">Open until {fmtDate(data.expires_at)}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Chip className={STATE_STYLE.feed}>Feed today: {s.feed_today}</Chip>
          {s.check > 0 && <Chip className={STATE_STYLE.ask}>Check: {s.check}</Chip>}
          {s.dont_feed > 0 && <Chip className={STATE_STYLE.dont_feed}>Don&apos;t feed: {s.dont_feed}</Chip>}
          <Chip className={STATE_STYLE.not_due}>Not today: {s.not_due}</Chip>
        </div>
        <a href="#if-something-goes-wrong"
          className="inline-block mt-4 text-sm font-medium text-red-300 underline">
          If something goes wrong →
        </a>
      </header>

      {routine.steps.length > 0 && (
        <section className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
          <h2 className="text-lg font-bold text-neutral-100">The round</h2>
          <ol className="mt-3 space-y-2 list-decimal list-inside text-neutral-200">
            {routine.steps.map((l, i) => <li key={i}>{l.text}</li>)}
          </ol>
        </section>
      )}

      {GROUPS.map((g) => {
        const cards = data.cards.filter((c) => (c.feeding?.state ?? 'graze') === g.state)
        if (cards.length === 0) return null
        return (
          <section key={g.state} className="mb-8">
            <h2 className="text-lg font-bold text-neutral-100 mb-3">
              {g.title} <span className="text-neutral-400 font-normal">({cards.length})</span>
            </h2>
            <div className="space-y-4">
              {cards.map((c) => <AnimalCard key={`${c.kind}-${c.id}`} card={c} />)}
            </div>
          </section>
        )
      })}

      <section id="if-something-goes-wrong"
        className="mb-8 rounded-2xl border-2 border-red-500/40 bg-neutral-900/60 p-5 scroll-mt-4">
        <h2 className="text-lg font-bold text-neutral-100">If something goes wrong</h2>
        {routine.emergency.length > 0 && (
          <ul className="mt-3 space-y-2 text-neutral-200">
            {routine.emergency.map((l, i) => <li key={i} className="flex gap-2"><span aria-hidden>•</span>{l.text}</li>)}
          </ul>
        )}
        {routine.contact_line && <p className="mt-4 font-semibold text-neutral-100">{routine.contact_line}</p>}
        {routine.vet_contact && <p className="mt-1 text-neutral-300">Vet: {routine.vet_contact}</p>}
        {!routine.contact_line && <p className="mt-4 text-neutral-300">Message {data.keeper_name} the way you usually do.</p>}
      </section>

      <footer className="text-center text-sm text-neutral-400 pb-8">
        Kept with Herpetoverse.{' '}
        <a href="/" rel="noreferrer" className="text-herp-teal underline">
          Track your own collection free
        </a>
      </footer>
    </>
  )
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`px-3 py-1 rounded-full font-medium ${className}`}>{children}</span>
}

function AnimalCard({ card }: { card: Card }) {
  const img = imageUrl(card.photo_url)
  const title = card.name || card.common_name || card.scientific_name || 'Unnamed'
  const subtitle = [card.name ? card.common_name : null, card.scientific_name].filter(Boolean).join(' · ')
  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      <div className="flex gap-4 p-4 items-start">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-neutral-800" />
        ) : (
          <div aria-hidden className="w-16 h-16 rounded-xl flex-shrink-0 bg-neutral-800" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-neutral-100">{title}</h3>
          {subtitle && <p className="text-sm text-neutral-400 italic">{subtitle}</p>}
          {card.feeding && (
            <p className={`mt-2 inline-block px-3 py-1 rounded-lg text-sm font-semibold ${STATE_STYLE[card.feeding.state]}`}>
              {card.feeding.headline}
            </p>
          )}
        </div>
      </div>
      <div className="px-4 pb-4 space-y-3">
        {card.sections.filter((sec) => sec.key !== 'today').map((sec) => (
          <CardSection key={sec.key} section={sec} />
        ))}
      </div>
    </article>
  )
}

function CardSection({ section }: { section: Section }) {
  const safety = section.key === 'safety'
  const note = section.key === 'note'
  const box = safety
    ? 'border-red-500/40 bg-red-500/10'
    : note
      ? 'border-herp-teal/40 bg-herp-teal/10'
      : 'border-neutral-800 bg-neutral-950/60'
  return (
    <div className={`rounded-xl border p-3 ${box}`}>
      <h4 className="text-sm font-bold text-neutral-100">
        {safety ? '⚠️ ' : ''}{section.title}
      </h4>
      <ul className="mt-1 space-y-1">
        {section.lines.map((l, i) => (
          <li key={i} className="text-neutral-200">
            {l.text}
            {SOURCE_LABEL[l.source] && !note && (
              <span className="ml-2 text-xs text-neutral-400">{SOURCE_LABEL[l.source]}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
