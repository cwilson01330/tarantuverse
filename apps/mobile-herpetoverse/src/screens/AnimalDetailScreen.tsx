/**
 * Animal detail — taxon-agnostic reptile/amphibian detail screen.
 *
 * ADR-003 follow-through: the snake- and lizard-shaped detail screens
 * were near-identical (the lizard one just dropped the Genetics section).
 * They're one screen now — `animal.taxon` drives the empty-state glyph,
 * the share-sheet `taxon` prop, and whether the Genetics section renders
 * (the gene catalog is still ball-python-scoped, so it's snake-only for
 * now — that gate loosens when the catalog grows). Frog detail rides this
 * screen for free.
 *
 * Read-only view of the animal's stats, recent weights, recent feedings,
 * recent sheds. The log-action buttons route into the unified
 * `/reptile/...` route tree.
 *
 * Per-section error handling — one failing fetch shouldn't blank the
 * whole page. The animal fetch failing is the only hard-error state since
 * there's nothing to render below it.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { AppHeader } from '../components/AppHeader';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { FeedingIntelligence } from '../components/FeedingIntelligence';
import { FeedingStatusBanner } from '../components/FeedingStatusBanner';
import { GenotypeSection } from '../components/GenotypeSection';
import { PauseFeedingSheet } from '../components/PauseFeedingSheet';
import { FeedingCadenceSheet } from '../components/FeedingCadenceSheet';
import { ReptileShareSheet } from '../components/ReptileShareSheet';
import { AnimalTransferSection } from '../components/AnimalTransferSection';
import {
  LoadingShell,
  PhotosStrip,
  RetryError,
  Section,
} from '../components/reptile-detail/ReptileDetailShared';
import { AnimalHero } from '../components/reptile-detail/AnimalHero';
import { AnimalTimeline } from '../components/reptile-detail/AnimalTimeline';
import {
  ANIMAL_TAXA,
  type Animal,
  type FeedingLog,
  type ShedLog,
  type WeightLog,
  animalTitle,
  createFeeding,
  getAnimal,
  listFeedings,
  listSheds,
  listWeightLogs,
} from '../lib/animals';
import { type Photo, listPhotos } from '../lib/photos';
import { DEFAULT_CGD_FOOD_TYPE } from '../lib/cgd';

/** Empty-state glyph for the hero card when there's no photo. */
/**
 * Glyph from the taxon registry. The previous ternary only knew snake and
 * frog and fell through to a lizard emoji for everything else — so after
 * ADR-011 widened HV to turtles, tortoises and salamanders, all three
 * rendered as 🦎. The registry is the one place that knows.
 */
function taxonGlyph(taxon: Animal['taxon']): string {
  return ANIMAL_TAXA[taxon]?.glyph ?? '🦕';
}

