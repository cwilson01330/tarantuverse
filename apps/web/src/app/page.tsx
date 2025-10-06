export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">
          🕷️ Tarantuverse
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
          The ultimate tarantula husbandry tracking platform
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/login"
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Login
          </a>
          <a
            href="/register"
            className="px-6 py-3 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition"
          >
            Register
          </a>
        </div>
        <div className="mt-16 text-sm text-gray-500">
          <p>Track feedings • Log molts • Manage breeding • Connect with keepers</p>
        </div>
      </div>
    </main>
  )
}
