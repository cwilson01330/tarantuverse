/**
 * Bottom-sheet overflow menu for a detail screen.
 *
 * WHY THIS EXISTS
 * ---------------
 * These menus were built with `Alert.alert`, which on Android renders a native
 * AlertDialog — and that dialog supports exactly THREE buttons. React Native
 * silently drops any extras rather than erroring. The animal detail menu had
 * five, with "Delete record" fourth, so on Android there was no way to delete an
 * animal at all. A paying keeper who added a record by accident was stuck with
 * it, and nothing on screen suggested the option existed.
 *
 * iOS shows all five, which is exactly why this survived so long: it works
 * perfectly on the platform it was built on.
 *
 * This is the second Alert-API platform trap in this codebase — `Alert.prompt`
 * is iOS-only and silently no-ops on Android. The lesson both times: RN's Alert
 * APIs are a lowest-common-denominator surface. Anything richer than
 * confirm/cancel should be a real sheet.
 *
 * Module-level StyleSheet with theme colors applied inline — never build styles
 * inside the component.
 */
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../contexts/ThemeContext';

export interface OverflowMenuRow {
  key: string;
  label: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Renders in the danger colour and sits behind a confirmation. */
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  /** Usually the animal's display name, so it's clear what's being acted on. */
  title?: string;
  rows: OverflowMenuRow[];
  onClose: () => void;
}

export function OverflowMenuSheet({ visible, title, rows, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Close first, then act. Pushing a route or opening another modal from
  // underneath a visible Modal leaves the sheet stranded on top on Android.
  const run = (fn: () => void) => {
    onClose();
    requestAnimationFrame(fn);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss menu"
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              // Without the inset the cancel pill sits under the Android
              // gesture bar. See the bottom-bar safe-area note.
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            },
          ]}
          onPress={() => {}}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {title ? (
            <Text
              style={[styles.title, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : null}

          {/* Scrolls rather than clipping — unlike the Alert this replaces,
              a long menu stays fully reachable on a short screen. */}
          <ScrollView bounces={false} style={styles.rows}>
            {rows.map((row) => {
              const tint = row.destructive ? colors.error : colors.textPrimary;
              return (
                <TouchableOpacity
                  key={row.key}
                  style={[styles.row, { borderTopColor: colors.border }]}
                  onPress={() => run(row.onPress)}
                  accessibilityRole="button"
                  accessibilityLabel={row.label}
                >
                  {row.icon ? (
                    <View
                      style={[
                        styles.rowIcon,
                        { backgroundColor: colors.surfaceElevated },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={row.icon}
                        size={22}
                        color={row.destructive ? colors.error : colors.primary}
                      />
                    </View>
                  ) : null}
                  <Text style={[styles.rowLabel, { color: tint }]}>
                    {row.label}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.cancel, { backgroundColor: colors.surfaceElevated }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '80%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  rows: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  cancel: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
