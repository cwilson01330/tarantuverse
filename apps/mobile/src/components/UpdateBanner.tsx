import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import * as Updates from 'expo-updates';

import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';

/**
 * Non-blocking OTA update prompt.
 *
 * expo-updates serves the already-installed bundle immediately and downloads
 * any newer update in the background; by default the new bundle only activates
 * on the NEXT cold start — which is why a fresh install needs a manual
 * close/reopen to show the latest changes. This bridge checks on launch and
 * whenever the app returns to the foreground, downloads a pending update, and
 * surfaces a one-tap "Restart" banner instead. Launch is never blocked.
 *
 * No-ops in Expo Go / dev (`Updates.isEnabled` is false) and swallows all
 * errors, so an update check can never crash or wedge startup.
 */
export function UpdateBanner() {
  const { colors, layout } = useTheme();
  const [ready, setReady] = useState(false);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled || checking.current || ready) return;
    checking.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        setReady(true);
      }
    } catch {
      // Offline, no update, or updates disabled — nothing to do.
    } finally {
      checking.current = false;
    }
  }, [ready]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const restart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // If reload fails the update still applies on next cold start.
    }
  };

  if (!ready) return null;

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
        borderColor: colors.border,
        borderRadius: layout.radius.lg,
      }}
    >
      <Text style={[TYPE.body, { color: colors.textPrimary, flex: 1 }]}>
        A new version is ready.
      </Text>
      <TouchableOpacity
        onPress={restart}
        accessibilityRole="button"
        accessibilityLabel="Restart to update"
      >
        <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>Restart</Text>
      </TouchableOpacity>
    </View>
  );
}
