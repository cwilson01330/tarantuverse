/**
 * Non-blocking OTA update prompt — apply a new bundle in ONE tap instead of
 * the "force-close twice" dance. (Ported from the Tarantuverse implementation.)
 *
 * Key detail: expo-updates ALREADY downloads a pending update on launch by
 * default, so a manual `checkForUpdateAsync()` often returns
 * `isAvailable: false` ("nothing new to fetch") even though a bundle is
 * downloaded and waiting. So we key the banner off
 * `useUpdates().isUpdatePending` — true whenever a bundle has been downloaded
 * and is ready to launch, no matter who fetched it — and still actively
 * check + fetch on foreground so updates published while the app is open
 * surface without waiting for a relaunch. Tapping calls `reloadAsync()`.
 *
 * No-ops in Expo Go / dev; swallows all errors so it can never wedge startup.
 */
import React, { useEffect } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import * as Updates from 'expo-updates';

import { useTheme } from '../contexts/ThemeContext';

export default function UpdateBanner() {
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
        left: 16,
        right: 16,
        bottom: 32,
        zIndex: 1000,
        elevation: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: colors.surfaceRaised ?? colors.surface,
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: layout?.radius?.lg ?? 16,
      }}
    >
      <Text style={{ color: colors.textPrimary, flex: 1, fontSize: 14, fontWeight: '500' }}>
        Update ready — tap to apply now.
      </Text>
      <TouchableOpacity
        onPress={restart}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Apply update now"
      >
        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>
          Update
        </Text>
      </TouchableOpacity>
    </View>
  );
}
