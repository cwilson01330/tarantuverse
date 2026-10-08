/**
 * The signed-in keeper's display units (imperial: in, °F / metric: cm, °C).
 *
 *   const { units } = useUnits();
 *   formatLength(molt.leg_span_after, units)
 *
 * Comes from AuthContext: the keeper's saved `measurement_units`, else the
 * device region (US, Liberia, Myanmar → imperial; elsewhere → metric). Display
 * only — storage never changes (see src/lib/units.ts).
 */
import { useAuth } from '../contexts/AuthContext';
import type { Units } from '../lib/units';

export function useUnits(): { units: Units; setUnits: (u: Units) => Promise<boolean> } {
  const { units, setMeasurementUnits } = useAuth();
  return { units, setUnits: setMeasurementUnits };
}
