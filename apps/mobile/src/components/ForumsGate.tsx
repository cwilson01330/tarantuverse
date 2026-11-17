import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ForumsPaused } from './ForumsPaused';
import { useFeatures } from '../hooks/useFeatures';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Wraps a forum / board screen. The wrapped screen is only MOUNTED while the
 * forums are on, so none of its fetches run while they are paused (or before
 * the switch is known). While unknown: a neutral spinner, never the paused page
 * and never a redirect. Paused: the paused page (old notification links land here).
 */
export function withForumsGate<P extends object>(Screen: React.ComponentType<P>): React.ComponentType<P> {
  function ForumsGated(props: P) {
    const { forumsEnabled, ready } = useFeatures();
    const { colors } = useTheme();
    if (!ready) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (!forumsEnabled) return <ForumsPaused />;
    return <Screen {...props} />;
  }
  ForumsGated.displayName = `ForumsGated(${Screen.displayName || Screen.name || 'Screen'})`;
  return ForumsGated;
}

export default withForumsGate;
