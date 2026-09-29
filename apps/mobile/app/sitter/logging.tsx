/**
 * Logging & activity for one sitter link (PRD-shared-keeping, rung 2).
 *
 * - Turn logging on (premium) with a PIN, change the PIN, or turn it off.
 * - Clear a PIN lockout (optionally with a new PIN), or end the link.
 * - See everything the sitter logged through this link.
 *
 * Its own screen because entering a PIN needs a text field, and there's no
 * cross-platform prompt dialog in React Native (Alert.prompt is iOS-only).
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import SitterButton from '../../src/components/SitterButton';
import UpgradeModal from '../../src/components/UpgradeModal';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { TYPE } from '../../src/theme/tokens';
import {
  fmtDay,
  passErrorMessage,
  pinProblem,
  sitterApi,
  type ActivityEntry,
  type PassSummary,
} from '../../src/lib/sitter-passes';

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function SitterLoggingScreen() {
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pass, setPass] = useState<PassSummary | null>(null);
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [upgrade, setUpgrade] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [list, acts] = await Promise.all([sitterApi.list(), sitterApi.activity(id)]);
      setPass(list.find((p) => p.id === id) ?? null);
      setEntries(acts);
    } catch (e) {
      setEntries([]);
      Alert.alert('Could not load this link', passErrorMessage(e));
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setPin('');
      await load();
    } catch (e: any) {
      if (e?.response?.status === 402) setUpgrade(passErrorMessage(e));
      else Alert.alert('Something went wrong', passErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const ended = pass ? pass.status === 'expired' || pass.status === 'revoked' : false;
  const problem = pin.length >= 4 ? pinProblem(pin) : null;
  const pinOk = pinProblem(pin) === null;
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }];
  const who = pass?.label || 'Your sitter';

  const pinField = (label: string) => (
    <View style={styles.gap}>
      <Text style={[TYPE.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[TYPE.body, styles.input, {
          color: colors.textPrimary, borderColor: problem ? colors.error : colors.border,
          borderRadius: layout.radius.md, backgroundColor: colors.background,
        }]}
        value={pin}
        onChangeText={(t) => setPin(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="4–6 digits"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label}
      />
      <Text style={[TYPE.caption, { color: problem ? colors.error : colors.textTertiary }]}>
        {problem ?? 'Tell your sitter the PIN separately from the link. 5 wrong tries pause the link and tell you.'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Logging & activity"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {pass === null && entries === null && <ActivityIndicator color={colors.primary} />}

        {pass && (
          <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>
            {pass.label || `Link …${pass.token_prefix}`} · until {fmtDay(pass.expires_at)}
          </Text>
        )}

        {pass?.status === 'locked' && (
          <View style={[...card, { borderColor: colors.error }]} accessibilityRole="alert">
            <Text style={[TYPE.bodyStrong, { color: colors.error }]}>Logging on this link is paused</Text>
            <Text style={[TYPE.body, { color: colors.textPrimary }]}>
              Someone entered the wrong PIN 5 times. {who} can still see the feeding list. If it was them, unlock
              logging (a new PIN is safest). If you&apos;re not sure who it was, end the link and send a new one.
            </Text>
            {pinField('New PIN (optional)')}
            <SitterButton label="Unlock" busy={busy} disabled={pin !== '' && !pinOk}
              onPress={() => run(() => sitterApi.unlock(pass.id, pin || undefined))} />
            <SitterButton label="End it" variant="danger" disabled={busy}
              onPress={() => Alert.alert('End this link now?', 'Your sitter loses access immediately.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'End now', style: 'destructive', onPress: () => run(() => sitterApi.revoke(pass.id)) },
              ])} />
          </View>
        )}

        {pass && !ended && pass.status !== 'locked' && (
          <View style={card}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>Logging back</Text>
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>
              {pass.can_log
                ? `On. ${who} can mark animals as fed or refused after entering the PIN. Entries land in your records with their name on them.`
                : 'Off. The link is read-only. Letting your sitter log feedings back is a premium feature.'}
            </Text>
            {pass.can_log ? (
              <>
                {pinField('New PIN')}
                <SitterButton label="Save new PIN" busy={busy} disabled={!pinOk}
                  onPress={() => run(() => sitterApi.update(pass.id, { pin }))} />
                <SitterButton label="Turn off logging" variant="danger" disabled={busy}
                  onPress={() => Alert.alert('Turn off logging?', 'Your sitter can still see the list, but can no longer mark feedings.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Turn off', style: 'destructive', onPress: () => run(() => sitterApi.update(pass.id, { can_log: false })) },
                  ])} />
              </>
            ) : (
              <>
                {pinField('PIN for logging')}
                <SitterButton label="Turn on logging" busy={busy} disabled={!pinOk}
                  onPress={() => run(() => sitterApi.update(pass.id, { can_log: true, pin }))} />
              </>
            )}
          </View>
        )}

        <Text style={[TYPE.heading, styles.h, { color: colors.textPrimary }]}>What {who} logged</Text>
        <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
          These are in your feeding records too, marked as fed by {who}. Edit or delete them there.
        </Text>
        {entries !== null && entries.length === 0 && (
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>Nothing logged yet.</Text>
        )}
        {(entries ?? []).map((e) => {
          const meal = [e.quantity && e.quantity > 1 ? `${e.quantity}×` : null, e.food_size, e.food_type].filter(Boolean).join(' ');
          return (
            <View key={e.id} style={[styles.entry, { borderColor: colors.border }]}>
              <MaterialCommunityIcons name={e.accepted ? 'check-circle' : 'close-circle'} size={20}
                color={e.accepted ? colors.success : colors.textTertiary} />
              <View style={styles.flex}>
                <Text style={[TYPE.body, { color: colors.textPrimary }]}>
                  {e.animal_name} — {e.accepted ? 'fed' : 'refused'}{meal ? ` · ${meal}` : ''}
                </Text>
                <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{fmtWhen(e.fed_at)}</Text>
                {e.notes ? <Text style={[TYPE.caption, { color: colors.textSecondary }]}>“{e.notes}”</Text> : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <UpgradeModal
        visible={upgrade !== null}
        onClose={() => setUpgrade(null)}
        source="shared_keeping"
        title="Sitter logging"
        message={upgrade ?? ''}
        feature="Let your sitter log feedings"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  h: { marginTop: 12 },
  card: { borderWidth: 1, padding: 14, gap: 8 },
  gap: { gap: 4, marginTop: 4 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, letterSpacing: 4 },
  entry: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderBottomWidth: 1, paddingVertical: 10 },
});

export default withErrorBoundary(SitterLoggingScreen, 'sitter-logging');
