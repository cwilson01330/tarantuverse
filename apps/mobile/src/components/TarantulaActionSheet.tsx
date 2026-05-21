/**
 * Bottom-sheet of quick actions for a single tarantula.
 *
 * Surfaced by long-pressing a collection card or list row so the
 * keeper can log the most common events without first opening the
 * detail screen. The same gesture works on Android and iOS — a plain
 * `onLongPress` rather than iOS swipe actions, so there's one code
 * path, no `react-native-gesture-handler` Swipeable wiring, and the
 * whole thing ships over `eas update` (JS only, no native rebuild).
 *
 * Module-level StyleSheet (theme colors applied inline) — never build
 * styles inside the component, see the StyleSheet-in-component note.
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export interface ActionSheetTarget {
  id: string;
  name: string;
}

interface TarantulaActionSheetProps {
  /** The tarantula the sheet acts on. `null` keeps the sheet closed. */
  target: ActionSheetTarget | null;
  /** True while the mark-fed POST is in flight — disables every row. */
  busy?: boolean;
  onClose: () => void;
  onMarkFed: () => void;
  onLogMolt: () => void;
  onEdit: () => void;
}

type Row = {
  key: 'fed' | 'molt' | 'edit';
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
};

export function TarantulaActionSheet({
  target,
  busy = false,
  onClose,
  onMarkFed,
  onLogMolt,
  onEdit,
}: TarantulaActionSheetProps) {
  const { colors } = useTheme();
  const visible = target !== null;

  const rows: Row[] = [
    {
      key: 'fed',
      label: 'Mark fed today',
      icon: 'silverware-fork-knife',
      onPress: onMarkFed,
    },
    { key: 'molt', label: 'Log a molt', icon: 'butterfly', onPress: onLogMolt },
    {
      key: 'edit',
      label: 'Edit details',
      icon: 'pencil-outline',
      onPress: onEdit,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop tap dismisses — unless a write is in flight. */}
      <Pressable
        style={styles.backdrop}
        onPress={busy ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss quick actions"
      >
        {/* Inner Pressable swallows taps so they don't reach the backdrop. */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={() => {}}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {target ? (
            <Text
              style={[styles.title, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {target.name}
            </Text>
          ) : null}
          <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
            Quick actions
          </Text>

          {rows.map((row) => (
            <TouchableOpacity
              key={row.key}
              style={[styles.row, { borderTopColor: colors.border }]}
              onPress={row.onPress}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={row.label}
            >
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <MaterialCommunityIcons
                  name={row.icon}
                  size={22}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                {row.label}
              </Text>
              {busy && row.key === 'fed' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={colors.textTertiary}
                />
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.cancel, { backgroundColor: colors.surfaceElevated }]}
            onPress={onClose}
            disabled={busy}
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
    paddingBottom: 32,
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
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 4,
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
