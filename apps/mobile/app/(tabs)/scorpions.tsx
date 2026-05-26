/**
 * Legacy /(tabs)/scorpions route — redirects to the unified Collection
 * tab.
 *
 * The Scorpions tab was promoted in Phase 3a, then folded back into
 * the Collection tab once we adopted the HV ADR-003 pattern (single
 * surface for every taxon, with taxon disambiguated inside the add
 * flow). The route stays so any deep-link or in-app push that
 * targeted /(tabs)/scorpions resolves cleanly. Open `/(tabs)/collection`
 * with the taxon filter preselected.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function LegacyScorpionsTabRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(tabs)/collection?taxon=scorpions' as any);
  }, [router]);
  return null;
}
