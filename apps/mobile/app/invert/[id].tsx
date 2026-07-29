/**
 * Generic invert detail screen — ADR-007.
 *
 * One screen for every non-tarantula taxon. Resolves taxon from the fetched
 * record and reads the registry for glyph / size label. Logs route through
 * the generic /invert/* log screens. Safe-area inset on the hero actions
 * (Android status-bar fix).
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getImageUrl } from '../../src/utils/image-url';
import {
  INVERT_TAXA, deleteInvert, getInvert, invertDisplayName,
  listInvertFeedings, listInvertMolts, listInvertPhotos, listInvertSubstrateChanges,
  deleteInvertFeeding, deleteInvertMolt, deleteInvertSubstrateChange,
  setInvertMainPhoto, deleteInvertPhoto, getInvertGrowth, listInvertPairings,
  createInvertTransfer, createInvertFeeding, getInvertFeedingStats,
  type InvertFeedingStats,
  type Invert, type InvertFeedingLog, type InvertMoltLog, type InvertPhoto, type InvertSubstrateChange,
  type InvertGrowthAnalytics, type InvertPairing,
} from '../../src/lib/inverts';
import { SectionCard, InfoRow as UIInfoRow, InfoGrid, type InfoGridItem } from '../../src/components/ui';
import { SPACING, TYPE } from '../../src/theme/tokens';
import { taxonHasModule, growthLengthLabel } from '../../src/lib/taxon-modules';
import GrowthChart from '../../src/components/GrowthChart';
import PremoltPredictionCard from '../../src/components/PremoltPredictionCard';
import PhotoViewer from '../../src/components/PhotoViewer';
import QRSheet from '../../src/components/QRSheet';
import { PauseFeedingSheet } from '../../src/components/PauseFeedingSheet';
import { getErrorMessage } from '../../src/utils/errors';

function InvertDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [invert, setInvert] = useState<Invert | null>(null);
  const [feedings, setFeedings] = useState<InvertFeedingLog[]>([]);
  const [molts, setMolts] = useState<InvertMoltLog[]>([]);
  const [substrate, setSubstrate] = useState<InvertSubstrateChange[]>([]);
  const [photos, setPhotos] = useState<InvertPhoto[]>([]);
  const [growth, setGrowth] = useState<InvertGrowthAnalytics | null>(null);
  const [pairings, setPairings] = useState<InvertPairing[]>([]);
  const [transferring, setTransferring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Lets the hero's photo-count chip jump to the gallery section.
  const scrollRef = useRef<ScrollView | null>(null);
  const photosY = useRef<number | null>(null);
  // Timeline filter + paging replace three `showAll…` toggles and three
  // independent hard caps.
  const [timelineFilter, setTimelineFilter] = useState<'all' | TimelineKind>('all');
  const [timelineLimit, setTimelineLimit] = useState(12);
  const [feedingStats, setFeedingStats] = useState<InvertFeedingStats | null>(null);
  const [markingFed, setMarkingFed] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  // Which reference rows are open. All collapsed by default — see CollapsibleRow.
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const toggleRow = (key: string) =>
    setOpenRows((prev) => ({ ...prev, [key]: !prev[key] }));
  // Fullscreen gallery. Tapping a thumbnail used to do nothing on this screen —
  // only long-press (set hero / delete) was wired.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const handleTransfer = useCallback(async () => {
    if (!id || transferring) return;
    // Confirm intent first — generating a claim link is the start of handing
    // the animal off. (Claiming itself happens on the web claim page by design.)
    Alert.alert(
      'Transfer this animal?',
      'Generate a one-time claim link to hand this animal to its new keeper. The buyer adds it to their collection — pre-loaded with species, provenance, and photos. We never process the sale.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate link',
          onPress: async () => {
            try {
              setTransferring(true);
              const res = await createInvertTransfer(id, { include_photos: true });
              await Share.share({
                message: `I'm sending you my ${invertDisplayName(invert!)} on Tarantuverse — claim it here: ${res.claim_url}`,
              });
            } catch (err) {
              Alert.alert('Could not create transfer', getErrorMessage(err));
            } finally {
              setTransferring(false);
            }
          },
        },
      ],
    );
  }, [id, invert, transferring]);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const i = await getInvert(id);
      setInvert(i);
      const [f, m, sub, p, g, pr, fs] = await Promise.all([
        listInvertFeedings(i.taxon, id).catch(() => [] as InvertFeedingLog[]),
        listInvertMolts(i.taxon, id).catch(() => [] as InvertMoltLog[]),
        listInvertSubstrateChanges(i.taxon, id).catch(() => [] as InvertSubstrateChange[]),
        listInvertPhotos(i.taxon, id).catch(() => [] as InvertPhoto[]),
        // Growth module is registry-gated (ADR-008) — only fetch where enabled
        taxonHasModule(i.taxon, 'growth')
          ? getInvertGrowth(id).catch(() => null)
          : Promise.resolve(null),
        // Breeding module is registry-gated (ADR-010 Phase D)
        taxonHasModule(i.taxon, 'breeding')
          ? listInvertPairings(id).catch(() => [] as InvertPairing[])
          : Promise.resolve([] as InvertPairing[]),
        // Registry-gated: detritivores/omnivores have no feeding cadence, so
        // a "next feeding" verdict would be fabricated for them.
        taxonHasModule(i.taxon, 'feedingStats')
          ? getInvertFeedingStats(id).catch(() => null)
          : Promise.resolve(null),
      ]);
      setFeedings(f); setMolts(m); setSubstrate(sub); setPhotos(p); setGrowth(g); setPairings(pr);
      setFeedingStats(fs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this animal.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const handleDelete = () => {
    if (!invert) return;
    Alert.alert('Delete?', `This permanently removes ${invertDisplayName(invert)} and all its logs and photos. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteInvert(id!); router.back(); }
        catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete.'); }
      } },
    ]);
  };

  // ── Inline log management (ADR-008) ──────────────────────────────────────
  // Delete confirms then refetches; edit routes to the matching add-* screen
  // in edit mode (logId + prefilled values via params).
  const confirmDeleteLog = (label: string, run: () => Promise<void>) => {
    Alert.alert('Delete this log?', `This removes the ${label} entry. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await run(); await fetchAll(); }
        catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete.'); }
      } },
    ]);
  };

  const editFeeding = (f: InvertFeedingLog) => router.push(
    `/invert/add-feeding?id=${id}&logId=${f.id}&fed_at=${encodeURIComponent(f.fed_at)}&food_type=${encodeURIComponent(f.food_type ?? '')}&food_size=${encodeURIComponent(f.food_size ?? '')}&accepted=${f.accepted}&notes=${encodeURIComponent(f.notes ?? '')}` as any,
  );
  const editMolt = (m: InvertMoltLog) => router.push(
    `/invert/add-molt?id=${id}&logId=${m.id}&molted_at=${encodeURIComponent(m.molted_at)}&notes=${encodeURIComponent(m.notes ?? '')}` as any,
  );
  const editSubstrate = (c: InvertSubstrateChange) => router.push(
    `/invert/add-substrate-change?id=${id}&logId=${c.id}&changed_at=${encodeURIComponent(c.changed_at)}&substrate_type=${encodeURIComponent(c.substrate_type ?? '')}&substrate_depth=${encodeURIComponent(c.substrate_depth ?? '')}&reason=${encodeURIComponent(c.reason ?? '')}&notes=${encodeURIComponent(c.notes ?? '')}` as any,
  );

  // ── Hero / photo management (ADR-008) ────────────────────────────────────
  const handlePhotoLongPress = (photo: InvertPhoto) => {
    const isHero = invert?.photo_url === photo.url;
    Alert.alert('Photo options', photo.caption || 'Manage this photo', [
      { text: 'Cancel', style: 'cancel' },
      ...(!isHero ? [{ text: 'Set as hero photo', onPress: async () => {
        try { await setInvertMainPhoto(photo.id); await fetchAll(); }
        catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Could not set hero photo.'); }
      } }] : []),
      { text: 'Delete photo', style: 'destructive' as const, onPress: () => {
        confirmDeleteLog('photo', () => deleteInvertPhoto(photo.id));
      } },
    ]);
  };

  const styles = makeStyles(colors);

  if (loading) {
    return <View style={[styles.flex, styles.center]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }
  if (error || !invert) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Text style={styles.errorText}>{error || 'Not found.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchAll}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
      </View>
    );
  }

  const meta = INVERT_TAXA[invert.taxon];

  // Display name (name → common → scientific → "Unnamed <taxon>"). Rendered
  // ONCE, in the hero — the old arrangement had it in an AppHeader as well.
  const headerTitle = invertDisplayName(invert);

  // Overflow replaces the old header's edit/delete pair. Delete sitting one
  // tap away in a permanent header button was a lot of exposure for an
  // irreversible action on the app's most-visited screen.
  const openOverflow = () => {
    Alert.alert(headerTitle, undefined, [
      { text: 'Edit', onPress: () => router.push(`/invert/edit?id=${id}` as any) },
      // QR was tarantula-only until the generic upload-session route landed.
      { text: 'QR label & upload', onPress: () => setQrOpen(true) },
      { text: 'Delete', style: 'destructive', onPress: handleDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `Check out ${headerTitle} on Tarantuverse!` });
    } catch {
      // User dismissed the share sheet — not an error worth surfacing.
    }
  };

  const sexGlyph =
    invert.sex === 'female' ? 'gender-female'
      : invert.sex === 'male' ? 'gender-male'
        : null;
  const sexColor =
    invert.sex === 'female' ? colors.female
      : invert.sex === 'male' ? colors.male
        : colors.textTertiary;

  /** Floating hero button — circular, translucent, legible over any photo. */
  const heroButton = (icon: string, label: string, onPress: () => void) => (
    <TouchableOpacity
      style={styles.heroButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <MaterialCommunityIcons name={icon as any} size={20} color="#fff" />
    </TouchableOpacity>
  );

  // Husbandry as a rich icon grid (shared InfoGrid) — the convergence look.
  const husbandryItems: InfoGridItem[] = [];
  if (invert.enclosure_type) husbandryItems.push({ icon: 'shape-outline', label: 'Type', value: invert.enclosure_type });
  if (invert.enclosure_size) husbandryItems.push({ icon: 'cube-outline', label: 'Enclosure', value: invert.enclosure_size });
  if (invert.substrate_type) husbandryItems.push({ icon: 'layers', label: 'Substrate', value: invert.substrate_depth ? `${invert.substrate_type} (${invert.substrate_depth})` : invert.substrate_type });
  if (invert.target_temp_min || invert.target_temp_max) husbandryItems.push({ icon: 'thermometer', label: 'Temperature', value: `${invert.target_temp_min ?? '?'}–${invert.target_temp_max ?? '?'} °F` });
  if (invert.target_humidity_min || invert.target_humidity_max) husbandryItems.push({ icon: 'water-percent', label: 'Humidity', value: `${invert.target_humidity_min ?? '?'}–${invert.target_humidity_max ?? '?'}%` });
  husbandryItems.push({ icon: 'cup-water', label: 'Water dish', value: invert.water_dish ? 'Yes' : 'No' });

  // ── Feeding verdict ───────────────────────────────────────────────────────
  // A sentence, not a number. "Fed 11d ago" makes the keeper do the arithmetic
  // against a cadence they'd have to remember; "Feed in 3 days" answers the
  // question they actually opened the screen with.
  //
  // Every branch below is backed by data we hold. When the species has no
  // recorded feeding frequency (interval_days === null) we say so plainly
  // rather than inventing a schedule — that's the case where a made-up
  // "feed every 7 days" would quietly become husbandry advice.
  const lastPrey = feedings.find((f) => f.accepted)?.food_type?.trim() || null;
  const feedingVerdict = (() => {
    if (!feedingStats) return null;
    const d = feedingStats.days_since_last_feeding;
    const iv = feedingStats.interval_days;

    if (feedingStats.is_feeding_paused) {
      return {
        tone: 'muted' as const,
        icon: 'pause-circle-outline',
        headline: 'Feeding paused',
        detail: feedingStats.feeding_paused_reason
          ? feedingStats.feeding_paused_until
            ? `${feedingStats.feeding_paused_reason} · until ${fmtDate(feedingStats.feeding_paused_until)}`
            : feedingStats.feeding_paused_reason
          : 'Resume from the ⋯ menu when she starts taking food again.',
      };
    }
    if (d === null || d === undefined) {
      return {
        tone: 'muted' as const,
        icon: 'silverware-fork-knife',
        headline: 'Not yet fed',
        detail: 'Log the first feeding to start tracking a cadence.',
      };
    }
    // The backend supplies a fallback interval for animals with no linked
    // species, so `iv` is almost never null — meaning the "no cadence on file"
    // branch below was effectively dead and every animal got a confident
    // "Feed in N days". interval_source is what actually distinguishes a
    // care-sheet cadence from a default, so say which one this is.
    const ivFromSpecies = feedingStats.interval_source === 'species';
    const reasoning = [
      iv
        ? ivFromSpecies
          ? `Every ${iv}d`
          : `Every ${iv}d (default — no species cadence on file)`
        : 'No species cadence on file',
      feedingStats.total_feedings > 0
        ? `${Math.round(feedingStats.acceptance_rate)}% accepted (${feedingStats.total_feedings})`
        : null,
      `fed ${d === 0 ? 'today' : `${d}d ago`}`,
    ].filter(Boolean).join(' · ');

    if (feedingStats.is_overdue) {
      // `is_overdue` fires at days >= interval, so the day the interval is
      // reached gives d - iv === 0 and this read "Feed now — 0d overdue",
      // which is a contradiction. Zero days past due means it's due today.
      const daysPast = iv != null ? d - iv : 0;
      return {
        tone: 'bad' as const,
        icon: 'alert-circle-outline',
        headline: daysPast > 0 ? `Feed now — ${daysPast}d overdue` : 'Feed today',
        detail: reasoning,
      };
    }
    // Only give a prescriptive countdown when the cadence is a species claim.
    // On a default we still flag overdue above (safety net), but we don't
    // present "Feed in 4 days" as though we know this animal's schedule.
    if (iv && ivFromSpecies) {
      const due = iv - d;
      return {
        tone: 'good' as const,
        icon: 'silverware-fork-knife',
        headline: due <= 0 ? 'Feed today' : `Feed in ${due} ${due === 1 ? 'day' : 'days'}`,
        detail: reasoning,
      };
    }
    return {
      tone: 'muted' as const,
      icon: 'silverware-fork-knife',
      headline: d === 0 ? 'Fed today' : `Fed ${d}d ago`,
      detail: reasoning,
    };
  })();

  const verdictColor = (tone?: 'good' | 'bad' | 'muted') =>
    tone === 'bad' ? colors.error : tone === 'good' ? colors.success : colors.textSecondary;

  const handleMarkFed = async () => {
    if (!invert || markingFed) return;
    setMarkingFed(true);
    try {
      await createInvertFeeding(invert.taxon, id!, {
        fed_at: new Date().toISOString(),
        food_type: lastPrey,
        accepted: true,
      });
      await fetchAll();
    } catch (err) {
      Alert.alert('Could not log feeding', getErrorMessage(err));
    } finally {
      setMarkingFed(false);
    }
  };

  // ── Timeline ──────────────────────────────────────────────────────────────
  // Three independent log lists became one. The old arrangement forced the
  // keeper to hold three separate chronologies in their head: "she refused on
  // the 3rd, molted on the 5th" was two lists three sections apart. It also
  // hard-capped each at 5 entries with no way to see more — a year of feedings
  // was simply unreachable on this screen.
  const timeline: TimelineEntry[] = [
    ...feedings.map((f): TimelineEntry => ({
      id: `f-${f.id}`,
      kind: 'feeding',
      at: f.fed_at,
      // Size goes in front of the prey — "a medium cricket". Omitted entirely
      // when unrecorded rather than substituted, so a blank stays a blank.
      title: (() => {
        const prey = [f.food_size?.trim().toLowerCase(), f.food_type?.trim().toLowerCase()]
          .filter(Boolean)
          .join(' ');
        return f.accepted
          ? `Ate ${prey ? `a ${prey}` : 'a feeder'}`
          : `Refused ${prey ? `a ${prey}` : 'food'}`;
      })(),
      trailing: f.accepted ? 'Accepted' : 'Refused',
      trailingTone: f.accepted ? 'good' : 'bad',
      onEdit: () => editFeeding(f),
      onDelete: () => confirmDeleteLog('feeding', () => deleteInvertFeeding(f.id)),
    })),
    ...molts.map((m): TimelineEntry => ({
      id: `m-${m.id}`,
      kind: 'molt',
      at: m.molted_at,
      title: 'Molted',
      onEdit: () => editMolt(m),
      onDelete: () => confirmDeleteLog('molt', () => deleteInvertMolt(m.id)),
    })),
    ...substrate.map((c): TimelineEntry => ({
      id: `s-${c.id}`,
      kind: 'substrate',
      at: c.changed_at,
      title: c.substrate_type ? `Substrate changed — ${c.substrate_type}` : 'Substrate changed',
      trailing: c.substrate_depth ?? undefined,
      trailingTone: 'muted',
      onEdit: () => editSubstrate(c),
      onDelete: () => confirmDeleteLog('substrate change', () => deleteInvertSubstrateChange(c.id)),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const visibleTimeline = timeline
    .filter((e) => timelineFilter === 'all' || e.kind === timelineFilter)
    .slice(0, timelineLimit);
  const filteredTotal = timeline.filter((e) => timelineFilter === 'all' || e.kind === timelineFilter).length;

  const trailingColor = (tone?: TimelineEntry['trailingTone']) =>
    tone === 'good' ? colors.success : tone === 'bad' ? colors.error : colors.textTertiary;

  return (
    <View style={styles.flex}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        {/* Full-bleed hero. Replaces the AppHeader + inset image + separate
            identity block. On the tarantula screen that arrangement printed
            the animal's name THREE times — header title, 28pt title, then
            common_name again on the next line (because `name` already falls
            back to common_name). One name, in one place, over the photo. */}
        <View style={styles.hero}>
          {invert.photo_url ? (
            <Image source={{ uri: getImageUrl(invert.photo_url) }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Text style={{ fontSize: 64 }}>{meta?.glyph ?? '🐾'}</Text>
            </View>
          )}

          {/* Scrim — without it, white text over a pale photo is unreadable. */}
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', 'rgba(0,0,0,0.82)']}
            style={StyleSheet.absoluteFill as any}
          />

          <View style={[styles.heroActions, { top: insets.top + 8 }]}>
            {heroButton('chevron-left', 'Back', () => router.back())}
            <View style={{ flex: 1 }} />
            {heroButton('share-variant', 'Share', handleShare)}
            {heroButton('dots-horizontal', 'More actions', openOverflow)}
          </View>

          {/* Photo count → the gallery. The hero shows one photo and the rest
              sit most of a screen further down, so the chip scrolls there
              rather than opening the add-photo form (which is what a naive
              "photos" tap target would do — and would be a trap). */}
          {photos.length > 1 ? (
            <TouchableOpacity
              style={styles.photoCountChip}
              onPress={() => {
                if (photosY.current != null) {
                  scrollRef.current?.scrollTo({ y: Math.max(0, photosY.current - 12), animated: true });
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`${photos.length} photos. Scrolls to the gallery.`}
            >
              <MaterialCommunityIcons name="image-multiple-outline" size={13} color="#fff" />
              <Text style={styles.photoCountText}>{photos.length}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.heroCaption}>
            <View style={styles.heroNameRow}>
              <Text style={styles.heroName} numberOfLines={2}>{headerTitle}</Text>
              {sexGlyph ? (
                <MaterialCommunityIcons
                  name={sexGlyph as any}
                  size={17}
                  color={sexColor}
                  accessibilityLabel={invert.sex === 'female' ? 'Female' : 'Male'}
                />
              ) : null}
            </View>
            <View style={styles.heroSubtitleRow}>
              {invert.scientific_name ? (
                <Text style={styles.heroScientific} numberOfLines={1}>{invert.scientific_name}</Text>
              ) : null}
              {/* NB: the handoff's subtitle includes {age}. There is no honest
                  source for it — `date_acquired` is when the KEEPER got the
                  animal, not when it hatched, and the mobile Invert type has no
                  life_stage. Molt count is the real proxy keepers use, so that's
                  what's shown when we have it. */}
              {invert.current_instar ? (
                <Text style={styles.heroMeta}>· {invert.current_instar} molts</Text>
              ) : null}
              <Text style={styles.heroMeta}>· {meta?.label ?? 'Invert'}</Text>
            </View>
          </View>
        </View>

      {/* Feeding card — the question the keeper opened the screen to answer,
          answered first. Registry-gated: a millipede has no feeding cadence,
          so it gets no card rather than a fabricated one. */}
      {feedingVerdict && (
        <SectionCard>
          <View style={styles.feedHead}>
            <View
              style={[
                styles.feedIcon,
                { backgroundColor: verdictColor(feedingVerdict.tone) + '24' },
              ]}
            >
              <MaterialCommunityIcons
                name={feedingVerdict.icon as any}
                size={22}
                color={verdictColor(feedingVerdict.tone)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.feedHeadline, { color: verdictColor(feedingVerdict.tone) }]}>
                {feedingVerdict.headline}
              </Text>
              <Text style={styles.feedDetail}>{feedingVerdict.detail}</Text>
            </View>
          </View>

          {!feedingStats?.is_feeding_paused && (
            <View style={styles.feedActions}>
              <TouchableOpacity
                style={[styles.feedPrimary, { backgroundColor: colors.primary }]}
                onPress={handleMarkFed}
                disabled={markingFed}
                accessibilityRole="button"
                accessibilityLabel={lastPrey ? `Log a feeding of ${lastPrey}` : 'Log a feeding'}
              >
                <MaterialCommunityIcons name="check" size={17} color="#fff" />
                <Text style={styles.feedPrimaryText}>
                  {markingFed ? 'Saving…' : lastPrey ? `Fed — ${lastPrey}` : 'Fed'}
                </Text>
              </TouchableOpacity>
              {/* The full form, for a different prey item / date / refusal. */}
              <TouchableOpacity
                style={[styles.feedSecondary, { borderColor: colors.border }]}
                onPress={() => router.push(`/invert/add-feeding?id=${id}` as any)}
                accessibilityRole="button"
                accessibilityLabel="Log a feeding with full details"
              >
                <MaterialCommunityIcons name="tune-variant" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedSecondary, { borderColor: colors.border }]}
                onPress={() => setPauseOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Pause feeding reminders"
              >
                <MaterialCommunityIcons name="pause" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Paused animals get the way back out in the same place. */}
          {feedingStats?.is_feeding_paused && (
            <TouchableOpacity
              style={{ marginTop: SPACING.md }}
              onPress={() => setPauseOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Change or end the feeding pause"
            >
              <Text style={[styles.timelineMore, { color: colors.accent }]}>Manage pause</Text>
            </TouchableOpacity>
          )}
        </SectionCard>
      )}

      <Section title="Identity">
        <InfoRow label="Sex" value={fmtSex(invert.sex)} colors={colors} />
        <InfoRow label="Molts" value={invert.current_instar ? String(invert.current_instar) : '—'} colors={colors} />
        <InfoRow label={meta?.sizeLabel ?? 'Size'} value={invert.current_length_mm ? `${invert.current_length_mm} mm` : '—'} colors={colors} />
        <InfoRow label="Acquired" value={invert.date_acquired ?? '—'} colors={colors} />
      </Section>

      {hasHusbandry(invert) && (
        <CollapsibleRow
          icon="home-variant-outline"
          title="Husbandry"
          // Substrate is what a keeper actually glances for; enclosure type is
          // the fallback when substrate hasn't been recorded.
          preview={
            invert.substrate_type
              ? [invert.substrate_type, invert.substrate_depth].filter(Boolean).join(' · ')
              : invert.enclosure_type || null
          }
          expanded={!!openRows.husbandry}
          onToggle={() => toggleRow('husbandry')}
          colors={colors}
        >
          <InfoGrid items={husbandryItems} />
        </CollapsibleRow>
      )}

      {/* Provenance (BRIEF §6) — render only the facts we actually have. */}
      {invert.provenance && (
        <CollapsibleRow
          icon="account-arrow-right-outline"
          title="Provenance"
          preview={
            invert.provenance.breeder_handle
              ? `@${invert.provenance.breeder_handle}`
              : invert.provenance.transferred_at
                ? `Acquired ${fmtDate(invert.provenance.transferred_at)}`
                : null
          }
          expanded={!!openRows.provenance}
          onToggle={() => toggleRow('provenance')}
          colors={colors}
        >
          {invert.provenance.breeder_handle ? (
            <InfoRow label="Bred / sold by" value={`@${invert.provenance.breeder_handle}`} colors={colors} />
          ) : null}
          {invert.provenance.dam_scientific_name ? (
            <InfoRow label="Dam" value={invert.provenance.dam_scientific_name} colors={colors} />
          ) : null}
          {invert.provenance.sire_scientific_name ? (
            <InfoRow label="Sire" value={invert.provenance.sire_scientific_name} colors={colors} />
          ) : null}
          {invert.provenance.sac_laid_date ? (
            <InfoRow label="Sac laid" value={invert.provenance.sac_laid_date} colors={colors} />
          ) : null}
          {invert.provenance.transferred_at ? (
            <InfoRow label="Acquired via transfer" value={fmtDate(invert.provenance.transferred_at)} colors={colors} />
          ) : null}
        </CollapsibleRow>
      )}

      {/* Transfer / rehome (BRIEF §6). Claiming happens on the web claim page.
          A transferred-out animal stays expanded — that's a status, not
          reference material, and collapsing it would hide the fact that this
          record is historical. */}
      {invert.transferred_out_at ? (
        <Section title="Transfer / rehome">
          <Text style={[s.empty, { color: colors.textTertiary }]}>
            ✓ Transferred {fmtDate(invert.transferred_out_at)}. This is a historical record.
          </Text>
        </Section>
      ) : (
        <CollapsibleRow
          icon="swap-horizontal"
          title="Transfer / rehome"
          preview="Generate a claim link for a buyer"
          expanded={!!openRows.transfer}
          onToggle={() => toggleRow('transfer')}
          colors={colors}
        >
          <Text style={[s.empty, { color: colors.textTertiary }]}>
            Sold or rehoming this animal? Generate a claim link the buyer can use to
            add it to their collection — pre-loaded with species, provenance, and
            photos. We never process the sale.
          </Text>
          {/* The action lives inside the expanded body now — CollapsibleRow has
              no header action slot, and putting "Generate claim link" on a
              collapsed row would sit one stray tap from handing an animal away. */}
          <TouchableOpacity
            onPress={handleTransfer}
            disabled={transferring}
            style={{ marginTop: SPACING.sm }}
            accessibilityRole="button"
          >
            <Text style={[styles.timelineMore, { color: colors.accent }]}>
              {transferring ? 'Working…' : 'Generate claim link'}
            </Text>
          </TouchableOpacity>
        </CollapsibleRow>
      )}

      {/* One interleaved history. Long-press a row to edit or delete it —
          the same gesture the photo strip already uses. Putting a pencil and
          a bin on every row (the old LogSection treatment) meant three tap
          targets per entry competing with the entry itself. */}
      <Section title="History">
        <View style={styles.timelineChips}>
          {(['all', 'feeding', 'molt', 'substrate'] as const).map((k) => {
            const active = timelineFilter === k;
            const count = k === 'all' ? timeline.length : timeline.filter((e) => e.kind === k).length;
            if (k !== 'all' && count === 0) return null;
            return (
              <TouchableOpacity
                key={k}
                style={[
                  styles.timelineChip,
                  { borderColor: colors.border },
                  active && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => { setTimelineFilter(k); setTimelineLimit(12); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.timelineChipText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {k === 'all' ? 'All' : TIMELINE_META[k].label} {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {visibleTimeline.length === 0 ? (
          <Text style={[s.empty, { color: colors.textTertiary }]}>
            Nothing logged yet. Use the bar at the bottom to record a feeding, molt or substrate change.
          </Text>
        ) : (
          visibleTimeline.map((e) => (
            <TouchableOpacity
              key={e.id}
              style={[styles.timelineRow, { backgroundColor: colors.surfaceElevated }]}
              onLongPress={() => {
                Alert.alert(e.title, fmtDate(e.at), [
                  { text: 'Edit', onPress: e.onEdit },
                  { text: 'Delete', style: 'destructive', onPress: e.onDelete },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${e.title}, ${fmtRelative(e.at)}${e.trailing ? `, ${e.trailing}` : ''}`}
              accessibilityHint="Long press to edit or delete this entry."
            >
              <View style={[styles.timelineIcon, { backgroundColor: colors.primary + '1F' }]}>
                <MaterialCommunityIcons name={TIMELINE_META[e.kind].icon as any} size={16} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineTitle} numberOfLines={1}>{e.title}</Text>
                <Text style={styles.timelineDate}>{fmtRelative(e.at)}</Text>
              </View>
              {e.trailing ? (
                <Text style={[styles.timelineTrailing, { color: trailingColor(e.trailingTone) }]}>
                  {e.trailing}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))
        )}

        {filteredTotal > visibleTimeline.length ? (
          <TouchableOpacity
            onPress={() => setTimelineLimit((n) => n + 24)}
            accessibilityRole="button"
            style={{ paddingTop: SPACING.sm }}
          >
            <Text style={[styles.timelineMore, { color: colors.accent }]}>
              Show {Math.min(24, filteredTotal - visibleTimeline.length)} more
            </Text>
          </TouchableOpacity>
        ) : null}
      </Section>

      {/* Premolt module (registry-gated). Tarantula-only today — the model is
          tuned on tarantula feeding-refusal + molt-interval signal and isn't
          validated elsewhere. Rendering it here rather than only on the old
          tarantula screen is what makes that screen safe to retire. */}
      {taxonHasModule(invert.taxon, 'premolt') && (
        <View style={{ marginHorizontal: SPACING.lg, marginVertical: SPACING.xs }}>
          <PremoltPredictionCard tarantulaId={id!} />
        </View>
      )}

      {/* Growth module (registry-gated — ADR-008 rollout, scorpion pilot).
          GrowthChart renders its own card, so no Section wrapper. */}
      {taxonHasModule(invert.taxon, 'growth') && growth && growth.total_molts > 0 && (
        <CollapsibleRow
          icon="chart-line"
          title="Growth"
          preview={`${growth.total_molts} ${growth.total_molts === 1 ? 'molt' : 'molts'} recorded`}
          expanded={!!openRows.growth}
          onToggle={() => toggleRow('growth')}
          colors={colors}
        >
          <GrowthChart data={growth as any} lengthLabel={growthLengthLabel(invert.taxon)} />
        </CollapsibleRow>
      )}

      {/* Breeding module (registry-gated — ADR-010 Phase D) */}
      {taxonHasModule(invert.taxon, 'breeding') && (
        <Section title="Breeding" actionLabel="New pairing" onAction={() => router.push(`/invert/add-pairing?id=${id}` as any)}>
          {pairings.length === 0 ? (
            <Text style={[s.empty, { color: colors.textTertiary }]}>No pairings yet. Pair this animal with another to start tracking.</Text>
          ) : (
            pairings.map((p) => (
              <View key={p.id} style={styles.breedRow}>
                <Text style={styles.logRowTitle}>Pairing</Text>
                <Text style={styles.logRowMeta}>{fmtDate(p.paired_date)} · {(p.outcome || '').replace(/_/g, ' ')}</Text>
              </View>
            ))
          )}
        </Section>
      )}

      <View onLayout={(e) => { photosY.current = e.nativeEvent.layout.y; }}>
      <Section title="Photos" actionLabel="Add photo" onAction={() => router.push(`/invert/add-photo?id=${id}` as any)}>
        {photos.length === 0 ? (
          <Text style={[s.empty, { color: colors.textTertiary }]}>No photos yet.</Text>
        ) : (
          <>
            <FlatList horizontal data={photos} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}
              renderItem={({ item, index }) => {
                const isHero = invert.photo_url === item.url;
                return (
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setViewerIndex(index)} onLongPress={() => handlePhotoLongPress(item)} accessibilityRole="imagebutton" accessibilityLabel={isHero ? 'Hero photo. Opens full screen; long-press to manage.' : 'Photo. Opens full screen; long-press to set as hero or delete.'}>
                    <Image source={{ uri: getImageUrl(item.thumbnail_url ?? item.url) }} style={styles.photoThumb} />
                    {isHero && (
                      <View style={styles.heroTag}>
                        <MaterialCommunityIcons name="star" size={11} color="#fff" />
                        <Text style={styles.heroTagText}>Hero</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }} />
            <Text style={[s.empty, { color: colors.textTertiary, fontStyle: 'normal' }]}>Tap to view full screen. Long-press to set as hero or delete.</Text>
          </>
        )}
      </Section>
      </View>

      {invert.notes ? (
        <CollapsibleRow
          icon="note-text-outline"
          title="Notes"
          preview={invert.notes.replace(/\s+/g, ' ').trim()}
          expanded={!!openRows.notes}
          onToggle={() => toggleRow('notes')}
          colors={colors}
        >
          <Text style={styles.notes}>{invert.notes}</Text>
        </CollapsibleRow>
      ) : null}
      </ScrollView>

      {/* Pinned action bar. Inverts had NO quick-log affordance at all — the
          only way to record a scorpion feeding was to scroll until you found
          the "Log feeding" text link on the Feedings section. The tarantula
          screen has had this bar all along; the split is why it never crossed
          over. Labels stay identical across taxa so muscle memory transfers.
          Safe-area inset or it overhangs the Android nav bar. */}
      <View
        style={[
          styles.actionBar,
          { paddingBottom: insets.bottom + SPACING.sm, borderTopColor: colors.border },
        ]}
      >
        {([
          { icon: 'silverware-fork-knife', label: 'Feed', route: `/invert/add-feeding?id=${id}` },
          { icon: 'arrow-expand-vertical', label: 'Molt', route: `/invert/add-molt?id=${id}` },
          { icon: 'layers-outline', label: 'Substrate', route: `/invert/add-substrate-change?id=${id}` },
          { icon: 'camera-outline', label: 'Photo', route: `/invert/add-photo?id=${id}` },
        ] as const).map((a) => (
          <TouchableOpacity
            key={a.label}
            style={styles.actionBarItem}
            onPress={() => router.push(a.route as any)}
            accessibilityRole="button"
            accessibilityLabel={`Log ${a.label.toLowerCase()}`}
          >
            <MaterialCommunityIcons name={a.icon as any} size={20} color={colors.accent} />
            <Text style={styles.actionBarLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* `resource="inverts"` — PUT /inverts/{id} takes the same two pause
          fields and works for every taxon, so this no longer has to be the
          tarantula screen's exclusive feature. */}
      <PauseFeedingSheet
        visible={pauseOpen}
        onClose={() => setPauseOpen(false)}
        tarantulaId={id!}
        resource="inverts"
        tarantulaName={headerTitle}
        currentReason={feedingStats?.feeding_paused_reason ?? null}
        currentUntil={feedingStats?.feeding_paused_until ?? null}
        onChange={fetchAll}
      />

      <QRSheet
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        tarantulaId={id!}
        resource="inverts"
        tarantulaName={headerTitle}
        scientificName={invert.scientific_name}
        onPhotoAdded={fetchAll}
      />

      <PhotoViewer
        visible={viewerIndex !== null}
        photos={photos as any}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

function fmtSex(sex: Invert['sex']): string { if (!sex || sex === 'unknown') return '—'; return sex.charAt(0).toUpperCase() + sex.slice(1); }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleDateString(); } catch { return iso; } }

/**
 * Relative date for timeline rows — "Today" / "3d ago" / "2mo ago".
 *
 * Calendar-day based, in the keeper's own zone. A raw millisecond delta
 * flips "today" to "1d ago" at UTC midnight rather than theirs, which reads
 * as broken to anyone who isn't on UTC.
 */
function fmtRelative(iso: string): string {
  try {
    const then = new Date(iso);
    const a = new Date(then.getFullYear(), then.getMonth(), then.getDate());
    const n = new Date();
    const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const days = Math.round((b.getTime() - a.getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 60) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  } catch {
    return fmtDate(iso);
  }
}

/** One row in the merged timeline, whatever kind of log produced it. */
type TimelineKind = 'feeding' | 'molt' | 'substrate';
interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: string;
  /** Sentence, not a label — "Ate a cricket" beats "Feeding · accepted". */
  title: string;
  /** Right-aligned outcome or delta. */
  trailing?: string;
  trailingTone?: 'good' | 'bad' | 'muted';
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Collapsed detail row with a preview.
 *
 * Husbandry, provenance, growth, transfer and notes are reference material —
 * a keeper opens this screen to feed an animal or check when it last molted,
 * not to re-read its substrate depth. Fully expanded they pushed the timeline
 * (the part that changes) most of a screen down. The preview means collapsing
 * them doesn't hide the answer when the answer is one line: "Coco fibre · 3in"
 * is the whole husbandry summary most of the time.
 *
 * Hoisted to module scope on purpose. A component defined inside the screen
 * function is a new component TYPE on every render, which unmounts its subtree
 * — the bug that once ate keystrokes in the collection search field.
 */
function CollapsibleRow({
  icon, title, preview, expanded, onToggle, colors, children,
}: {
  icon: string;
  title: string;
  preview?: string | null;
  expanded: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  children: React.ReactNode;
}) {
  return (
    <View style={{
      marginHorizontal: SPACING.lg,
      marginVertical: SPACING.xs,
      borderRadius: 13,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    }}>
      <TouchableOpacity
        onPress={onToggle}
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 11, paddingHorizontal: 14 }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={preview ? `${title}. ${preview}` : title}
        accessibilityHint={expanded ? 'Collapses this section.' : 'Expands this section.'}
      >
        <MaterialCommunityIcons name={icon as any} size={18} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>{title}</Text>
          {!expanded && preview ? (
            <Text style={[TYPE.caption, { color: colors.textTertiary }]} numberOfLines={1}>{preview}</Text>
          ) : null}
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textTertiary}
        />
      </TouchableOpacity>
      {expanded ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View>
      ) : null}
    </View>
  );
}

const TIMELINE_META: Record<TimelineKind, { icon: string; label: string }> = {
  feeding: { icon: 'silverware-fork-knife', label: 'Feed' },
  molt: { icon: 'arrow-expand-vertical', label: 'Molt' },
  substrate: { icon: 'layers-outline', label: 'Sub' },
};
function hasHusbandry(s: Invert): boolean {
  return Boolean(s.enclosure_type || s.enclosure_size || s.substrate_type || s.substrate_depth || s.target_temp_min || s.target_temp_max || s.target_humidity_min || s.target_humidity_max);
}

// Thin wrappers that preserve this screen's call sites while delegating to
// the shared, preset-aware primitives (ADR-007). `colors` on InfoRow is now
// unused — the shared primitive reads theme itself — but kept in the
// signature so the many call sites don't need touching.
function Section({ title, actionLabel, onAction, children }: { title: string; actionLabel?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <SectionCard title={title} actionLabel={actionLabel} onAction={onAction}>
      {children}
    </SectionCard>
  );
}

function InfoRow({ label, value }: { label: string; value: string; colors?: ReturnType<typeof useTheme>['colors'] }) {
  return <UIInfoRow label={label} value={value} />;
}

// NB: `LogSection` was deleted here along with the three lists that used it.
// One merged History section replaced Feedings / Molts / Substrate changes,
// so there's nothing left that renders a per-type log list.

const s = StyleSheet.create({
  empty: { ...TYPE.label, fontStyle: 'italic' },
});

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    // Clears the pinned action bar — content used to end flush with the
    // screen bottom, so the last section sat under the bar.
    scroll: { paddingBottom: 96 },
    actionBar: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: colors.surface,
      paddingTop: SPACING.sm,
    },
    actionBarItem: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
    actionBarLabel: { ...TYPE.caption, color: colors.textSecondary, fontWeight: '600' },
    hero: { position: 'relative', height: 214, justifyContent: 'flex-end' },
    heroImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
    heroPlaceholder: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
    heroActions: {
      position: 'absolute',
      left: SPACING.md,
      right: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    heroButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(10,10,15,0.55)',
    },
    photoCountChip: {
      position: 'absolute',
      right: SPACING.md,
      bottom: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 9,
      backgroundColor: 'rgba(10,10,15,0.62)',
    },
    photoCountText: { ...TYPE.caption, color: '#fff', fontWeight: '700' },
    heroCaption: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: 2 },
    heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    heroName: { ...TYPE.title, color: '#fff', flexShrink: 1 },
    heroSubtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    heroScientific: { ...TYPE.label, color: 'rgba(255,255,255,0.86)', fontStyle: 'italic' },
    heroMeta: { ...TYPE.label, color: 'rgba(255,255,255,0.72)' },
    logRowTitle: { ...TYPE.bodyStrong, color: colors.textPrimary, flex: 1 },
    logRowMeta: { ...TYPE.caption, color: colors.textTertiary },
    feedHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    feedIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    feedHeadline: { ...TYPE.bodyStrong, fontWeight: '700' },
    feedDetail: { ...TYPE.caption, color: colors.textTertiary, marginTop: 2 },
    feedActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md },
    feedPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 12,
    },
    feedPrimaryText: { ...TYPE.bodyStrong, color: '#fff', fontWeight: '700' },
    feedSecondary: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timelineChips: { flexDirection: 'row', gap: 7, marginBottom: SPACING.sm, flexWrap: 'wrap' },
    timelineChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
    timelineChipText: { ...TYPE.caption, fontWeight: '600' },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 13,
      marginBottom: 6,
    },
    timelineIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    timelineTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
    timelineDate: { ...TYPE.caption, color: colors.textTertiary },
    timelineTrailing: { ...TYPE.caption, fontWeight: '700' },
    timelineMore: { ...TYPE.label, fontWeight: '700' },
    breedRow: { paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    photoThumb: { width: 96, height: 96, borderRadius: 8, backgroundColor: colors.surfaceElevated },
    heroTag: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    heroTagText: { ...TYPE.caption, color: '#fff' },
    notes: { ...TYPE.body, color: colors.textSecondary },
    errorText: { ...TYPE.body, color: colors.textPrimary, marginBottom: SPACING.lg },
    retryButton: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, backgroundColor: colors.primary, borderRadius: 8 },
    retryText: { ...TYPE.bodyStrong, color: '#fff' },
  });

export default withErrorBoundary(InvertDetailScreen);
