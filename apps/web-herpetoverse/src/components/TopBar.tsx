'use client'

interface TopBarProps {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className="h-16 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-30">
      <div className="h-full px-4 sm:px-6 flex items-center gap-4">
        {/* Mobile menu trigger */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-md hover:bg-neutral-900 text-neutral-400"
          aria-label="Open navigation"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Search placeholder — not wired yet */}
        <div className="flex-1 max-w-md">
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900/50 text-neutral-500 text-sm select-none cursor-not-allowed"
            title="Search coming soon"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10 18a8 8 0 110-16 8 8 0 010 16z" />
            </svg>
            <span>Search reptiles, species…</span>
            <span className="ml-auto text-[10px] uppercase tracking-widest text-neutral-700">
              Soon
            </span>
          </div>
        </div>

        {/* User stub */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs tracking-[0.15em] uppercase text-herp-lime/80">
            Preview
          </span>
          <div
            className="w-9 h-9 rounded-full herp-gradient-bg flex items-center justify-center text-herp-dark font-bold text-sm"
            title="User menu (coming soon)"
          >
            H
          </div>
        </div>
      </div>
    </header>
  )
}
