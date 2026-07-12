/**
 * Universal Link landing route: https://herpetoverse.com/a/{id}
 *
 * When the app is installed and the domain association is verified, opening a
 * shared animal link (or an enclosure QR) launches the app straight here
 * instead of the browser. We forward to the canonical detail screen so the
 * deep link and in-app navigation converge on one place.
 */
import { Redirect, useLocalSearchParams } from 'expo-router'

export default function AnimalDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>()
  if (!id) return <Redirect href="/(tabs)/dashboard" />
  return <Redirect href={`/reptile/${id}`} />
}
