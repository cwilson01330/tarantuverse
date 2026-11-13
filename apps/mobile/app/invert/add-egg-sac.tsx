/**
 * Log an egg sac (ootheca, brood) for a female. No pairing needed: jumpers
 * and many other keepers never record one. Only the date is required; the
 * sac can be hatched or marked "didn't hatch" later from its detail screen.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import DateInput from '../../src/components/DateInput';
import { useTheme } from '../../src/contexts/ThemeContext';
import { SPACING, TYPE } from '../../src/theme/tokens';
import { getInvert, invertDisplayName, type Invert } from '../../src/lib/inverts';
import { clutchSingularLabel, isLiveBirth, offspringNoun } from '../../src/lib/taxon-modules';
import { buildSacPayload } from '../../src/lib/egg-sacs';
import { createInvertEggSac } from '../../src/lib/egg-sacs-api';
import { toISODateLocal } from '../../src/utils/date';
import { getErrorMessage } from '../../src/utils/errors';

function AddEggSacScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  const [invert, setInvert] = useState<Invert | null>(null);
  const [loadError, setLoadError] = useState('');
  const [laid, setLaid] = useState<Date>(new Date());
  const [expected, setExpected] = useState<Date | null>(null);
  const [count, setCount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getInvert(id)
      .then(setInvert)
      .catch((e) => setLoadError(getErrorMessage(e, "Couldn't load this animal.")));
  }, [id]);

  const taxon = invert?.taxon ?? 'true_spider';
  const live = isLiveBirth(taxon);
  const noun = clutchSingularLabel(taxon);

  const back = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={layout.useGradient ? '#fff' : colors.textPrimary} />
    </TouchableOpacity>
  );

  const submit = async () => {
    if (saving || !id) return;
    const built = buildSacPayload({
      laidDate: toISODateLocal(laid),
      expectedHatch: expected ? toISODateLocal(expected) : null,
      countText: count,
      notes,
      liveBirth: live,
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createInvertEggSac(id, built.payload);
      router.back();
    } catch (e: any) {
      setError(getErrorMessage(e, `Couldn't save this ${noun.toLowerCase()}. Nothing has changed. Try again.`));
      setSaving(false);
    }
  };

  const input = [
    TYPE.body,
    styles.input,
    { borderColor: colors.border, borderRadius: layout.radius.sm, color: colors.textPrimary, backgroundColor: colors.surface },
  ];

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader title={`Log ${noun.toLowerCase()}`} leftAction={back} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {loadError !== '' && <Text style={[TYPE.body, { color: colors.error }]}>{loadError}</Text>}
          {invert && (
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>
              {live
                ? `Record the ${noun.toLowerCase()} ${invertDisplayName(invert)} produced.`
                : `Record what ${invertDisplayName(invert)} laid. No pairing needed. When it hatches, open it to start a group of ${offspringNoun(taxon)}.`}
            </Text>
          )}

          <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>{live ? 'DATE BORN' : 'DATE LAID'}</Text>
          <DateInput value={laid} onChange={setLaid} maximumDate={new Date()} label={live ? 'Date born' : 'Date laid'} />

          {!live && (
            <>
              <View style={styles.optionalHeader}>
                <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>EXPECTED HATCH</Text>
                <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Optional</Text>
              </View>
              <DateInput value={expected ?? laid} onChange={setExpected} futureYears={1} label="Expected hatch" />
              {expected && (
                <TouchableOpacity onPress={() => setExpected(null)} accessibilityRole="button">
                  <Text style={[TYPE.label, { color: colors.accent }]}>Clear expected hatch</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {live && (
            <>
              <View style={styles.optionalHeader}>
                <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>COUNT</Text>
                <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Optional</Text>
              </View>
              <TextInput
                value={count}
                onChangeText={setCount}
                keyboardType="number-pad"
                placeholderTextColor={colors.textTertiary}
                style={input}
                accessibilityLabel="Count"
              />
            </>
          )}

          <View style={styles.optionalHeader}>
            <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>NOTES</Text>
            <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Optional</Text>
          </View>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
            placeholderTextColor={colors.textTertiary}
            style={[input, styles.textarea]}
            accessibilityLabel="Notes"
          />

          {error !== '' && (
            <Text style={[TYPE.caption, { color: colors.error }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}

          <TouchableOpacity
            onPress={submit}
            disabled={saving || !invert}
            accessibilityRole="button"
            style={[styles.confirm, { backgroundColor: colors.textPrimary, borderRadius: layout.radius.md }, (saving || !invert) && { opacity: 0.6 }]}
          >
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={[TYPE.subheading, { color: colors.background }]}>{`Save ${noun.toLowerCase()}`}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },
  label: { letterSpacing: 0.5 },
  optionalHeader: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  input: { borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  textarea: { minHeight: 88 },
  confirm: { marginTop: SPACING.xs, paddingVertical: 15, alignItems: 'center' },
});

export default withErrorBoundary(AddEggSacScreen, 'tv-add-egg-sac');