export function AnimalDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [animal, setAnimal] = useState<Animal | null>(null);
  const [animalError, setAnimalError] = useState<string | null>(null);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [feedings, setFeedings] = useState<FeedingLog[]>([]);
  const [sheds, setSheds] = useState<ShedLog[]>([]);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [cadenceOpen, setCadenceOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const [animalR, weightsR, feedingsR, shedsR, photosR] =
      await Promise.allSettled([
        getAnimal(id),
        listWeightLogs(id),
        listFeedings(id),
        listSheds(id),
        listPhotos(id),
      ]);

    if (animalR.status === 'fulfilled') {
      setAnimal(animalR.value);
      setAnimalError(null);
    } else {
      setAnimalError("Couldn't load this reptile.");
    }
    if (weightsR.status === 'fulfilled') setWeights(weightsR.value);
    if (feedingsR.status === 'fulfilled') setFeedings(feedingsR.value);
    if (shedsR.status === 'fulfilled') setSheds(shedsR.value);
    if (photosR.status === 'fulfilled') setPhotos(photosR.value);
  }, [id]);

  // useFocusEffect re-fires when the user returns from a log-entry
  // screen, so the just-saved row shows up without a manual pull-to-refresh.
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
  if (loading && !animal) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Reptile" leftAction={<HeaderBackButton />} />
        <LoadingShell />
      </SafeAreaView>
    );
  }
  if (animalError && !animal) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Reptile" leftAction={<HeaderBackButton />} />
        <RetryError message={animalError} onRetry={onRefresh} />
      </SafeAreaView>
    );
  }
  if (!animal) return null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* No AppHeader — the hero owns the name and the actions. The header
          used to print the same name ~100px above the hero's copy of it. */}
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
        <AnimalHero
          title={animalTitle(animal)}
          scientificName={animal.scientific_name}
          sex={animal.sex}
          photoUrl={animal.photo_url}
          fallbackGlyph={taxonGlyph(animal.taxon)}
          taxonLabel={ANIMAL_TAXA[animal.taxon]?.label ?? 'Animal'}
          photoCount={photos?.length ?? 0}
          brumationActive={animal.brumation_active}
          onBack={() => router.back()}
          onShare={() => setShareOpen(true)}
          onEdit={() => router.push(`/reptile/edit/${animal.id}` as never)}
          onOpenGallery={() =>
            router.push(`/reptile/photos/${animal.id}` as never)
          }
        />

        <View style={styles.belowHero}>

        {/* When paused, the banner becomes the resume affordance —
            tappable, with an "Edit" hint. The canonical pause entry point
            lives inside Log Feeding (the natural moment to think "it's
            been refusing for weeks, mute reminders"). */}
        {/* ADR-017 — when overdue against a cadence the keeper never chose,
            the banner is also the way to state their own. Suppressed once
            they have, so a red banner then means past THEIR schedule. */}
        <FeedingStatusBanner
          animalId={animal.id}
          refreshKey={`${feedings.length}-${animal.feeding_paused_reason ?? ''}-${animal.feeding_paused_until ?? ''}-${animal.feeding_interval_days ?? ''}`}
          onPausedPress={() => setPauseOpen(true)}
          onSetCadence={() => setCadenceOpen(true)}
          hasKeeperCadence={!!animal.feeding_interval_days}
        />

        {/* Species-aware feeding intelligence — prey range, interval,
            next feed window, power-feeding flag. We compute lastAccepted
            client-side (newest fed_at where accepted=true) rather than
            trusting server order. */}
        {(() => {
          const lastAccepted = feedings
            .filter((f) => f.accepted)
            .sort(
              (a, b) =>
                new Date(b.fed_at).getTime() - new Date(a.fed_at).getTime(),
            )[0];
          return (
            <FeedingIntelligence
              animalId={animal.id}
              lastFedAt={animal.last_fed_at}
              lastAcceptedPreyWeightG={lastAccepted?.prey_weight_g ?? null}
              lastAcceptedFedAt={lastAccepted?.fed_at ?? null}
              refreshKey={`${feedings.length}-${weights.length}-${animal.current_weight_g ?? ''}`}
            />
          );
        })()}

        {/* CGD refresh — one-tap log of a fresh Pangea dish, only for
            animals whose species (or per-animal override) feeds on a
            complete gecko diet. Logging via the full feeding form is
            still available via the Feeding action below. */}
        {animal.feeds_on_cgd && (
          <CgdRefreshSection animal={animal} onRefreshed={onRefresh} />
        )}

        <Section title="Photos">
          <PhotosStrip
            photos={photos}
            onOpenGallery={() =>
              router.push(`/reptile/photos/${animal.id}` as never)
            }
          />
        </Section>

        {/* One merged history replaces the three identically-shaped lists
            (Recent weigh-ins / Recent feedings / Recent sheds) that each
            sorted independently. Client-side merge — no new endpoints. */}
        <Section title="History">
          <AnimalTimeline
            feedings={feedings}
            weights={weights}
            sheds={sheds}
            onOpen={(kind, entryId) => {
              const route =
                kind === 'feeding'
                  ? `/reptile/log-feeding/${animal.id}?feedingId=${entryId}`
                  : kind === 'weight'
                    ? `/reptile/log-weight/${animal.id}?weightId=${entryId}`
                    : `/reptile/log-shed/${animal.id}?shedId=${entryId}`;
              router.push(route as never);
            }}
          />
        </Section>

        {/* Provenance + Transfer/Rehome. The section renders a Provenance
            card only when the animal carries a claimed snapshot, and either a
            "Transferred" badge or the rehome action depending on
            transferred_out_at. Claiming is web-first — no mobile claim
            screen. onTransferred refetches so the badge flips after a link is
            generated. */}
        <AnimalTransferSection animal={animal} onTransferred={onRefresh} />

        {/* Genetics — gated to snakes for now: the gene catalog is
            ball-python-scoped. When the catalog gains lizard/frog genes
            this `taxon === 'snake'` check loosens. */}
        {animal.taxon === 'snake' && (
          <Section title="Genetics">
            <GenotypeSection
              snakeId={animal.id}
              scientificName={animal.scientific_name}
            />
            <TouchableOpacity
              onPress={() =>
                router.push(
                  `/morph-calculator?snakeId=${animal.id}` as never,
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
              accessibilityLabel="Open the morph calculator with this animal as Parent A"
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
        )}
        </View>
      </ScrollView>

      <ReptileShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        animalId={animal.id}
        animalName={animalTitle(animal)}
      />

      <FeedingCadenceSheet
        visible={cadenceOpen}
        animalId={animal.id}
        current={animal.feeding_interval_days ?? null}
        onClose={() => setCadenceOpen(false)}
        onSaved={fetchAll}
      />

      {/* Pinned log bar. These four were outlined secondary buttons
          halfway down the scroll — the most common actions on the screen,
          reachable only after scrolling past three feeding cards. */}
      <View
        style={[
          styles.logBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: 10,
          },
        ]}
      >
        {(
          [
            { icon: 'silverware-fork-knife', label: 'Feeding', route: 'log-feeding' },
            { icon: 'scale-bathroom', label: 'Weight', route: 'log-weight' },
            { icon: 'weather-windy', label: 'Shed', route: 'log-shed' },
            { icon: 'camera-outline', label: 'Photo', route: 'photos' },
          ] as const
        ).map((a) => (
          <TouchableOpacity
            key={a.label}
            style={styles.logBarItem}
            onPress={() =>
              router.push(`/reptile/${a.route}/${animal.id}` as never)
            }
            accessibilityRole="button"
            accessibilityLabel={
              a.route === 'photos'
                ? `Photos for ${animalTitle(animal)}`
                : `Log a ${a.label.toLowerCase()} for ${animalTitle(animal)}`
            }
          >
            <MaterialCommunityIcons name={a.icon} size={20} color={colors.accent} />
            <Text style={[styles.logBarLabel, { color: colors.textSecondary }]}>
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <PauseFeedingSheet
        visible={pauseOpen}
        onClose={() => setPauseOpen(false)}
        animalId={animal.id}
        animalName={animalTitle(animal)}
        currentReason={animal.feeding_paused_reason}
        currentUntil={animal.feeding_paused_until}
        onChange={onRefresh}
      />
    </SafeAreaView>
  );
}

/**
 * Inline card that lets the keeper log a CGD refresh in one tap.
 * Posts a feeding with the default brand and bumps the parent's
 * onRefreshed so the FeedingStatusBanner / FeedingIntelligence /
 * collection card pill update.
 */
function CgdRefreshSection({
  animal,
  onRefreshed,
}: {
  animal: Animal;
  onRefreshed: () => Promise<void> | void;
}) {
  const { colors, layout } = useTheme();
  const [busy, setBusy] = useState(false);

  async function handleRefresh() {
    if (busy) return;
    setBusy(true);
    try {
      await createFeeding(animal.id, {
        fed_at: new Date().toISOString(),
        food_type: DEFAULT_CGD_FOOD_TYPE,
        accepted: true,
      });
      await onRefreshed();
    } catch {
      Alert.alert(
        'Could not log refresh',
        'Something went wrong. Please try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <TouchableOpacity
      onPress={handleRefresh}
      disabled={busy}
      style={[
        styles.cgdCard,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: layout.radius.lg,
          opacity: busy ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Log a CGD refresh"
    >
      <View style={[styles.cgdIcon, { backgroundColor: colors.surface }]}>
        <MaterialCommunityIcons name="leaf" size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cgdTitle, { color: colors.textPrimary }]}>
          Refreshed CGD
        </Text>
        <Text
          style={[styles.cgdSubtitle, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          Logs a fresh dish with the default brand. Adjust later in the full
          feeding form.
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <MaterialCommunityIcons
          name="plus-circle"
          size={22}
          color={colors.primary}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: {
    // No top padding: the hero is full-bleed and runs under the status
    // bar. The rest of the content is inset by contentInset below.
    paddingBottom: 24,
    gap: 16,
  },
  /** Everything after the hero gets the normal 16pt gutter. */
  belowHero: { paddingHorizontal: 16, gap: 16 },

  // Pinned log bar
  logBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  logBarItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  logBarLabel: { fontSize: 10.5, fontWeight: '600' },

  calculatorLink: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  cgdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
  },
  cgdIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cgdTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cgdSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
});

export default AnimalDetailScreen;
