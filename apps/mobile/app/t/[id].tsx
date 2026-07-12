/**
 * Universal Link landing route: https://tarantuverse.com/t/{id}
 *
 * When the app is installed and the domain association is verified, tapping an
 * enclosure-label QR opens the app straight here instead of the browser. We
 * forward to the canonical detail screen so the deep link and in-app navigation
 * converge on one place.
 */
import { Redirect, useLocalSearchParams } from 'expo-router'

export default function TarantulaDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>()
  if (!id) return <Redirect href="/(tabs)" />
  return <Redirect href={`/tarantula/${id}`} />
}
