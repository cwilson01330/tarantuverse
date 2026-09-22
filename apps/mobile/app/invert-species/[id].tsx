/**
 * Generic invert species care sheet — ADR-007.
 *
 * One care sheet for every invert taxon. Safety treatment is data-driven:
 * a species with a venom_severity shows the venom tier; one without shows
 * the "Harmless" treatment. feeding_mode is surfaced in Feeding.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../src/contexts/ThemeContext';
import { KeeperSignalsBlock } from '../../src/components/KeeperSignalsBlock';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import {
  getInvertSpecies,
  FEEDING_MODE_LABELS,
  INVERT_TAXA,
  taxonMdiIcon,
  type InvertSpecies,
} from '../../src/lib/inverts';
import {
  CareSheetHero,
  QuickStatsRow,
  SafetyLine,
  CareAccordion,
  CareFact,
  careLevelMeta,
  previewOf,
  shareSpecies,
} from '../../src/components/caresheet';
import { useShortlistToggle } from '../../src/hooks/useShortlistToggle';

const VENOM_LABELS: Record<string, string> = { mild: 'Mild', moderate: 'Moderate', medically_significant: 'Medically significant' };
// Care-level labels now come from careLevelMeta() in components/caresheet,
// shared with the tarantula sheet so the wording can't drift.

// Taxon-honest copy for the green "harmless" safety callout (matches web).
const HARMLESS_COPY: Record<string, { title: string; body: string }> = {
  whip_spider: { title: 'No venom, no sting', body: "Whip spiders (amblypygids) are completely harmless to humans. They're fast and can deliver a harmless pinch with their pedipalps, but have no venom and no sting." },
  vinegaroon: { title: 'No venom, no sting', body: 'Vinegaroons are harmless to humans — no venom and no sting. If threatened they can spray a fine acetic-acid mist (it smells like vinegar) and give a firm pinch, but neither is dangerous. Avoid getting the spray in your eyes.' },
  mantis: { title: 'No venom, no sting', body: 'Mantises are harmless to humans. They have no venom or sting — the worst they can do is grip with their spined forelegs or deliver a startling but harmless nip.' },
  millipede: { title: 'No venom, no sting', body: "Millipedes don't bite or sting and have no venom. Many do secrete defensive chemicals when stressed, so wash your hands after handling and keep them away from your eyes and mouth." },
  roach: { title: 'No venom, no sting', body: 'Pet and feeder roaches are harmless to humans — no venom, no sting, and no meaningful bite. Wash your hands after handling.' },
  true_spider: { title: 'Not medically significant', body: 'Like all spiders, this species has venom, but it is not considered medically significant to humans. Bites are uncommon and, at worst, comparable to a bee sting for most people. Handle minimally.' },
};
const DEFAULT_HARMLESS = { title: 'No medically significant venom', body: 'This species is not considered dangerous to humans. Always research individual care before keeping.' };

/**
 * Chemical defences — the hazard the venom fields can't describe.
 *
 * A millipede has no venom and can still burn you. The taxon-level
 * HARMLESS_COPY above says "many do secrete defensive chemicals", which is
 * the best a hardcoded per-taxon string can manage; this is the per-species
 * version, so a keeper learns which chemical and how much to care. Hydrogen
 * cyanide in particular is a different hazard class from a staining quinone
 * and deserves to be named.
 *
 * 'none' is a real, recorded answer — "we checked, it doesn't" — and renders
 * nothing rather than a reassurance the data doesn't support.
 */
const SECRETION_COPY: Record<string, { title: string; body: string; accent: string }> = {
  benzoquinone: {
    title: 'Secretes benzoquinones',
    body: "Stains skin brown for several days and stings badly in the eyes or on broken skin. Wash your hands after handling, don't rub your face, and keep it well away from small children.",
    accent: '#f97316',
  },
  hydrogen_cyanide: {
    title: 'Secretes hydrogen cyanide',
    body: 'Releases small amounts of hydrogen cyanide when stressed. Harmless in an open room and in the quantities involved, but handle in ventilated space, never in a closed container held to your face, and wash your hands afterwards.',
    accent: '#ef4444',
  },
  acetic_acid: {
    title: 'Sprays acetic acid',
    body: 'Can spray a fine, concentrated vinegar mist when threatened. Not dangerous to skin, but genuinely painful in the eyes — keep it below face level when handling.',
    accent: '#f97316',
  },
  other: {
    title: 'Has a chemical defence',
    body: 'Produces a defensive secretion when stressed. Wash your hands after handling and avoid contact with your eyes.',
    accent: '#f97316',
  },
};

