/**
 * Generic invert: new pairing — ADR-021 Phase D (breeding module).
 *
 * Pairs the current invert with another of the same taxon. Male/female is
 * inferred from the current animal's sex; the server validates same-taxon,
 * rejects two animals of the same known sex, and warns (without refusing) on a
 * cross-species pairing.
 *
 * Reachability is the CALLER's job — the detail screen gates on
 * taxonHasModule(taxon, 'breeding'). This screen also checks, because a route
 * is addressable whether or not a button points at it, and a keeper who lands
 * here for an unsupported taxon should be told why rather than shown a form
 * that will 400.
 */
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import DateInput from '../../src/components/DateInput';
import UpgradeModal from '../../src/components/UpgradeModal';
import {
  getInvert, listInvertsByTaxon, createInvertPairing, invertDisplayName, INVERT_TAXA,
  type Invert,
} from '../../src/lib/inverts';
import { taxonHasModule } from '../../src/lib/taxon-modules';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';
import { getErrorMessage, isPaymentRequired } from '../../src/utils/errors';

const TYPE_OPTIONS = [
  { value: 'natural', label: 'Natural' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'forced', label: 'Forced' },
];

/**
 * 'male' | 'female' | null. Case-insensitive because the column is a plain
 * VARCHAR holding UPPERCASE enum names in production, and 'unknown' normalises
 * to null — it's a real answer meaning "no information", not a third sex.
 */
function normalisedSex(sex: string | null | undefined): 'male' | 'female' | null {
  const lowered = (sex ?? '').toLowerCase();
  return lowered === 'male' || lowered === 'female' ? lowered : null;
}

/** Sort key: opposite sex first, then unknown, then same sex last. */
function sexRank(animal: Invert, selfSex: 'male' | 'female'): number {
  const s = normalisedSex(animal.sex);
  if (s && s !== selfSex) return 0;
  if (!s) return 1;
  return 2;
}

export default function AddInvertPairingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [self, setSelf] = useState<Invert | null>(null);
  const [mates, setMates] = useState<Invert[]>([]);
  const [mateId, setMateId] = useState('');
  const [date, setDate] = useState(toISODateLocal(new Date()));
  const [pairType, setPairType] = useState('natural');
  const [saving, setSaving] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    getInvert(id)
      .then(async (inv) => {
        setSelf(inv);
        const coll = await listInvertsByTaxon(inv.taxon).catch(() => [] as Invert[]);
        // Offer the opposite sex first, but never hide the rest: sex is often
        // 'unknown' until maturity, and a keeper who has just sexed an animal
        // on the molt shouldn't have to edit it before they can pair it.
        const selfSex = normalisedSex(inv.sex);
        const others = coll.filter((x) => x.id !== id);
        setMates(
          selfSex
            ? [...others].sort((a, b) => sexRank(a, selfSex) - sexRank(b, selfSex))
            : others,
        );
      })
      .catch(() => {});
  }, [id]);

  const handleSave = async () => {
    if (!id || !self) return;
    if (!mateId) { Alert.alert('Pick a mate', 'Choose another animal to pair with.'); return; }
    try {
      setSaving(true);
      // Case-insensitive on purpose. `sex` is a plain VARCHAR holding UPPERCASE
      // enum names in production (the shared DB convention), so the old
      // `self.sex === 'female'` was never true — every animal landed in the
      // MALE slot, including females. Silent until the server started checking.
      const selfFemale = normalisedSex(self.sex) === 'female';
      const saved = await createInvertPairing({
        male_invert_id: selfFemale ? mateId : id,
        female_invert_id: selfFemale ? id : mateId,
        paired_date: new Date(date + 'T12:00:00').toISOString().slice(0, 10),
        pairing_type: pairType,
      });
      // The server returns advisories (e.g. a cross-species caution) rather
      // than refusing — it records what the keeper did. Show them, then leave.
      if (saved.warnings?.length) {
        Alert.alert('Pairing saved', saved.warnings.join('\n\n'), [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      router.back();
    } catch (err: any) {
      if (isPaymentRequired(err)) {
        setShowUpgradeModal(true);
      } else {
        Alert.alert('Could not save', getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const styles = makeStyles(colors);
  const back = (
    <TouchableOpacity onPress={() => router.back()}>
      <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
    </TouchableOpacity>
  );

  // Own gate, not just the caller's. A route is addressable whether or not a
  // button points at it, and the form would otherwise submit and 400.
  if (self && !taxonHasModule(self.taxon, 'breeding')) {
    const label = (INVERT_TAXA[self.taxon]?.label ?? 'this taxon').toLowerCase();
    return (
      <View style={styles.flex}>
        <AppHeader title="New pairing" leftAction={back} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
            Breeding isn&apos;t available for {label} yet
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
            We turn this on per animal group as the tracking is built out for how
            that group actually breeds. Tell us you want it and it moves up the list.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <AppHeader title="New pairing" leftAction={back} />
      <KeyboardAvoidingView style={styles.flex} behavior={'padding'}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Field label="Mate" colors={colors}>
            {mates.length === 0 ? (
              <Text style={{ color: colors.textTertiary, fontSize: 14 }}>
                No other {self ? '' : ''}animals of this taxon in your collection yet.
              </Text>
            ) : (
              <View style={{ gap: 8 }}>
                {mates.map((m) => {
                  const selected = m.id === mateId;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setMateId(m.id)}
                      style={[styles.mateRow, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '15' : colors.surface }]}
                    >
                      <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{invertDisplayName(m)}</Text>
                      {m.sex ? <Text style={{ color: colors.textTertiary, fontSize: 12 }}>{m.sex}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Field>

          <Field label="Paired date" colors={colors}>
            <DateInput value={parseLocalDate(date) ?? new Date()} onChange={(d) => setDate(toISODateLocal(d))} maximumDate={new Date()} label="Paired date" />
          </Field>

          <Field label="Type" colors={colors}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TYPE_OPTIONS.map((opt) => {
                const selected = opt.value === pairType;
                return (
                  <TouchableOpacity key={opt.value} onPress={() => setPairType(opt.value)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }}>
                    <Text style={{ color: selected ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>

          <TouchableOpacity style={[styles.saveButton, (saving || !mateId) && { opacity: 0.6 }]} onPress={handleSave} disabled={saving || !mateId}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Create pairing'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Upgrade to Premium"
        message="Unlock the full breeding module"
        feature="Breeding"
      />
    </View>
  );
}

function Field({ label, colors, children }: { label: string; colors: ReturnType<typeof useTheme>['colors']; children: React.ReactNode }) {
  return (<View style={{ marginBottom: 16 }}><Text style={{ fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>{children}</View>);
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 48 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.surface },
  mateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  saveButton: { marginTop: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
