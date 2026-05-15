/**
 * Reptile species care sheet — Sprint 8 Bundle 6.
 *
 * Mobile equivalent of web-herpetoverse `/app/species/[id]`. Renders a
 * curated subset of the full ReptileSpecies record:
 *   - Hero (photo, scientific + common name, care level, native region)
 *   - Quick-stats grid (size, lifespan, diet, enclosure type, UVB,
 *     bioactive)
 *   - Climate (temp + humidity ranges)
 *   - Enclosure sizing by life stage
 *   - Substrate safe + avoid lists
 *   - Feeding cadence + prey size by life stage
 *   - Behavior (defensive displays, brumation)
 *   - Care guide long-form text
 *   - Source link
 *
 * Fields that don't apply to a given species (e.g. UVB on a ball python)
 * collapse to nothing. The aim is "scrollable but never empty-padded."
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { FormErrorBanner } from '../../src/components/forms/FormPrimitives';
import {
  CARE_LEVEL_LABELS,
  type ReptileSpecies,
  getReptileSpecies,
} from '../../src/lib/reptile-species';

// Seeded herp families bucketed by clade. Drives the taxon inference
// for the "Add to my collection" CTA — most keepers shouldn't have to
// pick the type when they're standing on a Python regius care sheet.
// Falls back to null → user picks on the add screen.
const SNAKE_FAMILIES = new Set([
  'Pythonidae',
  'Boidae',
  'Colubridae',
  'Elapidae',
  'Viperidae',
  'Lamprophiidae',
]);
const LIZARD_FAMILIES = new Set([
  'Agamidae',
  'Anguidae',
  'Chamaeleonidae',
  'Cordylidae',
  'Diplodactylidae',
  'Eublepharidae',
  'Gekkonidae',
  'Helodermatidae',
  'Iguanidae',
  'Lacertidae',
  'Phrynosomatidae',
  'Rhacodactylidae',
  'Scincidae',
  'Sphaerodactylidae',
  'Teiidae',
  'Varanidae',
]);

// Anuran families covered by the seeded frog care sheets. Litoria is
// filed under Hylidae to match the seed data (some taxonomies split it
// into Pelodryadidae) — inference keys on the stored string.
const FROG_FAMILIES = new Set([
  'Ceratophryidae',
  'Dendrobatidae',
  'Hylidae',
  'Pyxicephalidae',
]);

function taxonFromFamily(
  family: string | null,
): 'snake' | 'lizard' | 'frog' | null {
  if (!family) return null;
  if (SNAKE_FAMILIES.has(family)) return 'snake';
  if (LIZARD_FAMILIES.has(family)) return 'lizard';
  if (FROG_FAMILIES.has(family)) return 'frog';
  return null;
}

function SpeciesDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  const [species, setSpecies] = useState<ReptileSpecies | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSpecies = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getReptileSpecies(id);
      setSpecies(data);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load this care sheet. Pull down to retry.");
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSpecies().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSpecies]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSpecies();
    } finally {
      setRefreshing(false);
    }
  }, [fetchSpecies]);

  if (loading && !species) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Care sheet" leftAction={<HeaderBackButton />} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !species) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Care sheet" leftAction={<HeaderBackButton />} />
        <View style={styles.center}>
          <FormErrorBanner message={loadError} />
        </View>
      </SafeAreaView>
    );
  }

  if (!species) return null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title={species.common_names[0] || species.scientific_name}
        leftAction={<HeaderBackButton />}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Hero card */}
        <View
          style={[
            styles.hero,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.lg,
            },
          ]}
        >
          {species.image_url && (
            <Image source={{ uri: species.image_url }} style={styles.heroImage} />
          )}
          <View style={styles.heroBody}>
            <Text style={[styles.heroSci, { color: colors.textPrimary }]}>
              {species.scientific_name}
            </Text>
            {species.common_names[0] && (
              <Text
                style={[styles.heroCommon, { color: colors.textSecondary }]}
              >
                {species.common_names.join(' · ')}
              </Text>
            )}
            <View style={styles.heroChips}>
              {species.care_level && (
                <Chip
                  label={CARE_LEVEL_LABELS[species.care_level]}
                  tone="primary"
                />
              )}
              {species.is_verified && <Chip label="Verified" tone="info" />}
              {species.cites_appendix && (
                <Chip label={`CITES ${species.cites_appendix}`} tone="warning" />
              )}
            </View>
            {species.native_region && (
              <Text
                style={[styles.heroRegion, { color: colors.textTertiary }]}
              >
                {species.native_region}
              </Text>
            )}
          </View>
        </View>

        {/* Add to my collection — primary CTA right under the hero so it
            never gets buried under the care sections. Taxon is inferred
            from family when possible; if unknown, the add screen falls
            back to snake by default and the user can toggle the chip. */}
        <AddToCollectionCTA
          onPress={() => {
            const inferred = taxonFromFamily(species.family);
            router.push({
              pathname: '/reptile/add',
              params: {
                species_id: species.id,
                scientific_name: species.scientific_name,
                common_name: species.common_names[0] ?? '',
                taxon: inferred ?? 'snake',
              },
            } as never);
          }}
          taxonHint={taxonFromFamily(species.family)}
        />

        {/* Quick stats */}
        <Section title="At a glance">
          <StatGrid>
            {species.adult_length_min_in != null &&
              species.adult_length_max_in != null && (
                <StatCell
                  label="Adult length"
                  value={`${fmtNum(species.adult_length_min_in)}–${fmtNum(species.adult_length_max_in)} in`}
                />
              )}
            {species.adult_weight_min_g != null &&
              species.adult_weight_max_g != null && (
                <StatCell
                  label="Adult weight"
                  value={`${fmtNum(species.adult_weight_min_g)}–${fmtNum(species.adult_weight_max_g)} g`}
                />
              )}
            {species.lifespan_captivity_min_yrs != null &&
              species.lifespan_captivity_max_yrs != null && (
                <StatCell
                  label="Lifespan"
                  value={`${species.lifespan_captivity_min_yrs}–${species.lifespan_captivity_max_yrs} yrs`}
                />
              )}
            {species.enclosure_type && (
              <StatCell
                label="Enclosure"
                value={titleCase(species.enclosure_type)}
              />
            )}
            {species.diet_type && (
              <StatCell label="Diet" value={titleCase(species.diet_type)} />
            )}
            {species.activity_period && (
              <StatCell
                label="Active"
                value={titleCase(species.activity_period)}
              />
            )}
            {species.uvb_required && <StatCell label="UVB" value="Required" />}
            {species.bioactive_suitable && (
              <StatCell label="Bioactive" value="Suitable" />
            )}
          </StatGrid>
        </Section>

        {/* Climate */}
        {(species.temp_warm_max ||
          species.humidity_max != null ||
          species.temp_basking_max) && (
          <Section title="Climate">
            <StatGrid>
              {species.temp_cool_min != null && species.temp_cool_max != null && (
                <StatCell
                  label="Cool side"
                  value={`${fmtNum(species.temp_cool_min)}–${fmtNum(species.temp_cool_max)}°F`}
                />
              )}
              {species.temp_warm_min != null && species.temp_warm_max != null && (
                <StatCell
                  label="Warm side"
                  value={`${fmtNum(species.temp_warm_min)}–${fmtNum(species.temp_warm_max)}°F`}
                />
              )}
              {species.temp_basking_min != null &&
                species.temp_basking_max != null && (
                  <StatCell
                    label="Basking"
                    value={`${fmtNum(species.temp_basking_min)}–${fmtNum(species.temp_basking_max)}°F`}
                  />
                )}
              {species.temp_night_min != null && species.temp_night_max != null && (
                <StatCell
                  label="Night"
                  value={`${fmtNum(species.temp_night_min)}–${fmtNum(species.temp_night_max)}°F`}
                />
              )}
              {species.humidity_min != null && species.humidity_max != null && (
                <StatCell
                  label="Humidity"
                  value={`${species.humidity_min}–${species.humidity_max}%`}
                />
              )}
              {species.humidity_shed_boost_min != null &&
                species.humidity_shed_boost_max != null && (
                  <StatCell
                    label="Shed boost"
                    value={`${species.humidity_shed_boost_min}–${species.humidity_shed_boost_max}%`}
                  />
                )}
            </StatGrid>
          </Section>
        )}

        {/* Enclosure sizing */}
        {(species.enclosure_min_hatchling ||
          species.enclosure_min_juvenile ||
          species.enclosure_min_adult) && (
          <Section title="Enclosure sizing">
            <KeyValue label="Hatchling" value={species.enclosure_min_hatchling} />
            <KeyValue label="Juvenile" value={species.enclosure_min_juvenile} />
            <KeyValue label="Adult" value={species.enclosure_min_adult} />
          </Section>
        )}

        {/* Substrate */}
        {(species.substrate_safe_list.length > 0 ||
          species.substrate_avoid_list.length > 0) && (
          <Section title="Substrate">
            {species.substrate_safe_list.length > 0 && (
              <KeyValue
                label="Safe"
                value={species.substrate_safe_list.join(', ')}
              />
            )}
            {species.substrate_avoid_list.length > 0 && (
              <KeyValue
                label="Avoid"
                value={species.substrate_avoid_list.join(', ')}
                tone="danger"
              />
            )}
          </Section>
        )}

        {/* Feeding */}
        {(species.feeding_frequency_adult ||
          species.prey_size_adult ||
          species.supplementation_notes) && (
          <Section title="Feeding">
            <KeyValue
              label="Hatchling"
              value={joinCadence(
                species.prey_size_hatchling,
                species.feeding_frequency_hatchling,
              )}
            />
            <KeyValue
              label="Juvenile"
              value={joinCadence(
                species.prey_size_juvenile,
                species.feeding_frequency_juvenile,
              )}
            />
            <KeyValue
              label="Adult"
              value={joinCadence(
                species.prey_size_adult,
                species.feeding_frequency_adult,
              )}
            />
            {species.supplementation_notes && (
              <KeyValue
                label="Supplements"
                value={species.supplementation_notes}
              />
            )}
          </Section>
        )}

        {/* Behavior */}
        {(species.water_bowl_description ||
          species.soaking_behavior ||
          species.brumation_required ||
          species.defensive_displays.length > 0 ||
          species.handleability) && (
          <Section title="Behavior">
            {species.handleability && (
              <KeyValue
                label="Handleability"
                value={titleCase(species.handleability)}
              />
            )}
            <KeyValue label="Water bowl" value={species.water_bowl_description} />
            <KeyValue label="Soaking" value={species.soaking_behavior} />
            {species.brumation_required && (
              <KeyValue
                label="Brumation"
                value={species.brumation_notes ?? 'Required seasonally'}
              />
            )}
            {species.defensive_displays.length > 0 && (
              <KeyValue
                label="Defensive"
                value={species.defensive_displays.join(', ')}
              />
            )}
          </Section>
        )}

        {/* Long-form care guide */}
        {species.care_guide && (
          <Section title="Care guide">
            <Text
              style={[styles.careGuide, { color: colors.textPrimary }]}
              selectable
            >
              {species.care_guide}
            </Text>
          </Section>
        )}

        {/* Source link */}
        {species.source_url && (
          <TouchableOpacity
            onPress={() => {
              if (species.source_url) Linking.openURL(species.source_url);
            }}
            style={[
              styles.sourceLink,
              {
                borderColor: colors.border,
                borderRadius: layout.radius.md,
              },
            ]}
            accessibilityRole="link"
          >
            <MaterialCommunityIcons
              name="open-in-new"
              size={16}
              color={colors.primary}
            />
            <Text style={[styles.sourceLinkText, { color: colors.primary }]}>
              Source
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Internal mini-components
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors, layout } = useTheme();
  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: layout.radius.lg,
        },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.primary }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.statGrid}>{children}</View>;
}

