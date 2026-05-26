/**
 * Scorpion species care sheet — Phase 3b.
 *
 * Renders one row from the Phase 2 catalog as a care sheet. Mirrors
 * the structure of the tarantula care sheet but with scorpion-
 * specific fields (venom severity, communal flag, instar-aware
 * feeding cadence). No add-to-collection CTA yet — that's a 3c
 * polish item.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import {
  getScorpionSpecies,
  type ScorpionSpecies,
  CARE_LEVEL_LABELS,
  VENOM_SEVERITY_LABELS,
  venomSeverityColor,
} from '../../src/lib/scorpions';

function ScorpionSpeciesCareSheetScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [species, setSpecies] = useState<ScorpionSpecies | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const s = await getScorpionSpecies(id);
      setSpecies(s);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't load this care sheet.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const styles = makeStyles(colors);

  if (loading) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error || !species) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Text style={styles.errorText}>{error || 'Not found.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetch}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const venom = venomSeverityColor(species.venom_severity);

  return (
    <View style={styles.flex}>
      <AppHeader
        title={species.common_names?.[0] || species.scientific_name}
        subtitle={species.scientific_name}
        leftAction={
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons
              name="chevron-left"
              size={28}
              color={iconColor}
            />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Headline tags — care + venom + communal */}
        <View style={styles.tagRow}>
          {species.care_level && (
            <View style={[styles.tag, { backgroundColor: colors.surface }]}>
              <Text style={[styles.tagText, { color: colors.textPrimary }]}>
                {CARE_LEVEL_LABELS[species.care_level]}
              </Text>
            </View>
          )}
          <View style={[styles.tag, { backgroundColor: venom.bg }]}>
            <Text style={[styles.tagText, { color: venom.fg }]}>
              Venom: {VENOM_SEVERITY_LABELS[species.venom_severity]}
            </Text>
          </View>
          {species.communal_suitable && (
            <View style={[styles.tag, { backgroundColor: '#dbeafe' }]}>
              <Text style={[styles.tagText, { color: '#1e40af' }]}>
                Communal OK
              </Text>
            </View>
          )}
          {!species.is_verified && (
            <View style={[styles.tag, { backgroundColor: '#fef3c7' }]}>
              <Text style={[styles.tagText, { color: '#92400e' }]}>
                Unverified
              </Text>
            </View>
          )}
        </View>

        {/* Venom callout — always render so keepers see it. The
            severity tier sets the visual weight. */}
        {(species.venom_notes
          || species.venom_severity === 'medically_significant') && (
          <View
            style={[
              styles.calloutBox,
              {
                backgroundColor: venom.bg,
                borderLeftColor: venom.fg,
              },
            ]}
          >
            <Text style={[styles.calloutTitle, { color: venom.fg }]}>
              {species.venom_severity === 'medically_significant'
                ? 'Medically significant venom'
                : 'Venom note'}
            </Text>
            <Text style={[styles.calloutBody, { color: venom.fg }]}>
              {species.venom_notes
                || 'Sting is medically significant. Hot keepers only — check '
                + 'local legality and have a sting protocol.'}
            </Text>
          </View>
        )}

        {/* Care guide markdown — rendered as plain prose for now.
            Upgrade to a markdown renderer when other care sheets adopt
            one. */}
        {species.care_guide && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bodyText}>
              {stripMarkdown(species.care_guide)}
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Taxonomy</Text>
          <FactRow label="Family" value={species.family} colors={colors} />
          <FactRow label="Genus" value={species.genus} colors={colors} />
          <FactRow
            label="Native region"
            value={species.native_region}
            colors={colors}
          />
          <FactRow label="Type" value={cap(species.type)} colors={colors} />
          <FactRow
            label="Temperament"
            value={species.temperament}
            colors={colors}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Size & growth</Text>
          <FactRow label="Adult size" value={species.adult_size} colors={colors} />
          {(species.adult_length_min_mm || species.adult_length_max_mm) && (
            <FactRow
              label="Length"
              value={`${species.adult_length_min_mm ?? '?'}–${species.adult_length_max_mm ?? '?'} mm`}
              colors={colors}
            />
          )}
          <FactRow
            label="Growth rate"
            value={species.growth_rate}
            colors={colors}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Climate</Text>
          {(species.temperature_min || species.temperature_max) && (
            <FactRow
              label="Temperature"
              value={`${species.temperature_min ?? '?'}–${species.temperature_max ?? '?'} °F`}
              colors={colors}
            />
          )}
          {(species.humidity_min || species.humidity_max) && (
            <FactRow
              label="Humidity"
              value={`${species.humidity_min ?? '?'}–${species.humidity_max ?? '?'}%`}
              colors={colors}
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enclosure</Text>
          <FactRow
            label="Juvenile size"
            value={species.enclosure_size_juvenile}
            colors={colors}
          />
          <FactRow
            label="Adult size"
            value={species.enclosure_size_adult}
            colors={colors}
          />
          <FactRow
            label="Substrate"
            value={species.substrate_type}
            colors={colors}
          />
          <FactRow
            label="Substrate depth"
            value={species.substrate_depth}
            colors={colors}
          />
          <FactRow
            label="Burrowing"
            value={cap(species.burrowing)}
            colors={colors}
          />
          <FactRow
            label="Water dish"
            value={species.water_dish_required ? 'Required' : 'Optional'}
            colors={colors}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feeding</Text>
          <FactRow label="Prey size" value={species.prey_size} colors={colors} />
          <FactRow
            label="Juvenile cadence"
            value={species.feeding_frequency_juvenile}
            colors={colors}
          />
          <FactRow
            label="Adult cadence"
            value={species.feeding_frequency_adult}
            colors={colors}
          />
        </View>

        <Text style={styles.metaText}>
          Slug: {species.slug} · Times kept: {species.times_kept}
        </Text>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drop the markdown emphasis markers so prose reads cleanly without a
 * renderer. Care guides only use **bold** in the current seed. */
function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

function cap(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function FactRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string | null | undefined;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  if (!value) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
        {label}
      </Text>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: '500',
          flex: 1,
          textAlign: 'right',
          marginLeft: 12,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 16, paddingBottom: 32, gap: 12 },

    tagRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
      marginBottom: 4,
    },
    tag: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    tagText: { fontSize: 12, fontWeight: '600' },

    calloutBox: {
      borderLeftWidth: 4,
      padding: 12,
      borderRadius: 8,
      gap: 4,
    },
    calloutTitle: { fontSize: 14, fontWeight: '700' },
    calloutBody: { fontSize: 13, lineHeight: 18 },

    section: {
      padding: 14,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    bodyText: {
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 21,
    },

    metaText: {
      fontSize: 11,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 8,
    },

    errorText: { color: colors.textPrimary, marginBottom: 16 },
    retryButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
      borderRadius: 8,
    },
    retryText: { color: '#fff', fontWeight: '600' },
  });

export default withErrorBoundary(ScorpionSpeciesCareSheetScreen);
