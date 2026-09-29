/**
 * `/invert/add` — redirects to the unified add screen (`/add`).
 *
 * The per-taxon generic form this used to be is superseded by species-first
 * `/add` (design handoff, screen 7), which picks the taxon from the species.
 * `collection` (co-keepers adding to a shared collection) and `speciesId`
 * are carried over.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function InvertAddRedirect() {
  const { collection, speciesId } = useLocalSearchParams<{ collection?: string; speciesId?: string }>();
  const params: Record<string, string> = {};
  if (collection) params.collection = collection;
  if (speciesId) params.speciesId = speciesId;
  return <Redirect href={{ pathname: '/add', params } as never} />;
}
