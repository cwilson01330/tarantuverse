/**
 * Universal / App Link landing route: https://tarantuverse.com/i/{id}
 *
 * Opens the owner's detail screen when the viewer can see it, otherwise shows
 * the public label card (another keeper's animal). See PublicLabelCard.
 */
import { useLocalSearchParams } from 'expo-router'
import PublicLabelCard from '../../src/components/PublicLabelCard'

export default function InvertDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <PublicLabelCard kind="i" id={id} />
}
