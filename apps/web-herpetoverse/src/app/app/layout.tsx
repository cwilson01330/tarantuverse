import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

/**
 * Server-side gate for the Herpetoverse web app.
 *
 * The app stays hidden behind the landing page until the admin flips the
 * `features.herpetoverse_app_enabled` flag in the Tarantuverse admin panel.
 * A `herp_preview=1` cookie bypasses the gate so we can preview the build
 * without enabling it for the public.
 */
async function isAppEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/system/status`, {
      // Short revalidation — admin flips should propagate within ~30s.
      next: { revalidate: 30 },
    })
    if (!res.ok) return false
    const data = await res.json()
    return Boolean(data?.features?.herpetoverse_app_enabled)
  } catch {
    // Fail closed: if the API is unreachable, assume the app is off.
    return false
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const previewCookie = cookieStore.get('herp_preview')?.value === '1'

  if (!previewCookie) {
    const enabled = await isAppEnabled()
    if (!enabled) redirect('/')
  }

  return <AppShell>{children}</AppShell>
}
