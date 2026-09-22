/**
 * Bulk offspring sheets — the high-volume half of breeding, on mobile.
 *
 * WHY THESE EXIST
 * ---------------
 * A successful sac is 50–200 animals. Recording them one form at a time is
 * not "slightly tedious", it's the reason a breeder keeps their real records
 * in a spreadsheet and uses this app for the pretty photos. The web hub has
 * had bulk add + bulk status update for a while; mobile had neither, which
 * meant the phone — the thing actually in your hand at the shelf — was the
 * worse tool for the job it's best placed to do.
 *
 * The API already supported both (`POST /offspring/bulk`, `POST
 * /offspring/bulk-update`); only the client was missing.
 *
 * TWO SHEETS, NOT A BAR
 * ---------------------
 * The web version edits bulk status in an inline action bar. That doesn't
 * survive the trip to a phone: a picker plus a currency field plus a confirm
 * button in a 40pt strip is a mis-tap generator, and the keyboard covers it
 * the moment you touch the price. So selection shows a slim bar, and the
 * actual editing happens in a sheet with room to breathe.
 *
 * Visual language matches AddPickerSheet / TarantulaActionSheet: backdrop
 * tap dismisses, grabber at the top, left-aligned rows, Cancel pill at the
 * bottom. Module-level StyleSheet — never build styles in the component.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';

/** Matches OffspringStatus on the API. */
export const OFFSPRING_STATUSES = [
  { key: 'unknown', label: 'Unknown', hint: 'Not decided yet' },
  { key: 'kept', label: 'Kept', hint: 'In your collection' },
  { key: 'sold', label: 'Sold', hint: 'Sold to another keeper' },
  { key: 'traded', label: 'Traded', hint: 'Swapped for another animal' },
  { key: 'given_away', label: 'Given away', hint: 'No payment taken' },
  { key: 'died', label: 'Died', hint: 'Did not survive' },
] as const;

export interface ClutchOption {
  id: string;
  /** Pre-formatted label — the caller owns date formatting. */
  label: string;
  /** Recorded count, used to prefill and to warn on overshoot. */
  count: number | null;
}

// ---------------------------------------------------------------------------
// Bulk add
// ---------------------------------------------------------------------------

interface BulkAddProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (args: { eggSacId: string; count: number; status: string }) => Promise<void>;
  clutches: ClutchOption[];
  /** Preselected clutch when opened from a specific row. */
  initialClutchId?: string | null;
  /** Taxon vocabulary — "Egg sac" / "Ootheca" / "Brood". */
  clutchOne: string;
  /** "spiderlings" / "nymphs" / "mancae". */
  youngNoun: string;
}

