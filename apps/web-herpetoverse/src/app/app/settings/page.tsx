export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-10">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Account
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide mb-2 text-white">
          Settings
        </h1>
        <p className="text-neutral-400">
          Herpetoverse shares your Tarantuverse account — one login, one
          profile. Settings live on Tarantuverse for now.
        </p>
      </header>

      <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50">
        <h2 className="text-sm font-semibold text-white mb-2">
          Manage your account on Tarantuverse
        </h2>
        <p className="text-sm text-neutral-400 mb-4">
          Profile, email, password, and notification preferences are shared
          across both platforms.
        </p>
        <a
          href="https://www.tarantuverse.com/dashboard/settings"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-herp-teal hover:text-herp-lime transition-colors underline underline-offset-4"
        >
          Open Tarantuverse settings →
        </a>
      </div>
    </div>
  )
}
