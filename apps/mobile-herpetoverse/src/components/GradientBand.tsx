/**
 * GradientBand — the emerald header band used across the redesigned
 * Herpetoverse screens (Home, Collection, Breeding, animal detail).
 *
 * ── Why this exists instead of `expo-linear-gradient` ──────────────────
 *
 * `expo-linear-gradient` IS declared in package.json (~15.0.0, the same
 * version Tarantuverse uses successfully in 13 files), but HV's shipped
 * binary has a broken native link — see the notes in `AppHeader.tsx` and
 * `app/(tabs)/_layout.tsx`. Rendering a native module the binary didn't
 * link throws
 *
 *     Invariant Violation: View config getter callback for component
 *     `BVLinearGradient` must be a function
 *
 * at render time, and an OTA update cannot add native modules — it only
 * swaps JS. So importing it here would hard-crash Home on the freshly
 * launched App Store build, with no way to roll back except another OTA.
 *
 * The fallback below approximates a diagonal gradient with a small stack
 * of absolutely-positioned Views at stepped opacity. It costs nothing
 * (no native module, no image), renders identically on both platforms,
 * and reads as a band rather than a flat fill.
 *
 * ── Flipping to the real gradient ─────────────────────────────────────
 *
 * Once a native build confirms the link works, this is a ONE-FILE change:
 * set USE_NATIVE_GRADIENT to true and uncomment the import. Every screen
 * consuming GradientBand picks it up. Do not scatter LinearGradient
 * imports back through the screens — that is what made this expensive to
 * undo the first time.
 *
 * Verify the link on a real build with:
 *   import { LinearGradient } from 'expo-linear-gradient';
 *   console.log(!!LinearGradient);   // must render, not just resolve
 */

import React, { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

// import { LinearGradient } from 'expo-linear-gradient';   // ← step 2
const USE_NATIVE_GRADIENT = false; //                        ← step 1

interface GradientBandProps {
  /** [from, to] — from is the emerald end, to is the near-black end. */
  colors: readonly [string, string];
  children?: ReactNode;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Number of stepped layers in the fallback. Six is enough that the
 * banding isn't visible at header height; more just costs Views.
 */
const STEPS = 6;

export function GradientBand({ colors, children, style }: GradientBandProps) {
  const [from, to] = colors;

  if (USE_NATIVE_GRADIENT) {
    // return (
    //   <LinearGradient
    //     colors={[from, to]}
    //     start={{ x: 0, y: 0 }}
    //     end={{ x: 1, y: 1 }}
    //     style={style}
    //   >
    //     {children}
    //   </LinearGradient>
    // );
  }

  // Fallback: `to` is the base fill, and `from` is layered over it in
  // horizontal slices whose opacity falls off left→right. pointerEvents
  // is 'none' on every layer — a gradient header that eats taps is a bug
  // we have already shipped once (see feedback_gradient_header_pointerevents).
  return (
    <View style={[{ backgroundColor: to }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: STEPS }).map((_, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              // Slices stack top→bottom and overlap by a pixel so no
              // hairline seam shows on fractional-density screens.
              top: `${(i / STEPS) * 100}%`,
              height: `${(1 / STEPS) * 100 + 1}%`,
              backgroundColor: from,
              opacity: 1 - i / STEPS,
            }}
          />
        ))}
      </View>
      {children}
    </View>
  );
}
