/**
 * AppHeader
 *
 * Renders either a gradient header (Hobbyist preset) or a flat compact header
 * (Keeper preset) based on `layout.useGradient` from ThemeContext.
 *
 * Use this for screens with `headerShown: false` that need to own their header
 * (Community, Search, and any other full-screen custom layout).
 *
 * Screens using Expo Router's built-in header (Dashboard, Collection, Profile)
 * are controlled by `_layout.tsx`'s `headerBackground` — they don't need this.
 *
 * Usage:
 *   <AppHeader title="Community" subtitle="Connect with keepers" />
 *   <AppHeader title="Search" rightAction={<Icon />}>
 *     <SearchInput />   ← children render inside the header, below subtitle
 *   </AppHeader>
 */

import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Element rendered on the far right of the title row. */
  rightAction?: ReactNode;
  /** Content rendered below title/subtitle inside the header band (e.g. a search input). */
  children?: ReactNode;
  /** Override the bottom padding of the header band. Defaults to 16. */
  paddingBottom?: number;
}

export default function AppHeader({
  title,
  subtitle,
  rightAction,
  children,
  paddingBottom = 16,
}: AppHeaderProps) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const headerPaddingTop = insets.top + 12;

  const titleColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const subtitleColor = layout.useGradient ? 'rgba(255,255,255,0.8)' : colors.textSecondary;

  const content = (
    <View style={{ paddingTop: headerPaddingTop, paddingHorizontal: 16, paddingBottom }}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: subtitleColor }]}>{subtitle}</Text>
          ) : null}
        </View>
        {rightAction ? (
          <View style={styles.rightAction}>{rightAction}</View>
        ) : null}
      </View>
      {children ? <View style={styles.childrenBlock}>{children}</View> : null}
    </View>
  );

  if (layout.useGradient) {
    return (
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {content}
      </LinearGradient>
    );
  }

  // Keeper: flat surface with a single bottom border
  return (
    <View
      style={[
        styles.flatHeader,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  flatHeader: {
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  rightAction: {
    marginLeft: 8,
    justifyContent: 'center',
  },
  childrenBlock: {
    marginTop: 12,
  },
});
