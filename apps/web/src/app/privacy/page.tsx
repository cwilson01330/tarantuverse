import { redirect } from 'next/navigation'

// Legacy privacy URL — the canonical privacy policy now lives at /privacy-policy.
// Keep this route as a permanent redirect so any existing links or bookmarks
// (older emails, external references, app store listings) still resolve.
export default function PrivacyRedirect() {
  redirect('/privacy-policy')
}
