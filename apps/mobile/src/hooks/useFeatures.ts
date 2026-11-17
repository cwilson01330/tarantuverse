import { useEffect, useState } from 'react';

import {
  DEFAULT_FEATURES,
  featuresFromStatus,
  featuresReady,
  getSystemStatus,
  pickFeatures,
  readSavedFeatures,
  saveFeatures,
  type Features,
} from '../lib/features';

// Last value seen this session, so screens mounted later start with it instead of flashing the default.
let current: Features | null = null;

/** Current switches: the saved value first, then the server's answer (one fetch per app session).
 *  `ready` is false until a value is known or the fetch has settled; forumsEnabled is OFF until then. */
export function useFeatures(): Features & { ready: boolean } {
  const [features, setFeatures] = useState<Features>(current ?? DEFAULT_FEATURES);
  const [ready, setReady] = useState<boolean>(featuresReady({ cached: current !== null, saved: null, settled: false }));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = current ? null : await readSavedFeatures();
      if (!cancelled && saved && !current) {
        setFeatures(pickFeatures(null, saved));
        setReady(featuresReady({ cached: false, saved, settled: false }));
      }
      const fetched = featuresFromStatus(await getSystemStatus());
      if (fetched) {
        current = fetched;
        await saveFeatures(fetched);
      }
      if (cancelled) return;
      if (fetched) setFeatures(fetched);
      setReady(featuresReady({ cached: false, saved: null, settled: true }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { ...features, ready };
}
