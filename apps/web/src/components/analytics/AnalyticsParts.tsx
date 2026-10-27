/**
 * Shared bits for the Analytics page cards (kept here so every card spells the
 * theme classes the same way).
 *
 * Tertiary text: the theme's `--text-tertiary` is slate-400 in light mode,
 * which is 2.6:1 on white. README §5 asks for >= 4.5:1, and the design uses
 * #6b7280 (gray-500, 4.8:1) in light and #9ca3af (gray-400) in dark, so the
 * page spells it with those two instead of `text-theme-tertiary`.
 */
import type { ComponentType, ReactNode } from 'react'

/** Card surface: Hobbyist = shadow elevation, Keeper = 1px border (web preset tokens in globals.css). */
export const CARD =
  'bg-surface rounded-preset-md border-preset border-solid border-theme shadow-preset'

/** The grey sample's card: dashed 1px border (#3b3b4d in dark), no elevation. */
export const SAMPLE_CARD =
  'bg-surface rounded-preset-md !border !border-dashed !border-gray-300 dark:!border-[#3b3b4d]'

export const TERTIARY ='text-gray-500 dark:text-gray-400'

/** Premium lilac (README §5): #7c3aed in light, #c9a2ff in dark. */
export const PREMIUM_LILAC = 'text-[#7c3aed] dark:text-[#c9a2ff]'

/** Outlined 44px-tall button (Try again, Change). */
export const OUTLINE_BTN =
  'inline-flex min-h-[44px] items-center justify-center rounded-preset-sm border border-solid border-theme px-4 text-sm font-semibold text-theme-primary transition hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] disabled:opacity-60'

/** Primary button: gradient in Hobbyist, flat `primary` in Keeper (`.btn-primary-preset`). */
export const PRIMARY_BTN =
  'btn-primary-preset inline-flex min-h-[44px] items-center justify-center px-5 text-[13px] font-bold transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] focus-visible:ring-offset-2'

type IconType = ComponentType<{ className?: string; size?: number; 'aria-hidden'?: boolean | 'true' }>

/** Icon + 15/700 title (+ optional trailing text), the head of every card. */
export function CardHeading({
  icon: Icon,
  title,
  trailing,
  iconClassName = 'text-primary',
}: {
  icon: IconType
  title: string
  trailing?: ReactNode
  iconClassName?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={iconClassName} size={18} aria-hidden />
      <h2 className="flex-1 text-[15px] font-bold leading-5 text-theme-primary">{title}</h2>
      {trailing != null && <span className={`text-xs ${TERTIARY}`}>{trailing}</span>}
    </div>
  )
}

/** A big figure with its caption (26/700 + 11/400 tertiary). */
export function Figure({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[26px] font-bold leading-8 text-theme-primary">{value}</div>
      <div className={`text-[11px] ${TERTIARY}`}>{caption}</div>
    </div>
  )
}