function StatCell({ label, value }: { label: string; value: string }) {
  const { colors, layout } = useTheme();
  return (
    <View
      style={[
        styles.statCell,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderRadius: layout.radius.sm,
        },
      ]}
    >
      <Text style={[styles.statLabel, { color: colors.textTertiary }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

function KeyValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: 'danger';
}) {
  const { colors } = useTheme();
  if (!value || value.trim() === '') return null;
  const valueColor = tone === 'danger' ? colors.danger : colors.textPrimary;
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.kvLabel, { color: colors.textTertiary }]}>
        {label}
      </Text>
      <Text style={[styles.kvValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: 'primary' | 'info' | 'warning';
}) {
  const { colors } = useTheme();
  const bg =
    tone === 'primary'
      ? `${colors.primary}20`
      : tone === 'info'
        ? `${colors.info}20`
        : `${colors.warning}20`;
  const fg =
    tone === 'primary'
      ? colors.primary
      : tone === 'info'
        ? colors.info
        : colors.warning;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: string | number | null): string {
  if (n == null) return '—';
  const num = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(1).replace(/\.?0+$/, '');
}

function titleCase(s: string): string {
  return s
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function joinCadence(size: string | null, freq: string | null): string | null {
  if (!size && !freq) return null;
  return [size, freq].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Add-to-collection CTA — sits right under the hero, routes to the
// shared add screen with species pre-filled.
// ---------------------------------------------------------------------------

function AddToCollectionCTA({
  onPress,
  taxonHint,
}: {
  onPress: () => void;
  taxonHint: 'snake' | 'lizard' | 'frog' | null;
}) {
  const { colors, layout } = useTheme();
  const taxonLabel =
    taxonHint === 'snake'
      ? 'Add as snake'
      : taxonHint === 'lizard'
        ? 'Add as lizard'
        : taxonHint === 'frog'
          ? 'Add as frog'
          : 'Add to my collection';
  const hint =
    taxonHint === null
      ? "You'll pick the type on the next step."
      : 'Pre-fills species + scientific name. You can change anything before saving.';

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={taxonLabel}
      style={[
        ctaStyles.row,
        {
          backgroundColor: colors.primary,
          borderRadius: layout.radius.md,
        },
      ]}
    >
      <MaterialCommunityIcons name="plus-circle" size={20} color="#0B0B0B" />
      <View style={{ flex: 1 }}>
        <Text style={ctaStyles.title}>{taxonLabel}</Text>
        <Text style={ctaStyles.subtitle}>{hint}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color="#0B0B0B" />
    </TouchableOpacity>
  );
}

const ctaStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 14,
  },
  subtitle: {
    color: '#0B0B0B',
    opacity: 0.75,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // Hero
  hero: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  heroBody: {
    padding: 14,
  },
  heroSci: {
    fontSize: 18,
    fontWeight: '700',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  heroCommon: {
    fontSize: 13,
    marginBottom: 8,
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  heroRegion: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Sections
  section: {
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  // Stats
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statCell: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: 8,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Key-value rows
  kvRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
    flexWrap: 'wrap',
  },
  kvLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    width: 96,
    textTransform: 'uppercase',
  },
  kvValue: {
    flex: 1,
    fontSize: 13,
    minWidth: 200,
  },

  // Chips
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Care guide long text
  careGuide: {
    fontSize: 14,
    lineHeight: 21,
  },

  // Source link
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  sourceLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default withErrorBoundary(SpeciesDetailScreen, 'species-detail');