const STAGE_SCHEME_LABELS: Record<string, string> = {
  sling_juvenile_adult: 'Sling → juvenile → adult',
  instar: 'Numbered instars',
  none: 'No distinct stages',
};

const DEVELOPMENTAL_CLASS_LABELS: Record<string, string> = {
  anamorphic: 'Anamorphic — gains segments with each moult',
  epimorphic: 'Epimorphic — hatches with its full segment count',
};

/** Boolean facts render only when RECORDED. `null` means nobody has checked,
 *  and "No" would assert something the data doesn't say. */
function yesNo(v: boolean | null | undefined): string | null {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return null;
}

function InvertSpeciesCareSheetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    pName?: string; pSci?: string; pCare?: string; pImg?: string;
    pType?: string; pVerified?: string; pHot?: string;
  }>();
  const { id } = params;
  /** Optimistic header data from the browser row — lets the header paint on
   *  the first frame instead of showing a bare spinner mid-transition. */
  const preview = {
    name: params.pName ?? '',
    sci: params.pSci ?? '',
    care: params.pCare ?? '',
    img: params.pImg ?? '',
    type: params.pType ?? '',
    verified: params.pVerified === '1',
    hot: params.pHot === '1',
  };
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [species, setSpecies] = useState<InvertSpecies | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Enclosure open by default — the reason people open a care sheet. The
  // rest collapse, with a preview line so a closed sheet still says what's
  // inside.
  const { isBookmarked, bookmarkBusy, toggle: toggleBookmark } = useShortlistToggle(id);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ enclosure: true });
  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try { setSpecies(await getInvertSpecies(id)); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't load this care sheet."); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { fetch(); }, [fetch]);

  const styles = makeStyles(colors);
  if (loading) {
    // With preview params, paint the real header immediately; without them
    // (deep link / search) fall back to a plain spinner.
    if (!preview.sci) {
      return (
        <View style={[styles.flex, styles.center]}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      );
    }
    const previewCare = careLevelMeta(preview.care, colors.textSecondary);
    return (
      <View style={styles.flex}>
        <CareSheetHero
          imageUrl={preview.img || null}
          commonName={preview.name || undefined}
          scientificName={preview.sci}
          isVerified={preview.verified}
          badges={[
            ...(preview.care ? [{ label: previewCare.text, color: previewCare.color }] : []),
            ...(preview.hot ? [{ label: 'Hot venom', color: '#ef4444' }] : []),
            ...(preview.type ? [{ label: preview.type }] : []),
          ]}
          topInset={insets.top}
          onBack={() => router.back()}
          onShare={() => {}}
          colors={colors}
        />
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }
  if (error || !species) {
    return (<View style={[styles.flex, styles.center]}><Text style={styles.errorText}>{error || 'Not found.'}</Text><TouchableOpacity style={styles.retryButton} onPress={fetch}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View>);
  }

  const harmless = !species.venom_severity;
  // 'none' is a recorded "we checked, it doesn't" — render nothing for it.
  const secretion =
    species.defensive_secretion && species.defensive_secretion !== 'none'
      ? SECRETION_COPY[species.defensive_secretion] ?? SECRETION_COPY.other
      : null;

  const care = careLevelMeta(species.care_level, colors.textSecondary);
  const harmlessCopy = HARMLESS_COPY[species.taxon] ?? DEFAULT_HARMLESS;
  // Per-taxon labelling: "Leg span" for whip spiders, "Length" for the rest.
  const meta = INVERT_TAXA[species.taxon];

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <CareSheetHero
          imageUrl={species.image_url}
          imageAttribution={species.image_attribution}
          commonName={species.common_names?.[0]}
          scientificName={species.scientific_name}
          isVerified={species.is_verified}
          fallbackIcon={taxonMdiIcon(species.taxon)}
          badges={[
            ...(species.care_level ? [{ label: care.text, color: care.color }] : []),
            ...(harmless
              ? []
              : [{
                  label:
                    species.venom_severity === 'medically_significant'
                      ? 'Hot venom'
                      : `${VENOM_LABELS[species.venom_severity!] ?? species.venom_severity} venom`,
                  color: species.venom_severity === 'medically_significant' ? '#ef4444' : '#f97316',
                }]),
            ...(species.communal_suitable ? [{ label: 'Communal' }] : []),
            ...(species.type ? [{ label: species.type }] : []),
          ]}
          topInset={insets.top}
          onBack={() => router.back()}
          onShare={() =>
            shareSpecies(species.scientific_name, species.common_names?.[0], species.id)
          }
          onToggleBookmark={toggleBookmark}
          isBookmarked={isBookmarked}
          bookmarkBusy={bookmarkBusy}
          colors={colors}
        />

        <View style={styles.body}>
          <QuickStatsRow
            colors={colors}
            stats={[
              { icon: 'arrow-expand-horizontal', value: species.adult_size, label: meta.sizeLabel },
              {
                icon: 'thermometer',
                value:
                  species.temperature_min || species.temperature_max
                    ? `${species.temperature_min ?? '?'}–${species.temperature_max ?? '?'}°F`
                    : null,
                label: 'Temp',
              },
              {
                icon: 'water-percent',
                value:
                  species.humidity_min || species.humidity_max
                    ? `${species.humidity_min ?? '?'}–${species.humidity_max ?? '?'}%`
                    : null,
                label: 'Humidity',
              },
              { icon: 'trending-up', value: species.growth_rate, label: 'Growth' },
            ]}
          />

          {/* Safety. The honest per-taxon "harmless" copy is kept — it's the
              most-read text on these sheets for the non-venomous taxa. */}
          {harmless ? (
            <SafetyLine
              accent="#22c55e"
              icon="shield-check"
              title={harmlessCopy.title}
              body={harmlessCopy.body}
              colors={colors}
            />
          ) : (
            <SafetyLine
              accent={species.venom_severity === 'medically_significant' ? '#ef4444' : '#f97316'}
              title={
                species.venom_severity === 'medically_significant'
                  ? 'Medically significant venom'
                  : `${VENOM_LABELS[species.venom_severity!] ?? species.venom_severity} venom`
              }
              body={
                species.venom_notes ||
                (species.venom_severity === 'medically_significant'
                  ? 'A bite can require medical attention. Experienced keepers only — check local legality and have a protocol before you buy.'
                  : 'Venom is not considered medically significant to humans, but handle minimally.')
              }
              colors={colors}
            />
          )}

          {/* Chemical defence sits ALONGSIDE the venom line, not instead of
              it. A millipede is genuinely non-venomous and genuinely able to
              burn you; collapsing those into one verdict is how the sheet
              ended up calling it simply "harmless". */}
          {!!secretion && (
            <SafetyLine
              accent={secretion.accent}
              // `flask`, not `hand-water`: this one is used elsewhere in the
              // app, so it's confirmed present in the bundled glyph map. An
              // unverified MDI name renders as a blank box in production.
              icon="flask"
              title={secretion.title}
              body={species.defensive_secretion_notes || secretion.body}
              colors={colors}
            />
          )}

          {!!species.care_guide && (
            <CareAccordion
              title="About"
              icon="document-text"
              isExpanded={!!expanded.about}
              onToggle={() => toggle('about')}
              preview={previewOf(species.native_region, species.temperament)}
              colors={colors}
            >
              <Text style={[styles.prose, { color: colors.textSecondary }]}>
                {species.care_guide.replace(/\*\*(.*?)\*\*/g, '$1')}
              </Text>
            </CareAccordion>
          )}

          {/* Enclosure first and open by default — it's what people open a
              care sheet to find out. */}
          <CareAccordion
            title="Enclosure"
            icon="home"
            isExpanded={!!expanded.enclosure}
            onToggle={() => toggle('enclosure')}
            preview={previewOf(species.enclosure_size_adult, species.substrate_depth)}
            colors={colors}
          >
            <CareFact label="Sling size" value={species.enclosure_size_sling} colors={colors} />
            <CareFact label="Juvenile size" value={species.enclosure_size_juvenile} colors={colors} />
            <CareFact label="Adult size" value={species.enclosure_size_adult} colors={colors} />
            <CareFact label="Substrate" value={species.substrate_type} colors={colors} />
            <CareFact label="Substrate depth" value={species.substrate_depth} colors={colors} />
            <CareFact
              label="Water dish"
              value={species.water_dish_required ? 'Required' : 'Optional'}
              colors={colors}
            />
            {/* The escape facts. For a roach these decide the enclosure more
                than its dimensions do — a flying species needs a locking lid,
                a smooth-climber needs a barrier. */}
            <CareFact label="Can fly" value={yesNo(species.can_fly)} colors={colors} />
            <CareFact
              label="Climbs smooth surfaces"
              value={yesNo(species.can_climb_smooth)}
              colors={colors}
            />
            {/* The two commonest ways a beginner loses a detritivore culture. */}
            <CareFact
              label="Moisture gradient"
              value={
                species.moisture_gradient_required === true
                  ? 'Required — keep one end damp, one end dry'
                  : yesNo(species.moisture_gradient_required)
              }
              colors={colors}
            />
            <CareFact
              label="Bioactive clean-up crew"
              value={yesNo(species.bioactive_suitable)}
              colors={colors}
            />
          </CareAccordion>

          <CareAccordion
            title="Feeding"
            icon="restaurant"
            isExpanded={!!expanded.feeding}
            onToggle={() => toggle('feeding')}
            preview={previewOf(
              species.feeding_frequency_adult ? `Adult ${species.feeding_frequency_adult}` : null,
              species.feeding_mode ? FEEDING_MODE_LABELS[species.feeding_mode] : null,
            )}
            colors={colors}
          >
            <CareFact
              label="Feeding mode"
              value={species.feeding_mode ? FEEDING_MODE_LABELS[species.feeding_mode] : null}
              colors={colors}
            />
            <CareFact label="Prey size" value={species.prey_size} colors={colors} />
            <CareFact label="Sling cadence" value={species.feeding_frequency_sling} colors={colors} />
            <CareFact label="Juvenile cadence" value={species.feeding_frequency_juvenile} colors={colors} />
            <CareFact label="Adult cadence" value={species.feeding_frequency_adult} colors={colors} />
            {/* Calcium deficiency kills isopod and millipede cultures slowly
                enough that keepers usually blame something else. */}
            <CareFact
              label="Supplemental calcium"
              value={
                species.supplemental_calcium_required === true
                  ? 'Required — cuttlebone or a calcium powder'
                  : yesNo(species.supplemental_calcium_required)
              }
              colors={colors}
            />
            {/* ADR-018 — see the tarantula care sheet for the reasoning. */}
            <KeeperSignalsBlock speciesId={species.id} colors={colors} />
          </CareAccordion>

          <CareAccordion
            title="Size & growth"
            icon="resize"
            isExpanded={!!expanded.size}
            onToggle={() => toggle('size')}
            preview={previewOf(species.adult_size, species.growth_rate)}
            colors={colors}
          >
            <CareFact label={meta.sizeLabel} value={species.adult_size} colors={colors} />
            {(species.adult_length_min_mm || species.adult_length_max_mm) && (
              <CareFact
                label="Length"
                value={`${species.adult_length_min_mm ?? '?'}–${species.adult_length_max_mm ?? '?'} mm`}
                colors={colors}
              />
            )}
            <CareFact label="Growth rate" value={species.growth_rate} colors={colors} />
            {/* sling/juvenile/adult is tarantula vocabulary and fits three of
                eleven taxa. Saying which scheme this species uses means a
                mantis keeper isn't left translating L4 into "juvenile". */}
            <CareFact
              label="Life stages"
              value={
                species.stage_scheme
                  ? STAGE_SCHEME_LABELS[species.stage_scheme] ?? species.stage_scheme
                  : null
              }
              colors={colors}
            />
            <CareFact
              label="Instars to maturity"
              value={
                species.typical_instars_to_maturity != null
                  ? `~${species.typical_instars_to_maturity}`
                  : null
              }
              colors={colors}
            />
            <CareFact
              label="Development"
              value={
                species.developmental_class
                  ? DEVELOPMENTAL_CLASS_LABELS[species.developmental_class] ??
                    species.developmental_class
                  : null
              }
              colors={colors}
            />
          </CareAccordion>

          <CareAccordion
            title="Taxonomy"
            icon="information-circle"
            isExpanded={!!expanded.taxonomy}
            onToggle={() => toggle('taxonomy')}
            preview={previewOf(species.family, species.native_region)}
            colors={colors}
          >
            <CareFact label="Family" value={species.family} colors={colors} />
            <CareFact label="Genus" value={species.genus} colors={colors} italic />
            <CareFact label="Native region" value={species.native_region} colors={colors} />
            <CareFact label="Type" value={cap(species.type)} colors={colors} />
            <CareFact label="Temperament" value={species.temperament} colors={colors} />
            {/* Myriapod anatomy — seeded for centipedes and millipedes since
                launch, rendered until now only on a legacy per-taxon screen
                that nothing links to. */}
            <CareFact
              label="Body segments"
              value={
                species.typical_segment_count != null
                  ? String(species.typical_segment_count)
                  : null
              }
              colors={colors}
            />
            <CareFact
              label="Leg pairs"
              value={
                species.typical_leg_pair_count != null
                  ? String(species.typical_leg_pair_count)
                  : null
              }
              colors={colors}
            />
          </CareAccordion>

          <CareAccordion
            title="Community"
            icon="people"
            isExpanded={!!expanded.community}
            onToggle={() => toggle('community')}
            preview={previewOf(species.times_kept ? `${species.times_kept} keepers` : null)}
            colors={colors}
          >
            <CareFact label="Times kept" value={species.times_kept} colors={colors} />
            <CareFact
              label="Catalog entry"
              value={species.is_verified ? 'Verified' : 'Community submitted'}
              colors={colors}
            />
          </CareAccordion>
        </View>
      </ScrollView>

      {/* Pinned action bar — parity with the tarantula care sheet. Hands the
          species straight to the generic invert add form, with the taxon
          carried over so the keeper doesn't re-pick it. */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.actionPrimary}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Add ${species.scientific_name} to your collection`}
          onPress={() =>
            // Unified add screen (handoff screen 7). The taxon-mismatch guard
            // this used to carry is gone: /add looks the species up in the
            // catalog and takes the taxon from the record, so a mirrored
            // tarantula reached here by deep link can no longer end up
            // creating a scorpion.
            router.push({
              pathname: '/add',
              params: { speciesId: species.id },
            } as any)
          }
        >
          <MaterialCommunityIcons name="plus" size={18} color="#fff" />
          <Text style={styles.actionPrimaryText}>Add to collection</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function cap(s: string | null | undefined): string | null { if (!s) return null; return s.charAt(0).toUpperCase() + s.slice(1); }

// The local Section / Fact components and their `ss` stylesheet are gone —
// both roles now come from src/components/caresheet (CareAccordion, CareFact),
// shared with the tarantula sheet so the two can't drift apart again.

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    // No horizontal padding — the hero is full-bleed. The body block below
    // carries its own. paddingBottom clears the pinned action bar.
    scroll: { paddingBottom: 96 },
    body: { padding: 16 },
    prose: { fontSize: 14, lineHeight: 21 },
    actionBar: {
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 13,
      backgroundColor: colors.primary,
    },
    actionPrimaryText: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
    errorText: { color: colors.textPrimary, marginBottom: 16 },
    retryButton: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.primary, borderRadius: 8 },
    retryText: { color: '#fff', fontWeight: '600' },
  });

export default withErrorBoundary(InvertSpeciesCareSheetScreen);
