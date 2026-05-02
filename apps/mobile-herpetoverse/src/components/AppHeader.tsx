/**
 * AppHeader — unified in-app header for Herpetoverse mobile.
 *
 * The root Stack ships with `headerShown: false`, and the TestFlight binary
 * has a broken `expo-linear-gradient` native link, so every screen owns
 * its own flat header rendered as plain Views. That's what this component
 * is: a bordered surface band with a left action slot (typically a back
 * button), a centered-leaning title, and an optional right action (edit,
 * save, etc.).
 *
 * Usage:
 *   <AppHeader title="Collection" />
 *   <AppHeader title="Edit reptile" leftAction={<HeaderBackButton />} />
 *   <AppHeader
 *     title="Log feeding"
 *     leftAction={<HeaderBackButton />}
 *     rightAction={<TouchableOpacity onPress={save}><Text>Save</Text></TouchableOpacity>}
 *   />
 */

import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  /** Optional content rendered below the title row (e.g. a search bar). */
  children?: ReactNode;
}

export function AppHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
  children,
}: AppHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 10,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <View style={styles.actionSlot}>{leftAction}</View>
        <View style={styles.titleBlock}>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.actionSlot, styles.rightSlot]}>{rightAction}</View>
      </View>
      {children ? <View style={styles.childrenBlock}>{children}</View> : null}
    </View>
  );
}

export default AppHeader;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  // Fixed-width slots so the title stays visually centered when only one
  // side has an action. 44pt is Apple's minimum tap target.
  actionSlot: {
    minWidth: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  rightSlot: {
    alignItems: 'flex-end',
  },
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  childrenBlock: {
    marginTop: 10,
  },
});
