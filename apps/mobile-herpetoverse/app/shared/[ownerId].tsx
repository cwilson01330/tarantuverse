/**
 * A collection shared with you (co-keepers, PRD-shared-keeping rung 3).
 *
 * What's due, a one-tap Fed / Refused for loggers and up, and every animal —
 * each opening the ordinary detail screen, which shows only what your role
 * can do. Someone else's animals never appear in your own Collection tab:
 * a shared collection stays separate so counts, caps and exports stay clear.
 * Mirrors apps/mobile/app/shared/[ownerId].tsx.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { AppHeader } from '../../src/components/AppHeader';
import SitterButton from '../../src/components/SitterButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { TYPE } from '../../src/theme/type';
import { apiClient } from '../../src/services/api';
import { ANIMAL_TAXA, isAnimalTaxon } from '../../src/lib/animals';
import {
  MEMBER_APP, ROLE_HELP, ROLE_LABEL, can, coKeeperErrorMessage, loadSharedWithMe, type SharedCollection,
} from '../../src/lib/co-keepers';

interface Due {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  days_since_last_feeding: number | null;
  is_feeding_paused: boolean;
  is_overdue: boolean;
  interval_days: number | null;
  status_mode?: 'daily' | 'interval';
  fed_today?: boolean;
  is_brumating?: boolean;
}
interface Row { id: string; name: string | null; common_name?: string | null; scientific_name?: string | null; taxon: string }

function title(r: { name: string | null; common_name?: string | null; scientific_name?: string | null }): string {
  return r.name || r.common_name || r.scientific_name || 'Unnamed';
}

/** Same rule as Feeding Day: frequent feeders are "due" until fed today. */
function isDue(d: Due): boolean {
  if (d.is_feeding_paused || d.is_brumating) return false;
  return d.status_mode === 'daily' ? !d.fed_today : d.is_overdue;
}

function SharedCollectionScreen() {
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const { colors, layout } = useTheme();
  const { user } = useAuth();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [membership, setMembership] = useState<SharedCollection | null | undefined>(undefined);
  const [due, setDue] = useState<Due[] | null>(null);
  const [animals, setAnimals] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!ownerId) return;
    const shared = await loadSharedWithMe(true, user?.id ?? null);
    const m = shared?.collections.find((c) => c.owner.id === ownerId && c.app === MEMBER_APP) ?? null;
    setMembership(m);
    if (!m) return;
    const params = { collection: ownerId };
    const [d, a] = await Promise.all([
      apiClient.get<Due[]>('/animals/feeding-status', { params: { ...params, tz_offset_minutes: new Date().getTimezoneOffset() } })
        .then((r) => r.data).catch(() => []),
      apiClient.get<Row[]>('/animals/', { params }).then((r) => r.data).catch(() => []),
    ]);
    setDue(d);
    setAnimals(a);
  }, [ownerId, user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const log = async (id: string, accepted: boolean) => {
    setBusy(id);
    try {
      if (accepted) {
        // Reuses the animal's last meal server-side, same as Feeding Day.
        await apiClient.post(`/animals/${id}/quick-feed`);
      } else {
        await apiClient.post(`/animals/${id}/feedings`, { fed_at: new Date().toISOString(), accepted: false });
      }
      setDone((prev) => ({ ...prev, [id]: accepted ? 'Fed' : 'Refused' }));
    } catch (e) {
      Alert.alert("That didn't save", coKeeperErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const role = membership?.role;
  const canLog = can(role, 'logger') && !membership?.read_only;
  const canKeep = can(role, 'keeper') && !membership?.read_only;
  const dueNow = (due ?? []).filter(isDue);
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title={membership ? `${membership.owner.name}'s collection` : 'Shared collection'}
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
        {membership === undefined && <ActivityIndicator color={colors.primary} />}
        {membership === null && (
          <View style={card}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>This collection isn&apos;t shared with you</Text>
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>If you were removed or left, ask the owner for a new invite.</Text>
          </View>
        )}
        {membership && (
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>
            You&apos;re a <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>{ROLE_LABEL[membership.role]}</Text> — {ROLE_HELP[membership.role]}
            {membership.read_only && membership.role !== 'viewer' ? ' Read-only for now: the owner’s plan has lapsed.' : ''}
          </Text>
        )}

        {membership && (
          <>
            <Text style={[TYPE.heading, styles.h, { color: colors.textPrimary }]}>
              Due for feeding{due ? ` (${dueNow.length})` : ''}
            </Text>
            {due === null && <ActivityIndicator color={colors.primary} />}
            {due && dueNow.length === 0 && <Text style={[TYPE.body, { color: colors.textSecondary }]}>Nothing due right now.</Text>}
            {dueNow.map((d) => (
              <View key={d.id} style={card}>
                <TouchableOpacity onPress={() => router.push(`/reptile/${d.id}` as never)} accessibilityRole="link">
                  <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>{title(d)}</Text>
                  <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
                    {d.days_since_last_feeding == null ? 'Not fed yet' : `Fed ${d.days_since_last_feeding}d ago`}
                    {d.interval_days ? ` · every ~${d.interval_days}d` : ''}
                  </Text>
                </TouchableOpacity>
                {done[d.id] ? (
                  <Text style={[TYPE.bodyStrong, { color: colors.success }]}>✓ {done[d.id]}</Text>
                ) : canLog ? (
                  <View style={styles.row}>
                    <View style={styles.flexBtn}>
                      <SitterButton label="Fed" busy={busy === d.id} disabled={!!busy} onPress={() => log(d.id, true)} />
                    </View>
                    <View style={styles.flexBtn}>
                      <SitterButton label="Refused" variant="secondary" disabled={!!busy} onPress={() => log(d.id, false)} />
                    </View>
                  </View>
                ) : null}
              </View>
            ))}

            <Text style={[TYPE.heading, styles.h, { color: colors.textPrimary }]}>Animals</Text>
            {canKeep && (
              <SitterButton label="Add an animal" variant="secondary"
                onPress={() => router.push({ pathname: '/reptile/add', params: { collection: ownerId } } as never)} />
            )}
            {animals === null && <ActivityIndicator color={colors.primary} />}
            {(animals ?? []).map((r) => (
              <TouchableOpacity key={r.id} style={[...card, styles.animalRow]} accessibilityRole="link"
                onPress={() => router.push(`/reptile/${r.id}` as never)}>
                <Text style={TYPE.title} accessibilityElementsHidden importantForAccessibility="no">
                  {isAnimalTaxon(r.taxon) ? ANIMAL_TAXA[r.taxon].glyph : '🦎'}
                </Text>
                <View style={styles.flex}>
                  <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>{title(r)}</Text>
                  {!!r.name && !!(r.common_name || r.scientific_name) && (
                    <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{r.common_name || r.scientific_name}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
            {animals && animals.length === 0 && (
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>No animals in this collection yet.</Text>
            )}
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
  card: { borderWidth: 1, padding: 14, gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  flexBtn: { flex: 1 },
  animalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

export default withErrorBoundary(SharedCollectionScreen, 'shared-collection');
