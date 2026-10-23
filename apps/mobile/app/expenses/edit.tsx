/**
 * Add / edit an expense (spec 2026-10-22 §3 "Form"). `?id=` edits that expense,
 * no id adds one; `?collection=` is the owner's user id when a co-keeper logs
 * into a collection shared with them. Mirrors the web ExpenseForm.
 *
 * Split section: Nothing / Whole collection / A location / Pick animals, with
 * a preview line from the same cents math the server uses (`splitAmount`), so
 * what the keeper reads is what gets stored.
 *
 * Editing seeds the split section from the saved split (mode, picked animals,
 * location) and starts it UNTOUCHED: a `split` is sent only if the keeper
 * changed that section, because an echoed split would re-resolve against
 * today's animals and quietly change old shares. While untouched the line
 * under the chips is the saved split ("Split across 15 animals"), never a
 * recomputed preview.
 *
 * The seeded "Pick animals" selection holds ONLY targets that are still in the
 * living list (`seedPicks`): a saved share whose animal has since died, been
 * transferred, ended or been deleted can't be shown in the picker, so it can't
 * be unticked, and is never picked. They are counted in a note instead
 * (`missingTargetsNote`). Until the living list has loaded, a touched split
 * can't be saved.
 *
 * The collection owner's plan decides who may add: a 403 premium_required
 * (PremiumRequiredError) opens the upgrade sheet for your own collection, or
 * tells a co-keeper the owner needs Premium.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import SitterButton from '../../src/components/SitterButton';
import DateInput from '../../src/components/DateInput';
import UpgradeModal from '../../src/components/UpgradeModal';
import ExpenseAnimalPicker, { useLivingAnimals, type PickedAnimals } from '../../src/components/ExpenseAnimalPicker';
import { LocationSheet } from '../../src/components/LocationPicker';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { SPACING, TYPE } from '../../src/theme/tokens';
import { listLocations, type LocationItem } from '../../src/lib/locations';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';
import {
  localToday,
  missingTargetsNote,
  parseExpenseAmount,
  seedPicks,
  splitPreview,
  splitText,
} from '../../src/lib/expense-form';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_DESCRIPTION_MAX,
  EXPENSE_MAX_SHARES,
  EXPENSE_NOTES_MAX,
  PremiumRequiredError,
  createExpense,
  getExpense,
  updateExpense,
  type ExpenseCategory,
  type ExpenseDetail,
  type ExpenseSplitInput,
  type ExpenseSplitMode,
} from '../../src/lib/expenses';

const SPLIT_OPTIONS: { mode: ExpenseSplitMode; label: string }[] = [
  { mode: 'none', label: 'Nothing' },
  { mode: 'collection', label: 'Whole collection' },
  { mode: 'location', label: 'A location' },
  { mode: 'animals', label: 'Pick animals' },
];

const EARLIEST_DATE = '1990-01-01';
const EMPTY_PICKS: PickedAnimals = { inverts: [], colonies: [] };

function ExpenseEditScreen() {
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const params = useLocalSearchParams<{ id?: string; collection?: string }>();
  const id = params.id || null;
  const collection = params.collection || null;

  // The saved expense being edited (null = add), and whether it has loaded.
  const [editing, setEditing] = useState<ExpenseDetail | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(!!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [spentOn, setSpentOn] = useState(localToday());
  const [category, setCategory] = useState<ExpenseCategory>('feeders');
  const [notes, setNotes] = useState('');
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('none');
  const [location, setLocation] = useState<string | null>(null);
  // What the keeper has picked by hand; null = not yet, so the selection is the
  // seed from the saved split (see `picked` below).
  const [userPicked, setUserPicked] = useState<PickedAnimals | null>(null);
  // Edit only: nothing is sent for the split unless the keeper changed it.
  const [splitTouched, setSplitTouched] = useState(false);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the expense being edited and seed every field, the split included.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoadingExisting(true);
    setLoadError(null);
    getExpense(id)
      .then((d) => {
        if (!alive) return;
        setEditing(d);
        setDescription(d.description);
        setAmountText(d.amount.toFixed(2));
        setSpentOn(d.spent_on);
        setCategory(d.category);
        setNotes(d.notes ?? '');
        setSplitMode(d.split_mode);
        setLocation(d.split_mode === 'location' ? d.split_label : null);
        setUserPicked(null);
        setSplitTouched(false);
        setLoadingExisting(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load that expense.');
        setLoadingExisting(false);
      });
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  // Existing locations of the collection being logged into (pick-first).
  useEffect(() => {
    let alive = true;
    listLocations(collection)
      .then((l) => alive && setLocations(l))
      .catch(() => alive && setLocations([]));
    return () => {
      alive = false;
    };
  }, [collection]);

  // The living list: loaded as soon as an existing expense is open (to tell
  // which saved targets are still living), or when the picker is first opened.
  const living = useLivingAnimals(collection, !!editing || pickerOpen);
  const seeded = useMemo(
    () =>
      editing && living.data
        ? seedPicks(editing.shares, {
            inverts: living.data.inverts.map((a) => a.id),
            colonies: living.data.colonies.map((c) => c.id),
          })
        : null,
    [editing, living.data],
  );
  const picked: PickedAnimals = userPicked ?? seeded?.picked ?? EMPTY_PICKS;
  const missingNote = missingTargetsNote(seeded?.missing ?? 0);
  // A touched split can't be built from picks until the list that filters them has arrived.
  const splitWaiting = !!editing && splitTouched && living.loading;

  const amount = useMemo(() => parseExpenseAmount(amountText), [amountText]);
  const pickedCount = picked.inverts.length + picked.colonies.length;
  const showLocationOption = locations.length > 0 || splitMode === 'location';

  const touchSplit = () => setSplitTouched(true);

  const chooseMode = (mode: ExpenseSplitMode) => {
    // Tapping the mode already shown changes nothing, so it must not count as an edit.
    if (mode === splitMode) return;
    touchSplit();
    setSplitMode(mode);
    if (mode === 'location' && !location) setLocationOpen(true);
  };

  const previewLine = (): string => {
    // Untouched saved split: say what is saved, never a recomputed preview.
    if (editing && !splitTouched) {
      return editing.split_mode === 'none' ? 'Not split across any animals' : splitText(editing);
    }
    if (splitMode === 'none') return 'Not assigned to any animal. It still counts in your totals.';
    if (splitMode === 'collection') return 'Split evenly across every living animal and open colony';
    if (splitMode === 'location') {
      return location
        ? `Split evenly across every living animal and open colony at ${location}`
        : 'Choose a location to split across';
    }
    if (amount === null) {
      return pickedCount
        ? `${pickedCount} ${pickedCount === 1 ? 'animal' : 'animals'} picked. Enter an amount to see the split.`
        : 'Pick at least one animal';
    }
    return splitPreview(amount, pickedCount);
  };

  const buildSplit = (): ExpenseSplitInput | string => {
    if (splitMode === 'none') return { mode: 'none' };
    if (splitMode === 'collection') return { mode: 'collection' };
    if (splitMode === 'location') {
      return location ? { mode: 'location', location } : 'Choose a location to split across.';
    }
    if (pickedCount < 1) return 'Pick at least one animal to split across.';
    if (pickedCount > EXPENSE_MAX_SHARES) return `You can split across at most ${EXPENSE_MAX_SHARES} animals.`;
    return { mode: 'animals', invert_ids: picked.inverts, colony_ids: picked.colonies };
  };

  const premiumNeeded = () => {
    if (collection) {
      Alert.alert(
        'Premium needed',
        "The owner of this collection needs Premium to add or edit expenses.",
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } else {
      // Stay on the form (nothing is lost) and offer the upgrade. The list
      // re-reads on focus, so it shows the lapsed state once they go back.
      setError('Expense tracking is a Premium feature, and your plan no longer includes it.');
      setUpgradeOpen(true);
    }
  };

  const submit = async () => {
    if (saving || splitWaiting) return;
    const desc = description.trim();
    if (!desc) return setError('Add a short description.');
    if (desc.length > EXPENSE_DESCRIPTION_MAX) {
      return setError(`Keep the description under ${EXPENSE_DESCRIPTION_MAX} characters.`);
    }
    if (amount === null) {
      return setError('Enter an amount like 12.50, more than $0 and no more than $100,000.');
    }
    if (!spentOn) return setError('Pick the date you spent it.');
    if (spentOn < EARLIEST_DATE) return setError('Pick a date after 1990.');
    if (notes.trim().length > EXPENSE_NOTES_MAX) return setError(`Keep notes under ${EXPENSE_NOTES_MAX} characters.`);

    let split: ExpenseSplitInput | undefined;
    if (!editing || splitTouched) {
      const s = buildSplit();
      if (typeof s === 'string') return setError(s);
      split = s;
    }

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateExpense(editing.id, {
          spent_on: spentOn,
          description: desc,
          category,
          amount,
          notes: notes.trim() ? notes.trim() : null,
          ...(split ? { split } : {}),
        });
      } else {
        await createExpense({
          app: 'tarantuverse',
          collection: collection ?? undefined,
          spent_on: spentOn,
          description: desc,
          category,
          amount,
          notes: notes.trim() ? notes.trim() : undefined,
          split,
        });
      }
      router.back();
    } catch (err) {
      if (err instanceof PremiumRequiredError) {
        premiumNeeded();
      } else {
        setError(err instanceof Error ? err.message : 'Could not save that expense. Nothing has changed.');
      }
    } finally {
      setSaving(false);
    }
  };

  const input = [
    TYPE.body,
    styles.input,
    { color: colors.textPrimary, borderColor: colors.border, borderRadius: layout.radius.md, backgroundColor: colors.background },
  ];
  const panel = [styles.panel, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }];
  const chip = (active: boolean) => [
    styles.chip,
    {
      borderRadius: layout.radius.full,
      borderColor: active ? colors.primary : colors.border,
      backgroundColor: active ? colors.surfaceElevated : 'transparent',
    },
  ];

  const header = (
    <AppHeader
      title={id ? 'Edit expense' : 'Add expense'}
      leftAction={
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
        </TouchableOpacity>
      }
    />
  );

  if (id && (loadingExisting || loadError)) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        {header}
        <View style={styles.centered}>
          {loadError ? (
            <>
              <Text style={[TYPE.body, styles.centerText, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
                {loadError}
              </Text>
              <SitterButton label="Try again" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
              <SitterButton label="Back" variant="secondary" onPress={() => router.back()} />
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.gap}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              style={input}
              value={description}
              onChangeText={setDescription}
              maxLength={EXPENSE_DESCRIPTION_MAX}
              placeholder="e.g. 500 dubia roaches"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="next"
              accessibilityLabel="Description"
            />
          </View>

          <View style={styles.gap}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>Amount</Text>
            <View style={styles.amountRow}>
              <Text style={[TYPE.subheading, { color: colors.textSecondary }]}>$</Text>
              <TextInput
                style={[...input, styles.flex]}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Amount in dollars"
              />
            </View>
          </View>

          <View style={styles.gap}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>Date</Text>
            <DateInput
              value={parseLocalDate(spentOn) ?? new Date()}
              onChange={(d) => setSpentOn(toISODateLocal(d))}
              maximumDate={new Date()}
              label="Date spent"
            />
          </View>

          <View style={styles.gap}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>Category</Text>
            <View style={styles.chipRow}>
              {EXPENSE_CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={chip(on)}
                  >
                    <Text style={[TYPE.bodyStrong, { color: on ? colors.primary : colors.textPrimary }]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.gap}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>Notes (optional)</Text>
            <TextInput
              style={[...input, styles.multiline]}
              value={notes}
              onChangeText={setNotes}
              maxLength={EXPENSE_NOTES_MAX}
              multiline
              accessibilityLabel="Notes"
            />
          </View>

          <View style={panel}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]} accessibilityRole="header">
              Split across
            </Text>
            <View style={styles.chipRow}>
              {SPLIT_OPTIONS.filter((o) => o.mode !== 'location' || showLocationOption).map((o) => {
                const on = splitMode === o.mode;
                return (
                  <TouchableOpacity
                    key={o.mode}
                    onPress={() => chooseMode(o.mode)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={chip(on)}
                  >
                    <Text style={[TYPE.bodyStrong, { color: on ? colors.primary : colors.textPrimary }]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {splitMode === 'location' ? (
              <TouchableOpacity
                onPress={() => setLocationOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={location ? `Location, ${location}. Change` : 'Choose a location'}
                style={[
                  styles.field,
                  { backgroundColor: colors.background, borderColor: colors.border, borderRadius: layout.radius.sm },
                ]}
              >
                <MaterialCommunityIcons
                  name="map-marker-outline"
                  size={18}
                  color={location ? colors.textPrimary : colors.textTertiary}
                />
                <Text
                  style={[TYPE.body, styles.flex, { color: location ? colors.textPrimary : colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {location ?? 'Choose a location'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}

            {splitMode === 'animals' ? (
              <SitterButton
                label={pickedCount ? `Choose animals (${pickedCount} picked)` : 'Choose animals'}
                variant="secondary"
                onPress={() => setPickerOpen(true)}
              />
            ) : null}

            <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
              {previewLine()}
            </Text>

            {missingNote ? <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{missingNote}</Text> : null}
          </View>

          {error ? (
            <Text style={[TYPE.body, { color: colors.error }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <SitterButton
            label={editing ? 'Save changes' : 'Add expense'}
            busy={saving}
            disabled={splitWaiting}
            onPress={submit}
          />
          <SitterButton label="Cancel" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>

      <LocationSheet
        visible={locationOpen}
        title="Split across a location"
        value={location}
        locations={locations}
        allowClear={false}
        confirmLabel="Use"
        onClose={() => setLocationOpen(false)}
        onPick={(l) => {
          touchSplit();
          setLocation(l);
        }}
      />

      <ExpenseAnimalPicker
        visible={pickerOpen}
        living={living}
        value={picked}
        onChange={(next) => {
          touchSplit();
          setUserPicked(next);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <UpgradeModal
        source="expenses"
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="Expense tracking"
        message="Log what you spend on feeders, substrate, enclosures and vet visits, and see what each animal costs to keep."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  gap: { gap: SPACING.sm },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.md },
  centerText: { textAlign: 'center' },
  input: { borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, paddingHorizontal: SPACING.md, minHeight: 36, justifyContent: 'center' },
  panel: { borderWidth: 1, padding: SPACING.lg, gap: SPACING.md },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
});

export default withErrorBoundary(ExpenseEditScreen, 'expense-edit');