export function BulkAddOffspringSheet({
  visible,
  onClose,
  onSubmit,
  clutches,
  initialClutchId,
  clutchOne,
  youngNoun,
}: BulkAddProps) {
  const { colors, layout } = useTheme();
  const [clutchId, setClutchId] = useState<string | null>(initialClutchId ?? null);
  const [count, setCount] = useState('');
  const [status, setStatus] = useState<string>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed when the sheet is reopened from a different row. Keyed on
  // `visible` so reopening the same row doesn't wipe a half-typed count.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setClutchId(initialClutchId ?? null);
      const seed = clutches.find((c) => c.id === initialClutchId)?.count;
      setCount(seed != null ? String(seed) : '');
      setStatus('unknown');
      setError(null);
    }
  }

  const parsed = parseInt(count, 10);
  const countValid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 1000;
  const canSubmit = Boolean(clutchId) && countValid && !busy;

  const submit = async () => {
    if (!clutchId || !countValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ eggSacId: clutchId, count: parsed, status });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not create those records.');
    } finally {
      setBusy(false);
    }
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
        onPress={busy ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onPress={() => {}}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Add many at once
            </Text>
            <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
              One record per animal, created in a single step.
            </Text>

            <ScrollView
              style={styles.scroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
                {clutchOne.toUpperCase()}
              </Text>
              {clutches.length === 0 ? (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  No {clutchOne.toLowerCase()} recorded yet. Log one from a
                  pairing first — offspring hang off it.
                </Text>
              ) : (
                clutches.map((c) => {
                  const on = c.id === clutchId;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => {
                        setClutchId(c.id);
                        if (!count && c.count != null) setCount(String(c.count));
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={c.label}
                      style={[
                        styles.option,
                        {
                          borderColor: on ? colors.primary : colors.border,
                          backgroundColor: on
                            ? colors.surfaceElevated
                            : 'transparent',
                          borderRadius: layout.radius.md,
                        },
                      ]}
                    >
                      {/* check-circle / check-circle-outline rather than the
                          radiobox pair: these two are already used elsewhere
                          in the app, so they're confirmed present in the
                          bundled glyph map. An unverified MDI name renders as
                          a blank box in production. */}
                      <MaterialCommunityIcons
                        name={on ? 'check-circle' : 'check-circle-outline'}
                        size={18}
                        color={on ? colors.primary : colors.textTertiary}
                      />
                      <Text
                        style={[styles.optionLabel, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}

              <Text
                style={[
                  styles.fieldLabel,
                  { color: colors.textTertiary, marginTop: 16 },
                ]}
              >
                HOW MANY {youngNoun.toUpperCase()}
              </Text>
              <TextInput
                value={count}
                onChangeText={setCount}
                keyboardType="number-pad"
                placeholder="e.g. 45"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel={`Number of ${youngNoun}`}
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.textPrimary,
                    backgroundColor: colors.background,
                    borderRadius: layout.radius.md,
                  },
                ]}
              />
              {count.length > 0 && !countValid && (
                <Text style={[styles.errorHint, { color: '#fca5a5' }]}>
                  Enter a whole number between 1 and 1000.
                </Text>
              )}

              <Text
                style={[
                  styles.fieldLabel,
                  { color: colors.textTertiary, marginTop: 16 },
                ]}
              >
                STARTING STATUS
              </Text>
              <View style={styles.chipWrap}>
                {OFFSPRING_STATUSES.map((s) => {
                  const on = s.key === status;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      onPress={() => setStatus(s.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={s.label}
                      accessibilityHint={s.hint}
                      style={[
                        styles.chip,
                        {
                          borderColor: on ? colors.primary : colors.border,
                          backgroundColor: on
                            ? colors.surfaceElevated
                            : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: on ? colors.primary : colors.textSecondary },
                        ]}
                      >
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {error && (
                <Text style={[styles.errorHint, { color: '#fca5a5' }]}>
                  {error}
                </Text>
              )}
            </ScrollView>

            <TouchableOpacity
              disabled={!canSubmit}
              onPress={submit}
              accessibilityRole="button"
              accessibilityLabel={
                countValid
                  ? `Create ${parsed} offspring records`
                  : 'Create offspring records'
              }
              style={[
                styles.primary,
                {
                  backgroundColor: canSubmit
                    ? colors.primary
                    : colors.surfaceElevated,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.primaryText,
                    { color: canSubmit ? '#fff' : colors.textTertiary },
                  ]}
                >
                  {countValid ? `Create ${parsed} records` : 'Create records'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancel, { backgroundColor: colors.surfaceElevated }]}
              onPress={busy ? undefined : onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Bulk status update
// ---------------------------------------------------------------------------

interface BulkUpdateProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (args: { status: string; price: number | null }) => Promise<void>;
  count: number;
}

export function BulkUpdateOffspringSheet({
  visible,
  onClose,
  onSubmit,
  count,
}: BulkUpdateProps) {
  const { colors, layout } = useTheme();
  const [status, setStatus] = useState<string>('sold');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Snapshot the count at open time. The parent clears its selection as soon
  // as the update succeeds, and reading `count` live would flash
  // "Update 0 records" in the title during the close animation.
  const [shownCount, setShownCount] = useState(count);

  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setStatus('sold');
      setPrice('');
      setError(null);
      setShownCount(count);
    }
  }

  const priceValue = price.trim() ? Number(price) : null;
  const priceValid =
    priceValue === null || (Number.isFinite(priceValue) && priceValue >= 0);

  const submit = async () => {
    if (busy || !priceValid) return;
    setBusy(true);
    setError(null);
    try {
      // Price only travels with a sale. Attaching it to "died" or "kept"
      // would write a number the keeper never meant as a sale figure, and
      // the revenue analytics read this column.
      await onSubmit({
        status,
        price: status === 'sold' ? priceValue : null,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not update those records.');
    } finally {
      setBusy(false);
    }
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
        onPress={busy ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onPress={() => {}}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Update {shownCount} {shownCount === 1 ? 'record' : 'records'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
              The same status applies to everything selected.
            </Text>

            <View style={[styles.chipWrap, { marginTop: 12 }]}>
              {OFFSPRING_STATUSES.map((s) => {
                const on = s.key === status;
                return (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => setStatus(s.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={s.label}
                    accessibilityHint={s.hint}
                    style={[
                      styles.chip,
                      {
                        borderColor: on ? colors.primary : colors.border,
                        backgroundColor: on
                          ? colors.surfaceElevated
                          : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: on ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Price is only meaningful for a sale, so it only appears for
                one. Static branch — Hermes-prod safety. */}
            {status === 'sold' && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
                  PRICE EACH (OPTIONAL)
                </Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 35"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Sale price per animal"
                  style={[
                    styles.input,
                    {
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      backgroundColor: colors.background,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                />
                {!priceValid && (
                  <Text style={[styles.errorHint, { color: '#fca5a5' }]}>
                    Enter a number of 0 or more, or leave it blank.
                  </Text>
                )}
              </View>
            )}

            {error && (
              <Text style={[styles.errorHint, { color: '#fca5a5' }]}>{error}</Text>
            )}

            <TouchableOpacity
              disabled={busy || !priceValid}
              onPress={submit}
              accessibilityRole="button"
              accessibilityLabel={`Apply to ${shownCount} records`}
              style={[
                styles.primary,
                {
                  backgroundColor:
                    busy || !priceValid ? colors.surfaceElevated : colors.primary,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.primaryText,
                    { color: priceValid ? '#fff' : colors.textTertiary },
                  ]}
                >
                  Apply to {shownCount}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancel, { backgroundColor: colors.surfaceElevated }]}
              onPress={busy ? undefined : onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
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
  kav: {
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
    marginTop: 2,
  },
  scroll: {
    maxHeight: 340,
    marginTop: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 6,
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorHint: {
    fontSize: 12,
    marginTop: 6,
  },
  primary: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cancel: {
    marginTop: 8,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
