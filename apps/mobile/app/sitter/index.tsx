/**
 * Sitter & sharing — list of sitter links (PRD-shared-keeping).
 *
 * The link itself is never stored on the phone or the server; "send it again"
 * is "New link", which retires the old one and every open session from it.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import SitterButton from '../../src/components/SitterButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { TYPE } from '../../src/theme/tokens';
import {
  PASS_MAX_DAYS,
  STATUS_LABEL,
  fmtDay,
  passErrorMessage,
  sitterApi,
  stashReveal,
  type PassSummary,
} from '../../src/lib/sitter-passes';

function SitterListScreen() {
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [passes, setPasses] = useState<PassSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPasses(await sitterApi.list());
    } catch (e) {
      setPasses([]);
      Alert.alert('Could not load your links', passErrorMessage(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', passErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const rotate = (p: PassSummary) =>
    Alert.alert('Make a new link?', 'The old link — and anyone already using it — stops working straight away.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'New link',
        onPress: () =>
          run(p.id, async () => {
            stashReveal(await sitterApi.rotate(p.id));
            router.push({ pathname: '/sitter/new', params: { reveal: '1' } } as never);
          }),
      },
    ]);

  const revoke = (p: PassSummary) =>
    Alert.alert('End this link now?', 'Your sitter loses access immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End now', style: 'destructive', onPress: () => run(p.id, async () => { await sitterApi.revoke(p.id); await load(); }) },
    ]);

  const extend = (p: PassSummary) => {
    const maxEnd = new Date(p.starts_at).getTime() + PASS_MAX_DAYS * 86400000 - 60000;
    const current = new Date(p.expires_at).getTime();
    const options = [1, 3, 7]
      .map((d) => ({ d, at: Math.min(current + d * 86400000, maxEnd) }))
      .filter((o) => o.at > current);
    if (options.length === 0) {
      Alert.alert('Already at the limit', `Links last at most ${PASS_MAX_DAYS} days. Make a new one for a longer trip.`);
      return;
    }
    Alert.alert('Extend this link', `It currently ends ${fmtDay(p.expires_at)}.`, [
      ...options.map((o) => ({
        text: `+${o.d} day${o.d === 1 ? '' : 's'} (to ${fmtDay(new Date(o.at).toISOString())})`,
        onPress: () => run(p.id, async () => { await sitterApi.update(p.id, { expires_at: new Date(o.at).toISOString() }); await load(); }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const open = (passes ?? []).filter((p) => p.status === 'active' || p.status === 'scheduled');
  const past = (passes ?? []).filter((p) => !(p.status === 'active' || p.status === 'scheduled'));
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Sitter & sharing"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={[TYPE.body, { color: colors.textSecondary }]}>
          Going away? Send whoever&apos;s feeding a link to a care card for each animal. No account needed, and it ends on the date you pick.
        </Text>
        <SitterButton label="New sitter link" onPress={() => router.push('/sitter/new' as never)} />
        <SitterButton label="Your routine" variant="secondary" onPress={() => router.push('/sitter/guide' as never)}
          accessibilityHint="Edit the steps and emergency info shown on every link" />

        <Text style={[TYPE.heading, styles.h, { color: colors.textPrimary }]}>Open links</Text>
        {passes === null && <ActivityIndicator color={colors.primary} />}
        {passes !== null && open.length === 0 && <Text style={[TYPE.body, { color: colors.textSecondary }]}>No open links.</Text>}
        {open.map((p) => (
          <View key={p.id} style={card}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>{p.label || `Link …${p.token_prefix}`}</Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
              {STATUS_LABEL[p.status]} · {p.animal_count} animals · {fmtDay(p.starts_at)} → {fmtDay(p.expires_at)}
            </Text>
            <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
              {p.open_count > 0 && p.last_used_at ? `Opened ${p.open_count}× · last ${fmtDay(p.last_used_at)}` : 'Not opened yet'}
            </Text>
            <View style={styles.row}>
              <View style={styles.flexBtn}>
                <SitterButton label="Preview" variant="secondary" busy={busy === p.id}
                  onPress={() => router.push({ pathname: '/sitter/preview', params: { id: p.id } } as never)} />
              </View>
              <View style={styles.flexBtn}>
                <SitterButton label="Extend" variant="secondary" disabled={!!busy} onPress={() => extend(p)} />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.flexBtn}>
                <SitterButton label="New link" variant="secondary" disabled={!!busy} onPress={() => rotate(p)} />
              </View>
              <View style={styles.flexBtn}>
                <SitterButton label="End now" variant="danger" disabled={!!busy} onPress={() => revoke(p)} />
              </View>
            </View>
          </View>
        ))}

        {past.length > 0 && (
          <>
            <Text style={[TYPE.heading, styles.h, { color: colors.textPrimary }]}>Past links</Text>
            {past.slice(0, 10).map((p) => (
              <View key={p.id} style={[styles.pastRow, { borderColor: colors.border }]}>
                <Text style={[TYPE.body, { color: colors.textPrimary }]}>{p.label || `Link …${p.token_prefix}`}</Text>
                <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{STATUS_LABEL[p.status]} · {fmtDay(p.expires_at)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  h: { marginTop: 12 },
  card: { borderWidth: 1, padding: 14, gap: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  flexBtn: { flex: 1 },
  pastRow: { borderBottomWidth: 1, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between' },
});

export default withErrorBoundary(SitterListScreen, 'sitter-list');
