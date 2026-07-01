/**
 * Generic invert: new pairing — ADR-010 Phase D (breeding module).
 *
 * Pairs the current invert with another of the same taxon. Male/female is
 * inferred from the current animal's sex (default self→male unless it's
 * explicitly female); the backend validates same-taxon, not sex.
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
  getInvert, listInvertsByTaxon, createInvertPairing, invertDisplayName,
  type Invert,
} from '../../src/lib/inverts';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';
import { getErrorMessage, isPaymentRequired } from '../../src/utils/errors';

const TYPE_OPTIONS = [
  { value: 'natural', label: 'Natural' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'forced', label: 'Forced' },
];

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
        setMates(coll.filter((x) => x.id !== id));
      })
      .catch(() => {});
  }, [id]);

  const handleSave = async () => {
    if (!id || !self) return;
    if (!mateId) { Alert.alert('Pick a mate', 'Choose another animal to pair with.'); return; }
    try {
      setSaving(true);
      const selfFemale = self.sex === 'female';
      await createInvertPairing({
        male_invert_id: selfFemale ? mateId : id,
        female_invert_id: selfFemale ? id : mateId,
        paired_date: new Date(date + 'T12:00:00').toISOString().slice(0, 10),
        pairing_type: pairType,
      });
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
  return (
    <View style={styles.flex}>
      <AppHeader title="New pairing" leftAction={<TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} /></TouchableOpacity>} />
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
