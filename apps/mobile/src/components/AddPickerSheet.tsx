/**
 * Bottom-sheet taxon picker for the "Add to collection" flow.
 *
 * Replaces the native `Alert.alert` taxon picker, which on Android
 * right-justifies its options (Material design pattern). That layout
 * read awkwardly with our three short taxon labels and an emoji glyph
 * on each — keepers had to track the icon across the dialog width.
 *
 * This component matches the existing TarantulaActionSheet shape:
 * backdrop tap dismisses, rows render left-aligned with the emoji on
 * the leading edge, a Cancel row sits at the bottom. Same theme
 * tokens, same row metrics, so the two sheets feel like one
 * component family.
 *
 * Module-level StyleSheet — never build styles inside the component,
 * see the StyleSheet-in-component note.
 */
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';

export type AddPickerTaxon = 'tarantula' | 'scorpion' | 'centipede' | 'whip_spider';

interface AddPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (taxon: AddPickerTaxon) => void;
}

interface Row {
  key: AddPickerTaxon;
  glyph: string;
  label: string;
  hint: string;
}

const ROWS: Row[] = [
  {
    key: 'tarantula',
    glyph: '🕷',
    label: 'Tarantula',
    hint: 'New tarantula record',
  },
  {
    key: 'scorpion',
    glyph: '🦂',
    label: 'Scorpion',
    hint: 'New scorpion record',
  },
  {
    key: 'centipede',
    glyph: '🐛',
    label: 'Centipede',
    hint: 'New centipede record',
  },
  {
    // No dedicated whip-spider emoji exists (🕷 is the tarantula glyph
    // here); 🕸️ reads as arachnid-adjacent and stays visually distinct
    // from the other rows.
    key: 'whip_spider',
    glyph: '🕸️',
    label: 'Whip spider',
    hint: 'New whip spider record',
  },
];

export function AddPickerSheet({
  visible,
  onClose,
  onPick,
}: AddPickerSheetProps) {
  const { colors } = useTheme();

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
        accessibilityLabel="Dismiss add menu"
      >
        {/* Inner Pressable swallows taps so they don't reach the backdrop. */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={() => {}}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            Add to collection
          </Text>
          <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
            What are you adding?
          </Text>

          {ROWS.map((row) => (
            <TouchableOpacity
              key={row.key}
              style={[styles.row, { borderTopColor: colors.border }]}
              onPress={() => onPick(row.key)}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              accessibilityHint={row.hint}
            >
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <Text style={styles.rowGlyph}>{row.glyph}</Text>
              </View>
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                {row.label}
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[
              styles.cancel,
              { backgroundColor: colors.surfaceElevated },
            ]}
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
  // Slightly larger than the body font — the glyph IS the icon here,
  // so it should feel anchor-weight in the row.
  rowGlyph: {
    fontSize: 22,
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
