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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import {
  FeedingsList,
  LoadingShell,
  LogActions,
  PhotosStrip,
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
import { type Photo, listPhotos } from '../../src/lib/photos';

function LizardDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [lizard, setLizard] = useState<Lizard | null>(null);
  const [lizardError, setLizardError] = useState<string | null>(null);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [feedings, setFeedings] = useState<FeedingLog[]>([]);
  const [sheds, setSheds] = useState<ShedLog[]>([]);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const [lizardR, weightsR, feedingsR, shedsR, photosR] =
      await Promise.allSettled([
        getLizard(id),
        listWeightLogs(id),
        listFeedings(id),
        listSheds(id),
        listPhotos('lizard', id),
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
    if (photosR.status === 'fulfilled') setPhotos(photosR.value);
  }, [id]);

  // useFocusEffect re-fires when the user returns from a log-entry
  // screen (Bundle 4), so the just-saved row shows up without forcing
  // a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchAll().finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [fetchAll]),
  );

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
          headerRight: () => (
            <TouchableOpacity
              onPress={() =>
                router.push(`/lizard/edit/${lizard.id}` as never)
              }
              accessibilityRole="button"
              accessibilityLabel="Edit reptile"
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <MaterialCommunityIcons
                name="pencil-outline"
                size={22}
                color={colors.primary}
              />
            </TouchableOpacity>
          ),
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
          onLogFeeding={() =>
            router.push(`/lizard/log-feeding/${lizard.id}` as never)
          }
          onLogWeight={() =>
            router.push(`/lizard/log-weight/${lizard.id}` as never)
          }
          onLogShed={() =>
            router.push(`/lizard/log-shed/${lizard.id}` as never)
          }
        />

        <Section title="Photos">
          <PhotosStrip
            photos={photos}
            onOpenGallery={() =>
              router.push(`/lizard/photos/${lizard.id}` as never)
            }
          />
        </Section>

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
