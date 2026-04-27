/**
 * Lizard detail — Sprint 8 Bundle 3.
 *
 * Mirror of /reptile/[id] for lizards. Shares all layout primitives via
 * src/components/reptile-detail/ReptileDetailShared so a UX tweak for
 * snakes lands here automatically.
 *
 * Note on polymorphic logs: the lizard endpoints
 * (/lizards/{id}/weights, /feedings, /sheds) return rows that have BOTH
 * `snake_id` and `lizard_id` columns; exactly one is non-null. The
 * server filters to lizard rows for these routes so the response is
 * shape-clean for UI use — see src/lib/lizards.ts for the type defs.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import {
  FeedingsList,
  LoadingShell,
  LogActions,
  ReptileHero,
  RetryError,
  Section,
  ShedsList,
  WeighInsList,
} from '../../src/components/reptile-detail/ReptileDetailShared';
import {
  type FeedingLog,
  type Lizard,
  type ShedLog,
  type WeightLog,
  getLizard,
  listFeedings,
  listSheds,
  listWeightLogs,
  lizardTitle,
} from '../../src/lib/lizards';

function LizardDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [lizard, setLizard] = useState<Lizard | null>(null);
  const [lizardError, setLizardError] = useState<string | null>(null);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [feedings, setFeedings] = useState<FeedingLog[]>([]);
  const [sheds, setSheds] = useState<ShedLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const [lizardR, weightsR, feedingsR, shedsR] = await Promise.allSettled([
      getLizard(id),
      listWeightLogs(id),
      listFeedings(id),
      listSheds(id),
    ]);

    if (lizardR.status === 'fulfilled') {
      setLizard(lizardR.value);
      setLizardError(null);
    } else {
      setLizardError("Couldn't load this lizard.");
    }
    if (weightsR.status === 'fulfilled') setWeights(weightsR.value);
    if (feedingsR.status === 'fulfilled') setFeedings(feedingsR.value);
    if (shedsR.status === 'fulfilled') setSheds(shedsR.value);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAll().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  if (loading && !lizard) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={{ title: 'Lizard', headerBackTitle: 'Back' }} />
        <LoadingShell />
      </SafeAreaView>
    );
  }
  if (lizardError && !lizard) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={{ title: 'Lizard', headerBackTitle: 'Back' }} />
        <RetryError message={lizardError} onRetry={onRefresh} />
      </SafeAreaView>
    );
  }
  if (!lizard) return null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen
        options={{
          title: lizardTitle(lizard),
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <ReptileHero
          title={lizardTitle(lizard)}
          scientificName={lizard.scientific_name}
          sex={lizard.sex}
          photoUrl={lizard.photo_url}
          currentWeightG={lizard.current_weight_g}
          lastFedAt={lizard.last_fed_at}
          lastShedAt={lizard.last_shed_at}
          brumationActive={lizard.brumation_active}
          fallbackGlyph="🦎"
        />

        <LogActions
          // Bundle 4: replace with /lizard/<id>/log-feeding etc.
          onLogFeeding={() => router.push('/reptile/add' as never)}
          onLogWeight={() => router.push('/reptile/add' as never)}
          onLogShed={() => router.push('/reptile/add' as never)}
        />

        <Section title="Recent weigh-ins">
          <WeighInsList logs={weights} />
        </Section>

        <Section title="Recent feedings">
          <FeedingsList feedings={feedings} />
        </Section>

        <Section title="Recent sheds">
          <ShedsList sheds={sheds} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
});

export default withErrorBoundary(LizardDetailScreen, 'reptile-detail');
