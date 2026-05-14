/**
 * Lizard detail — Sprint 8 Bundle 3.
 *
 * Mirror of /reptile/[id] for lizards. Shares all layout primitives via
 * src/components/reptile-detail/ReptileDetailShared so a UX tweak for
 * snakes lands here automatically.
 *
 * ADR-003: snakes/lizards/frogs collapsed into one `animals` table, so
 * the data layer (lib/animals) is taxon-agnostic — log rows carry a
 * single `animal_id` and there's one set of fetchers. This screen still
 * exists as the lizard-shaped route; the unified helpers are aliased
 * back to their lizard-era names so the body doesn't change.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { FeedingIntelligence } from '../../src/components/FeedingIntelligence';
import { FeedingStatusBanner } from '../../src/components/FeedingStatusBanner';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
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
import {
  type Animal as Lizard,
  type FeedingLog,
  type ShedLog,
  type WeightLog,
  animalTitle as lizardTitle,
  getAnimal as getLizard,
  listFeedings,
  listSheds,
  listWeightLogs,
} from '../../src/lib/animals';
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
  const [shareOpen, setShareOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const [lizardR, weightsR, feedingsR, shedsR, photosR] =
      await Promise.allSettled([
        getLizard(id),
        listWeightLogs(id),
        listFeedings(id),
        listSheds(id),
        listPhotos(id),
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
        <AppHeader title="Lizard" leftAction={<HeaderBackButton />} />
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
        <AppHeader title="Lizard" leftAction={<HeaderBackButton />} />
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
      <AppHeader
        title={lizardTitle(lizard)}
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
              onPress={() => router.push(`/lizard/edit/${lizard.id}` as never)}
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

        {/* See snake detail — pause entry now lives in Log Feeding,
            and the banner itself is the resume affordance when paused. */}
        <FeedingStatusBanner
          animalId={lizard.id}
          refreshKey={`${feedings.length}-${lizard.feeding_paused_reason ?? ''}-${lizard.feeding_paused_until ?? ''}`}
          onPausedPress={() => setPauseOpen(true)}
        />

        {/* Species-aware feeding intelligence — see snake detail for
            the equivalent reasoning. Lizard endpoint returns the same
            PreySuggestion shape. */}
        {(() => {
          const lastAccepted = feedings
            .filter((f) => f.accepted)
            .sort(
              (a, b) =>
                new Date(b.fed_at).getTime() - new Date(a.fed_at).getTime(),
            )[0];
          return (
            <FeedingIntelligence
              animalId={lizard.id}
              lastFedAt={lizard.last_fed_at}
              lastAcceptedPreyWeightG={lastAccepted?.prey_weight_g ?? null}
              lastAcceptedFedAt={lastAccepted?.fed_at ?? null}
              refreshKey={`${feedings.length}-${weights.length}-${lizard.current_weight_g ?? ''}`}
            />
          );
        })()}

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
          <WeighInsList
            logs={weights}
            onEditItem={(weightId) =>
              router.push(
                `/lizard/log-weight/${lizard.id}?weightId=${weightId}` as never,
              )
            }
          />
        </Section>

        <Section title="Recent feedings">
          <FeedingsList
            feedings={feedings}
            onEditItem={(feedingId) =>
              router.push(
                `/lizard/log-feeding/${lizard.id}?feedingId=${feedingId}` as never,
              )
            }
          />
        </Section>

        <Section title="Recent sheds">
          <ShedsList
            sheds={sheds}
            onEditItem={(shedId) =>
              router.push(
                `/lizard/log-shed/${lizard.id}?shedId=${shedId}` as never,
              )
            }
          />
        </Section>
      </ScrollView>

      <ReptileShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        taxon="lizard"
        animalId={lizard.id}
        animalName={lizardTitle(lizard)}
      />

      <PauseFeedingSheet
        visible={pauseOpen}
        onClose={() => setPauseOpen(false)}
        animalId={lizard.id}
        animalName={lizardTitle(lizard)}
        currentReason={lizard.feeding_paused_reason}
        currentUntil={lizard.feeding_paused_until}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
});

export default withErrorBoundary(LizardDetailScreen, 'reptile-detail');
