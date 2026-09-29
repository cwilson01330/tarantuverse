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
import { FeedingCard } from '../components/reptile-detail/FeedingCard';
import { StatStrip } from '../components/reptile-detail/StatStrip';
import {
  ANIMAL_TAXA,
  type Animal,
  type FeedingLog,
  type ShedLog,
  type WeightLog,
  animalTitle,
  getAnimal,
  listFeedings,
  listSheds,
  listWeightLogs,
} from '../lib/animals';
import { type Photo, listPhotos } from '../lib/photos';
import { useAuth } from '../contexts/AuthContext';
import { TYPE } from '../theme/type';
import { ROLE_HELP, ROLE_LABEL, can, canChangeEntry, useCollectionRole } from '../lib/co-keepers';

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
  const [geneticsOpen, setGeneticsOpen] = useState(false);
  const [geneSummary, setGeneSummary] = useState<string | null>(null);
  // A failed history fetch must not read as "nothing logged" (§14).
  const [historyError, setHistoryError] = useState(false);

  // Co-keepers (rung 3): what the viewer may do here. Hides controls that
  // would fail — the API checks every request. Nothing write-shaped shows
  // until the role resolves.
  const { user } = useAuth();
  const { role, ownerName } = useCollectionRole(user?.id, animal?.user_id);
  const isOwner = role === 'owner';
  const canLog = can(role, 'logger');
  const canKeep = can(role, 'keeper');
  const mayChange = useCallback(
    (e: { logged_by_user_id?: string | null }) => canChangeEntry(role, user?.id, e),
    [role, user?.id],
  );

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
    setHistoryError(
      weightsR.status === 'rejected' || feedingsR.status === 'rejected' || shedsR.status === 'rejected',
    );
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
          onShare={isOwner ? () => setShareOpen(true) : undefined}
          onEdit={canKeep ? () => router.push(`/reptile/edit/${animal.id}` as never) : undefined}
          onOpenGallery={() =>
            router.push(`/reptile/photos/${animal.id}` as never)
          }
        />

        <View style={styles.belowHero}>

        {role && !isOwner && (
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>
            {ownerName ? `${ownerName}'s animal. ` : ''}You're a {ROLE_LABEL[role]} — {ROLE_HELP[role]}
          </Text>
        )}

        {/* One feeding card — replaces the status banner, the feeding
            intelligence panel and the CGD refresh card (design handoff,
            screen 9). Pause, schedule and CGD live inside it. */}
        <FeedingCard
          animal={animal}
          feedings={feedings}
          refreshKey={`${feedings.length}-${weights.length}-${animal.current_weight_g ?? ''}-${animal.feeding_paused_reason ?? ''}-${animal.feeding_paused_until ?? ''}-${animal.feeding_interval_days ?? ''}`}
          canLog={canLog}
          canKeep={canKeep}
          onLogged={onRefresh}
          onFullForm={() => router.push(`/reptile/log-feeding/${animal.id}` as never)}
          onPause={() => setPauseOpen(true)}
          onSetCadence={() => setCadenceOpen(true)}
        />

        <StatStrip animal={animal} weights={weights} feedings={feedings} />

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
          {historyError ? (
            <View
              style={[styles.historyError, { borderColor: colors.danger + '55', backgroundColor: colors.danger + '12' }]}
              accessibilityRole="alert"
            >
              <Text style={[TYPE.body, { color: colors.textPrimary }]}>
                Some of this animal&apos;s history didn&apos;t load, so the list below may be incomplete.
              </Text>
              <TouchableOpacity onPress={onRefresh} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
                <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <AnimalTimeline
            feedings={feedings}
            weights={weights}
            sheds={sheds}
            canChange={mayChange}
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
        {/* Owner-only: co-keepers never transfer (rung 3). */}
        {isOwner && <AnimalTransferSection animal={animal} onTransferred={onRefresh} />}

        {/* Genetics — gated to snakes for now: the gene catalog is
            ball-python-scoped. When the catalog gains lizard/frog genes
            this `taxon === 'snake'` check loosens. */}
        {/* Genetics stay with the owner for now (rung 3 v1 surface). */}
        {isOwner && animal.taxon === 'snake' && (
          <View style={[styles.collapsible, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setGeneticsOpen((o) => !o)}
              style={styles.collapsibleHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: geneticsOpen }}
              accessibilityLabel={`Genetics${geneSummary ? `: ${geneSummary}` : ''}`}
            >
              <MaterialCommunityIcons name="dna" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>Genetics</Text>
                {!geneticsOpen && geneSummary !== null ? (
                  <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                    {geneSummary || 'No genes recorded'}
                  </Text>
                ) : null}
              </View>
              <MaterialCommunityIcons
                name={geneticsOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
            {/* Mounted while collapsed (just hidden) so it can report the
                preview line — it owns the genotype + gene-catalog fetch. */}
            <View style={geneticsOpen ? styles.collapsibleBody : styles.hidden}>
              <GenotypeSection
                snakeId={animal.id}
                scientificName={animal.scientific_name}
                onSummary={setGeneSummary}
              />
              <TouchableOpacity
                onPress={() => router.push(`/morph-calculator?snakeId=${animal.id}` as never)}
                style={[styles.calculatorLink, { borderColor: colors.border, borderRadius: 8 }]}
                accessibilityRole="button"
                accessibilityLabel="Open the morph calculator with this animal as Parent A"
              >
                <MaterialCommunityIcons name="calculator-variant" size={18} color={colors.primary} />
                <Text style={[TYPE.bodyStrong, { color: colors.primary, flex: 1 }]}>Open morph calculator</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
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
      {canLog && <View
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
      </View>}

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

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: {
    // No top padding: the hero is full-bleed and runs under the status
    // bar. The rest of the content is inset by contentInset below.
    paddingBottom: 24,
    gap: 16,
  },
  historyError: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6, marginBottom: 8 },
  collapsible: { borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  collapsibleHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 11, paddingHorizontal: 14 },
  collapsibleBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  hidden: { display: 'none' },
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
});

export default AnimalDetailScreen;
