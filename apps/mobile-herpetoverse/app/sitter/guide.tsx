/**
 * Your routine — written once, shown on every sitter link (PRD-shared-keeping).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import SitterButton from '../../src/components/SitterButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { TYPE } from '../../src/theme/type';
import { passErrorMessage, sitterApi, type SitterGuide } from '../../src/lib/sitter-passes';

function SitterGuideScreen() {
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [guide, setGuide] = useState<SitterGuide | null>(null);
  const [steps, setSteps] = useState('');
  const [ownEmergency, setOwnEmergency] = useState(false);
  const [emergency, setEmergency] = useState('');
  const [contact, setContact] = useState('');
  const [vet, setVet] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sitterApi
      .guide()
      .then((g) => {
        setGuide(g);
        setSteps(g.routine_steps.join('\n'));
        setOwnEmergency(g.emergency_text !== null);
        setEmergency(g.emergency_text ?? g.default_emergency.join('\n'));
        setContact(g.contact_line ?? '');
        setVet(g.vet_contact ?? '');
      })
      .catch((e) => Alert.alert('Could not load your routine', passErrorMessage(e)));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await sitterApi.saveGuide({
        routine_steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
        emergency_text: ownEmergency ? emergency : null,
        contact_line: contact.trim() || null,
        vet_contact: vet.trim() || null,
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', passErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }];
  const input = [TYPE.body, styles.input, { color: colors.textPrimary, borderColor: colors.border, borderRadius: layout.radius.md, backgroundColor: colors.background }];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Your routine"
        subtitle="Shown on every sitter link"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      {!guide ? (
        <ActivityIndicator style={styles.pad} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={card}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>The round</Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>One step per line.</Text>
            <TextInput style={[input, styles.multiline]} multiline value={steps} onChangeText={setSteps}
              placeholder={'Feeders are in the green tub in the garage.\nStart with the rack by the window.'}
              placeholderTextColor={colors.textTertiary} accessibilityLabel="Routine steps, one per line" />
          </View>

          <View style={card}>
            <View style={styles.between}>
              <Text style={[TYPE.subheading, styles.flex, { color: colors.textPrimary }]}>Write my own emergency advice</Text>
              <Switch value={ownEmergency} onValueChange={setOwnEmergency} accessibilityLabel="Write my own emergency advice" />
            </View>
            {ownEmergency ? (
              <TextInput style={[input, styles.multiline]} multiline value={emergency} onChangeText={setEmergency}
                accessibilityLabel="Emergency advice" />
            ) : (
              guide.default_emergency.map((t, i) => (
                <Text key={i} style={[TYPE.caption, { color: colors.textSecondary }]}>• {t}</Text>
              ))
            )}
          </View>

          <View style={card}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>How to reach you</Text>
            <TextInput style={input} value={contact} onChangeText={setContact} maxLength={200} placeholder="Text me: 555-0100"
              placeholderTextColor={colors.textTertiary} accessibilityLabel="How to reach you" />
            <Text style={[TYPE.label, styles.gap, { color: colors.textSecondary }]}>Vet or backup keeper (optional)</Text>
            <TextInput style={input} value={vet} onChangeText={setVet} maxLength={200}
              accessibilityLabel="Vet or backup keeper" />
          </View>

          <SitterButton label="Save routine" busy={saving} onPress={save} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { marginTop: 32 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: 1, padding: 14, gap: 8 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  gap: { marginTop: 8 },
  between: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

export default withErrorBoundary(SitterGuideScreen, 'sitter-guide');
