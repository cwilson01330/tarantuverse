/**
 * Snake detail — Sprint 8 Bundle 3.
 *
 * Adapted from web-herpetoverse/src/app/app/reptiles/[id]/SnakeDetailClient.tsx,
 * but slim: read-only view of the snake's stats, recent weights, recent
 * feedings, recent sheds. The "Log feeding" / "Log weight" / "Log shed"
 * action buttons route to Bundle 4 placeholder paths so the navigation
 * shape is testable now and the form screens drop in cleanly later.
 *
 * Per-section error handling — one failing fetch (e.g. /weights returns
 * 500) shouldn't blank the whole page. We still surface the snake itself
 * via a hard-error state if the snake fetch fails since there's nothing
 * to render below it.
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
  type ShedLog,
  type Snake,
  type WeightLog,
  getSnake,
  listFeedings,
  listSheds,
  listWeightLogs,
  snakeTitle,
} from '../../src/lib/snakes';
import { type Photo, listPhotos } from '../../src/lib/photos';

function SnakeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [snake, setSnake] = useState<Snake | null>(null);
  const [snakeError, setSnakeError] = useState<string | null>(null);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [feedings, setFeedings] = useState<FeedingLog[]>([]);
  const [sheds, setSheds] = useState<ShedLog[]>([]);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const [snakeR, weightsR, feedingsR, shedsR, photosR] =
      await Promise.allSettled([
        getSnake(id),
        listWeightLogs(id),
        listFeedings(id),
        listSheds(id),
        listPhotos('snake', id),
      ]);

    if (snakeR.status === 'fulfilled') {
      setSnake(snakeR.value);
      setSnakeError(null);
    } else {
      setSnakeError("Couldn't load this snake.");
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

  // ---- Loading + error gates ----
  if (loading && !snake) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={{ title: 'Snake', headerBackTitle: 'Back' }} />
        <LoadingShell />
      </SafeAreaView>
    );
  }
  if (snakeError && !snake) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={{ title: 'Snake', headerBackTitle: 'Back' }} />
        <RetryError message={snakeError} onRetry={onRefresh} />
      </SafeAreaView>
    );
  }
  if (!snake) return null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen
        options={{
          title: snakeTitle(snake),
          headerBackTitle: 'Back',
          headerRight: () => (
            <TouchableOpacity
              onPress={() =>
                router.push(`/reptile/edit/${snake.id}` as never)
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
          title={snakeTitle(snake)}
          scientificName={snake.scientific_name}
          sex={snake.sex}
          photoUrl={snake.photo_url}
          currentWeightG={snake.current_weight_g}
          lastFedAt={snake.last_fed_at}
          lastShedAt={snake.last_shed_at}
          brumationActive={snake.brumation_active}
          fallbackGlyph="🐍"
        />

        <LogActions
          onLogFeeding={() =>
            router.push(`/reptile/log-feeding/${snake.id}` as never)
          }
          onLogWeight={() =>
            router.push(`/reptile/log-weight/${snake.id}` as never)
          }
          onLogShed={() =>
            router.push(`/reptile/log-shed/${snake.id}` as never)
          }
        />

        <Section title="Photos">
          <PhotosStrip
            photos={photos}
            onOpenGallery={() =>
              router.push(`/reptile/photos/${snake.id}` as never)
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

export default withErrorBoundary(SnakeDetailScreen, 'reptile-detail');
