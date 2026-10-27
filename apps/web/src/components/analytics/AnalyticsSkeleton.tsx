'use client'

import { CARD } from './AnalyticsParts'

const PULSE = 'tvAnalyticsPulse'

function Block({ h, className = '' }: { h: number; className?: string }) {
  return (
    <div
      className={`${CARD} ${className}`}
      style={{ height: h, animation: `${PULSE} 1.4s ease-in-out infinite` }}
    />
  )
}

/**
 * Loading shapes for the first four cards (three 74px tiles, 200, 120, 120).
 * Pulse 1.4s between .55 and 1 opacity. No text and no numbers.
 */
export default function AnalyticsSkeleton() {
  return (
    <div role="status" aria-label="Loading analytics" className="flex flex-col gap-5">
      <style>{`@keyframes ${PULSE}{0%,100%{opacity:1}50%{opacity:.55}}@media (prefers-reduced-motion:reduce){[style*="${PULSE}"]{animation:none!important;opacity:.8}}`}</style>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
        <Block h={74} />
        <Block h={74} />
        <Block h={74} />
      </div>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Block h={200} />
        <div className="flex flex-col gap-3.5">
          <Block h={120} />
          <Block h={120} />
        </div>
      </div>
    </div>
  )
}

/** One pulse block for the Premium slot while its data (or the plan) is still loading. */
export function PremiumSkeleton() {
  return (
    <div role="status" aria-label="Loading Premium insights">
      <style>{`@keyframes ${PULSE}{0%,100%{opacity:1}50%{opacity:.55}}@media (prefers-reduced-motion:reduce){[style*="${PULSE}"]{animation:none!important;opacity:.8}}`}</style>
      <Block h={200} />
    </div>
  )
}
