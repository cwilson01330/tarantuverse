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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
import { FeedingIntelligence } from '../../src/components/FeedingIntelligence';
import { FeedingStatusBanner } from '../../src/components/FeedingStatusBanner';
import { GenotypeSection } from '../../src/components/GenotypeSection';
import { PauseFeedingSheet } from '../../src/components/PauseFeedingSheet';
import { ReptileShareSheet } from '../../src/components/ReptileShareSheet';
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
// ADR-003: snake/lizard libs collapsed into lib/animals. This is still
// the snake-shaped detail route, so the unified helpers are aliased back
// to their snake-era names — the screen body stays taxon-agnostic.
import {
  type Animal as Snake,
  type FeedingLog,
  type ShedLog,
  type WeightLog,
  animalTitle as snakeTitle,
  getAnimal as getSnake,
  listFeedings,
  listSheds,
  listWeightLogs,
} from '../../src/lib/animals';
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
  const [shareOpen, setShareOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const [snakeR, weightsR, feedingsR, shedsR, photosR] =
      await Promise.allSettled([
        getSnake(id),
        listWeightLogs(id),
        listFeedings(id),
        listSheds(id),
        listPhotos(id),
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
        <AppHeader title="Snake" leftAction={<HeaderBackButton />} />
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
        <AppHeader title="Snake" leftAction={<HeaderBackButton />} />
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
      <AppHeader
        title={snakeTitle(snake)}
        leftAction={<HeaderBackButton />}
        rightAction={
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setShareOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Share public profile"
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="share-variant"
                size={22}
                color={colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`/reptile/edit/${snake.id}` as never)}
              accessibilityRole="button"
              accessibilityLabel="Edit reptile"
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="pencil-outline"
                size={22}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>
        }
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

        {/* When paused, the banner becomes the resume affordance —
            tappable, with an "Edit" hint. The standalone pause pill
            was discoverability-weird; the canonical entry point now
            lives inside Log Feeding (the natural moment to think
            "she's been refusing for weeks, mute reminders"). */}
        <FeedingStatusBanner
          animalId={snake.id}
          refreshKey={`${feedings.length}-${snake.feeding_paused_reason ?? ''}-${snake.feeding_paused_until ?? ''}`}
          onPausedPress={() => setPauseOpen(true)}
        />

        {/* Species-aware feeding intelligence — prey range, interval,
            next feed window, power-feeding flag. Refetches whenever a
            feeding or weight is logged so suggestions stay in sync.
            We compute lastAccepted client-side (newest fed_at where
            accepted=true) rather than trusting server order, since the
            list-feedings endpoint doesn't guarantee a sort. */}
        {(() => {
          const lastAccepted = feedings
            .filter((f) => f.accepted)
            .sort(
              (a, b) =>
                new Date(b.fed_at).getTime() - new Date(a.fed_at).getTime(),
            )[0];
          return (
            <FeedingIntelligence
              animalId={snake.id}
              lastFedAt={snake.last_fed_at}
              lastAcceptedPreyWeightG={lastAccepted?.prey_weight_g ?? null}
              lastAcceptedFedAt={lastAccepted?.fed_at ?? null}
              refreshKey={`${feedings.length}-${weights.length}-${snake.current_weight_g ?? ''}`}
            />
          );
        })()}

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
          <WeighInsList
            logs={weights}
            onEditItem={(weightId) =>
              router.push(
                `/reptile/log-weight/${snake.id}?weightId=${weightId}` as never,
              )
            }
          />
        </Section>

        <Section title="Recent feedings">
          <FeedingsList
            feedings={feedings}
            onEditItem={(feedingId) =>
              router.push(
                `/reptile/log-feeding/${snake.id}?feedingId=${feedingId}` as never,
              )
            }
          />
        </Section>

        <Section title="Recent sheds">
          <ShedsList
            sheds={sheds}
            onEditItem={(shedId) =>
              router.push(
                `/reptile/log-shed/${snake.id}?shedId=${shedId}` as never,
              )
            }
          />
        </Section>

        <Section title="Genetics">
          <GenotypeSection
            snakeId={snake.id}
            scientificName={snake.scientific_name}
          />
          <TouchableOpacity
            onPress={() =>
              router.push(
                `/morph-calculator?snakeId=${snake.id}` as never,
              )
            }
            style={[
              styles.calculatorLink,
              {
                borderColor: colors.border,
                borderRadius: 8,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open the morph calculator with this snake as Parent A"
          >
            <MaterialCommunityIcons
              name="calculator-variant"
              size={18}
              color={colors.primary}
            />
            <Text
              style={{
                color: colors.primary,
                fontSize: 14,
                fontWeight: '600',
                flex: 1,
              }}
            >
              Open morph calculator
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={18}
              color={colors.textTertiary}
            />
          </TouchableOpacity>
        </Section>
      </ScrollView>

      <ReptileShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        taxon="snake"
        animalId={snake.id}
        animalName={snakeTitle(snake)}
      />

      <PauseFeedingSheet
        visible={pauseOpen}
        onClose={() => setPauseOpen(false)}
        animalId={snake.id}
        animalName={snakeTitle(snake)}
        currentReason={snake.feeding_paused_reason}
        currentUntil={snake.feeding_paused_until}
        onChange={onRefresh}
      />
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
  calculatorLink: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
});

export default withErrorBoundary(SnakeDetailScreen, 'reptile-detail');
