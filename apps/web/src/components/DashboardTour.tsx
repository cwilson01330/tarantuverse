'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

const TOUR_KEY = 'dashboard_tour_completed'

interface TourStep {
  target: string
  title: string
  content: string
}

const steps: TourStep[] = [
  {
    target: '[data-tour="stats"]',
    title: 'Your Dashboard',
    content: 'These cards show your collection at a glance — total count, feeding alerts, molt tracking, and premolt predictions.',
  },
  {
    target: '[data-tour="feeding-alerts"]',
    title: 'Feeding Alerts',
    content: 'Tarantulas overdue for feeding show up here, sorted by urgency. Click any row to log a feeding.',
  },
  {
    target: '[data-tour="quick-actions"]',
    title: 'Quick Actions',
    content: 'Jump to common tasks — add a tarantula, view your collection, check analytics, browse species, and more.',
  },
  {
    target: '[data-tour="sidebar-nav"]',
    title: 'Navigation',
    content: 'Use the sidebar to switch between your Dashboard, Collection, Community, Forums, Species database, and more.',
  },
]

export function resetDashboardTour() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOUR_KEY)
  }
}

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

function TourOverlay({
  stepIndex,
  onNext,
  onBack,
  onSkip,
  onDone,
}: {
  stepIndex: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  onDone: () => void
}) {
  const [rect, setRect] = useState<SpotlightRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const step = steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === steps.length - 1

  const updateRect = useCallback(() => {
    const el = document.querySelector(step.target)
    if (el) {
      const r = el.getBoundingClientRect()
      const padding = 8
      setRect({
        top: r.top - padding + window.scrollY,
        left: r.left - padding + window.scrollX,
        width: r.width + padding * 2,
        height: r.height + padding * 2,
      })
      // Scroll element into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [step.target])

  useEffect(() => {
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect)
    }
  }, [updateRect])

  if (!rect) return null

  // Calculate tooltip position
  const viewportH = window.innerHeight
  const viewportW = window.innerWidth
  const scrollY = window.scrollY

  // Position tooltip below or above the spotlight
  const spaceBelow = viewportH - (rect.top - scrollY + rect.height)
  const spaceAbove = rect.top - scrollY
  const tooltipMaxW = 360

  let tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 10002,
    maxWidth: tooltipMaxW,
    width: 'calc(100vw - 32px)',
  }

  if (spaceBelow > 200) {
    // Place below
    tooltipStyle.top = rect.top + rect.height + 12
    tooltipStyle.left = Math.max(16, Math.min(rect.left, viewportW - tooltipMaxW - 16 + window.scrollX))
  } else if (spaceAbove > 200) {
    // Place above
    tooltipStyle.top = rect.top - 12
    tooltipStyle.left = Math.max(16, Math.min(rect.left, viewportW - tooltipMaxW - 16 + window.scrollX))
    tooltipStyle.transform = 'translateY(-100%)'
  } else {
    // Place to the right or left
    if (rect.left + rect.width + tooltipMaxW + 16 < viewportW + window.scrollX) {
      tooltipStyle.top = rect.top
      tooltipStyle.left = rect.left + rect.width + 12
    } else {
      tooltipStyle.top = rect.top
      tooltipStyle.left = rect.left - tooltipMaxW - 12
    }
  }

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: document.documentElement.scrollHeight, zIndex: 10000 }}>
      {/* Overlay with spotlight cutout using SVG */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10000 }}
        pointerEvents="none"
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={rect.left}
              y={rect.top}
              width={rect.width}
              height={rect.height}
              rx="12"
              ry="12"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Clickable overlay to prevent interaction outside spotlight */}
      <div
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10001 }}
        onClick={onSkip}
      />

      {/* Tooltip */}
      <div ref={tooltipRef} style={tooltipStyle}>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-6">
          <h3 className="text-gray-900 dark:text-white font-bold text-lg mb-2">{step.title}</h3>
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-4">{step.content}</p>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === stepIndex ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 underline transition-colors"
            >
              Skip tour
            </button>
            <div className="flex gap-2">
              {!isFirst && (
                <button
                  onClick={onBack}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={isLast ? onDone : onNext}
                className="px-6 py-2 text-sm font-semibold text-white bg-gradient-brand rounded-xl hover:bg-gradient-brand-hover transition-all shadow-lg"
              >
                {isLast ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardTour() {
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const completed = localStorage.getItem(TOUR_KEY)
    if (!completed) {
      const timer = setTimeout(() => setActive(true), 800)
      return () => clearTimeout(timer)
    }
  }, [mounted])

  const finish = useCallback(() => {
    setActive(false)
    setStepIndex(0)
    localStorage.setItem(TOUR_KEY, 'true')
  }, [])

  const next = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(i => i + 1)
    }
  }, [stepIndex])

  const back = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex(i => i - 1)
    }
  }, [stepIndex])

  if (!mounted || !active) return null

  return createPortal(
    <TourOverlay
      stepIndex={stepIndex}
      onNext={next}
      onBack={back}
      onSkip={finish}
      onDone={finish}
    />,
    document.body
  )
}
