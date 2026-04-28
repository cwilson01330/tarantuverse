/**
 * Enclosure picker — modal sheet listing the keeper's solo-animal
 * enclosures (purpose='tarantula' or NULL — see lib/enclosures.ts).
 *
 * Mobile UX choice: a tap-to-open Modal with full-screen list rather
 * than a tiny inline picker, because:
 *   1. Native iOS/Android pickers feel laggy with axios fetch + render.
 *   2. The picker has to handle "no enclosures" empty state gracefully,
 *      which a native control can't do.
 *   3. We get the same composable accessibility surface as the species
 *      autocomplete (consistent inline-style triggers).
 *
 * v1 doesn't support creating an enclosure inline — keepers without one
 * can leave it blank and attach later from the detail page (or from
 * web). The empty state copy explains this.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import {
  type EnclosureSummary,
  listEnclosures,
} from '../../lib/enclosures';

export interface EnclosurePickerProps {
  value: string | null;
  onChange: (enclosureId: string | null) => void;
}

export function EnclosurePicker({ value, onChange }: EnclosurePickerProps) {
  const { colors, layout } = useTheme();

  const [open, setOpen] = useState(false);
  const [enclosures, setEnclosures] = useState<EnclosureSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch on mount so the trigger label can show the selected name
  // immediately. Picker opening doesn't re-trigger — list is cached
  // for the lifetime of this component.
  useEffect(() => {
    let cancelled = false;
    listEnclosures('tarantula')
      .then((items) => {
        if (!cancelled) {
          setEnclosures(items);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : "Couldn't load enclosures.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = enclosures?.find((e) => e.id === value) ?? null;
  const triggerLabel = selected ? selected.name : '— None —';

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            borderRadius: layout.radius.md,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Enclosure: ${triggerLabel}`}
      >
        <Text
          style={[
            styles.triggerText,
            {
              color: selected ? colors.textPrimary : colors.textTertiary,
            },
          ]}
          numberOfLines={1}
        >
          {triggerLabel}
        </Text>
        <MaterialCommunityIcons
          name="chevron-down"
          size={20}
          color={colors.textTertiary}
        />
      </TouchableOpacity>

      {loadError && (
        <Text style={[styles.error, { color: colors.danger }]}>{loadError}</Text>
      )}

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setOpen(false)}
        >
          {/* The sheet stops propagation — tapping inside doesn't close. */}
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: layout.radius.lg,
                borderTopRightRadius: layout.radius.lg,
              },
            ]}
          >
            <SafeAreaView edges={['bottom']}>
              <View style={styles.sheetHeader}>
                <Text
                  style={[styles.sheetTitle, { color: colors.textPrimary }]}
                >
                  Pick an enclosure
                </Text>
                <TouchableOpacity
                  onPress={() => setOpen(false)}
                  accessibilityLabel="Close picker"
                  style={styles.sheetClose}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={22}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.sheetList}>
                {/* Always-present "None" option at the top so a keeper
                    can clear a previous selection. */}
                <PickRow
                  label="— None —"
                  hint="Not in any enclosure right now"
                  selected={value === null}
                  onPress={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                />

                {enclosures === null && !loadError && (
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}

                {enclosures?.length === 0 && (
                  <Text
                    style={[styles.emptyHint, { color: colors.textTertiary }]}
                  >
                    No enclosures yet. You can leave this as None and
                    attach one later from the web app or the detail
                    screen.
                  </Text>
                )}

                {enclosures?.map((enc) => (
                  <PickRow
                    key={enc.id}
                    label={enc.name}
                    hint={formatEnclosureHint(enc)}
                    selected={enc.id === value}
                    onPress={() => {
                      onChange(enc.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </ScrollView>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function PickRow({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pickRow,
        { borderBottomColor: colors.border },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.pickLabel, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {hint && (
          <Text
            style={[styles.pickHint, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {hint}
          </Text>
        )}
      </View>
      {selected && (
        <MaterialCommunityIcons
          name="check"
          size={20}
          color={colors.primary}
        />
      )}
    </TouchableOpacity>
  );
}

function formatEnclosureHint(enc: EnclosureSummary): string | null {
  const parts: string[] = [];
  if (enc.enclosure_type) parts.push(enc.enclosure_type);
  if (enc.inhabitant_count > 0) {
    parts.push(
      `${enc.inhabitant_count} inhabitant${enc.inhabitant_count === 1 ? '' : 's'}`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    minHeight: 44,
    gap: 8,
  },
  triggerText: {
    flex: 1,
    fontSize: 15,
  },
  error: {
    marginTop: 6,
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Modal sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
    paddingBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sheetClose: {
    padding: 4,
  },
  sheetList: {
    flexGrow: 0,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  pickHint: {
    fontSize: 12,
    marginTop: 2,
  },
  loading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyHint: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
