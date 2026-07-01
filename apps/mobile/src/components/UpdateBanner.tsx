import React, { useEffect } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import * as Updates from 'expo-updates';

import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';

/**
 * Non-blocking OTA update prompt — lets users apply a new bundle in ONE tap
 * instead of the "force-close twice" dance.
 *
 * Why the tap is needed at all: expo-updates serves the installed bundle
 * immediately and applies a newer one only on the next launch. This banner
 * bridges that gap.
 *
 * Key detail (the bug in the old version): expo-updates ALREADY downloads a
 * pending update on launch by default, so a manual `checkForUpdateAsync()`
 * often returns `isAvailable: false` ("nothing new to fetch") even though a
 * bundle is downloaded and waiting. Keying the banner off `checkForUpdateAsync`
 * therefore missed the common case and the update only applied on a cold
 * restart. We now key off `useUpdates().isUpdatePending` — true whenever a
 * bundle has been downloaded and is ready to launch, no matter who fetched it —
 * so the banner reliably appears in the same session. Tapping it calls
 * `reloadAsync()`, which applies the update instantly (no manual close).
 *
 * We still actively check + fetch on foreground so updates published while the
 * app is open surface without waiting for a relaunch.
 *
 * No-ops in Expo Go / dev; swallows all errors so it can never wedge startup.
 */
export function UpdateBanner() {
  const { colors, layout } = useTheme();
  const { isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    const run = async () => {
      if (__DEV__ || !Updates.isEnabled) return;
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline / no update / disabled — nothing to do.
      }
    };
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, []);

  const restart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // If reload fails the update still applies on next cold start.
    }
  };

  if (__DEV__ || !isUpdatePending) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: SPACING.lg,
        right: SPACING.lg,
        bottom: SPACING.xxl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACING.md,
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: layout.radius.lg,
        elevation: 6,
      }}
    >
      <Text style={[TYPE.body, { color: colors.textPrimary, flex: 1 }]}>
        Update ready — tap to apply now.
      </Text>
      <TouchableOpacity
        onPress={restart}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Apply update now"
      >
        <Text style={[TYPE.bodyStrong, { color: colors.primary, textDecorationLine: 'underline' }]}>
          Update
        </Text>
      </TouchableOpacity>
    </View>
  );
}
