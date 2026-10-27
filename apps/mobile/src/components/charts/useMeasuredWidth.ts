import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Width for a chart: the `width` prop when the caller gives a usable one, else
 * the width the container measures through `onLayout`. 0 means "not known yet":
 * charts render nothing but the (empty) measuring container until it is > 0, so
 * no model is ever computed from a bogus width (no NaN paths).
 */
export function useMeasuredWidth(fixed?: number) {
  const [measured, setMeasured] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setMeasured((prev) => (prev === w ? prev : w));
  }, []);
  const hasFixed = typeof fixed === 'number' && Number.isFinite(fixed) && fixed > 0;
  return {
    width: hasFixed ? (fixed as number) : measured,
    onLayout: hasFixed ? undefined : onLayout,
  };
}
