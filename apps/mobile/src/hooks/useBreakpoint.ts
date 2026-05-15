/**
 * useBreakpoint — width-derived breakpoints for responsive layouts.
 *
 * Reacts to window-size changes (orientation flips, foldable posture
 * changes, iPad split-view) via `useWindowDimensions`, so any consumer
 * automatically re-renders when the device geometry changes.
 *
 * Thresholds align with the device sizes Tarantuverse actually targets:
 *
 *   sm  (< 600)   standard phone — every iPhone, folded foldable, most
 *                  Android phones
 *   md  (600-839) large phone or wider folded form
 *   lg  (840-1023) unfolded foldable, small tablet
 *   xl  (>= 1024) large tablet, iPad portrait+
 *
 * iOS currently sets `supportsTablet: false`, so on Apple devices this
 * stays in `sm` forever — the responsive code is a no-op on iPhone and
 * doesn't change anything that's working today. Useful on Android
 * foldables now, and forward-compatible if we ever flip iPad support.
 *
 * Typical use:
 *
 *   const { breakpoint } = useBreakpoint();
 *   const cols = breakpoint === 'xl' ? 6
 *              : breakpoint === 'lg' ? 5
 *              : breakpoint === 'md' ? 4
 *              : 2;
 */
import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl';

export interface BreakpointInfo {
  /** Width-derived bucket; the primary thing most consumers care about. */
  breakpoint: Breakpoint;
  /** Raw width in dp for one-off conditionals. */
  width: number;
  /** True at md+ — "tablet-ish" geometry, including folded foldables. */
  isTablet: boolean;
  /** True at lg+ — unfolded foldable or proper tablet. */
  isUnfolded: boolean;
}

export function useBreakpoint(): BreakpointInfo {
  const { width } = useWindowDimensions();
  const breakpoint: Breakpoint =
    width >= 1024 ? 'xl' : width >= 840 ? 'lg' : width >= 600 ? 'md' : 'sm';
  return {
    breakpoint,
    width,
    isTablet: width >= 600,
    isUnfolded: width >= 840,
  };
}
