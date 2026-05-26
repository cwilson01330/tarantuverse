/**
 * Legacy /scorpion-species redirect.
 *
 * The unified species browser at `(tabs)/species.tsx` superseded the
 * scorpion-only browser. Anything that still deep-links to
 * `/scorpion-species` lands here and gets forwarded to the unified
 * browser with the scorpions segment preselected.
 *
 * The detail-page route at `/scorpion-species/[id]` is untouched and
 * still serves the per-species care sheet.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function LegacyScorpionSpeciesIndexRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/species?taxon=scorpions' as any);
  }, [router]);
  return null;
}
