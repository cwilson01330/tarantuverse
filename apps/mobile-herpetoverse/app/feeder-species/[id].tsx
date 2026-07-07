/**
 * Feeder species care sheet (ADR-012). Renders one catalog record — the
 * husbandry a keeper needs to keep a LIVE feeder colony (temp/humidity,
 * typical adult size, prey-size guidance, care + handling notes), plus a
 * "Add to my feeder stock" CTA that deep-links the add form pre-picked.
 *
 * Sections that don't apply to a given feeder collapse to nothing (a frozen
 * mouse has no live-care temperature range) so it's scrollable but never
 * empty-padded.
 *
 * apiClient baseURL already includes /api/v1 — lib helpers start at the
 * resource. Theme dark-first; on-primary text is #0B0B0B.
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../src/components/AppHeader';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { FormErrorBanner } from '../../src/components/forms/FormPrimitives';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  FEEDER_CATEGORIES,
  feederCategoryGlyph,
  getFeederSpecies,
  titleize,
  type HvFeederSpecies,
} from '../../src/lib/feeders';

function StatCell({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statLabel, { color: colors.textTertiary }]}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

function FeederSpeciesCareSheet() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const speciesId = typeof params.id === 'string' ? params.id : null;

  const [sp, setSp] = useState<HvFeederSpecies | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const fetchSpecies = useCallback(async () => {
    if (!speciesId) return;
    try {
      const data = await getFeederSpecies(speciesId);
      setSp(data);
      setLoadError('');
    } catch (e: any) {
      setLoadError(
        e?.response?.data?.detail || e?.message || 'Failed to load care sheet',
      );
    } finally {
      setLoading(false);
    }
  }, [speciesId]);

  useEffect(() => {
    fetchSpecies();
  }, [fetchSpecies]);

  if (loading) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Care sheet" leftAction={<HeaderBackButton />} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !sp) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Care sheet" leftAction={<HeaderBackButton />} />
        <View style={styles.loadingWrap}>
          <FormErrorBanner message={loadError || 'Care sheet not found.'} />
        </View>
      </SafeAreaView>
    );
  }

  const commonName = sp.common_names?.[0] ?? sp.scientific_name;
  const temp =
    sp.temperature_min != null && sp.temperature_max != null
      ? `${sp.temperature_min}–${sp.temperature_max}°F`
      : sp.temperature_min != null
        ? `${sp.temperature_min}°F+`
        : null;
  const humidity =
    sp.humidity_min != null && sp.humidity_max != null
      ? `${sp.humidity_min}–${sp.humidity_max}%`
      : null;
  const hasCareStats = temp || humidity || sp.typical_adult_size_mm != null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title={commonName} leftAction={<HeaderBackButton />} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View
          style={[
            styles.hero,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.md,
            },
          ]}
        >
          <Text style={styles.heroGlyph}>{feederCategoryGlyph(sp.category)}</Text>
          <Text style={[styles.heroName, { color: colors.textPrimary }]}>
            {commonName}
          </Text>
          <Text style={[styles.heroSci, { color: colors.textTertiary }]}>
            {sp.scientific_name}
          </Text>
          <View style={styles.heroBadges}>
            <View
              style={[styles.pill, { backgroundColor: `${colors.primary}22` }]}
            >
              <Text style={[styles.pillText, { color: colors.primary }]}>
                {FEEDER_CATEGORIES[sp.category]?.label ?? titleize(sp.category)}
              </Text>
            </View>
            {sp.care_level ? (
              <View style={[styles.pill, { backgroundColor: `${colors.info}22` }]}>
                <Text style={[styles.pillText, { color: colors.info }]}>
                  {titleize(sp.care_level)}
                </Text>
              </View>
            ) : null}
            {sp.supports_sizes ? (
              <View
                style={[styles.pill, { backgroundColor: `${colors.success}22` }]}
              >
                <Text style={[styles.pillText, { color: colors.success }]}>
                  Sized
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Quick stats — only for live-care-relevant feeders */}
        {hasCareStats && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Colony care
            </Text>
            <View
              style={[
                styles.statGrid,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              {temp ? <StatCell label="TEMPERATURE" value={temp} colors={colors} /> : null}
              {humidity ? (
                <StatCell label="HUMIDITY" value={humidity} colors={colors} />
              ) : null}
              {sp.typical_adult_size_mm != null ? (
                <StatCell
                  label="ADULT SIZE"
                  value={`${sp.typical_adult_size_mm} mm`}
                  colors={colors}
                />
              ) : null}
            </View>
          </>
        )}

        {/* Typical sizes */}
        {sp.typical_sizes && sp.typical_sizes.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Feeder sizes
            </Text>
            <View style={styles.sizeWrap}>
              {sp.typical_sizes.map((s) => (
                <View
                  key={s}
                  style={[
                    styles.sizeTag,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: layout.radius.sm,
                    },
                  ]}
                >
                  <Text style={[styles.sizeTagText, { color: colors.textSecondary }]}>
                    {titleize(s)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {sp.prey_size_notes ? (
          <Section title="Prey-size guidance" body={sp.prey_size_notes} colors={colors} layout={layout} />
        ) : null}
        {sp.care_notes ? (
          <Section title="Care notes" body={sp.care_notes} colors={colors} layout={layout} />
        ) : null}
        {sp.handling_notes ? (
          <Section title="Handling" body={sp.handling_notes} colors={colors} layout={layout} />
        ) : null}

        {/* CTA — add to my feeder stock */}
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/feeders/add?species_id=${sp.id}` as never,
            )
          }
          style={[
            styles.cta,
            { backgroundColor: colors.primary, borderRadius: layout.radius.md },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Add ${commonName} to my feeder stock`}
        >
          <Text style={styles.ctaText}>Add to my feeder stock</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  body,
  colors,
  layout,
}: {
  title: string;
  body: string;
  colors: ReturnType<typeof useTheme>['colors'];
  layout: ReturnType<typeof useTheme>['layout'];
}) {
  return (
    <>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        {title}
      </Text>
      <View
        style={[
          styles.bodyCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: layout.radius.md,
          },
        ]}
      >
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          {body}
        </Text>
      </View>
    </>
  );
}

export default withErrorBoundary(FeederSpeciesCareSheet, 'feeder-species-detail');

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 16, paddingBottom: 40 },

  hero: { borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 8 },
  heroGlyph: { fontSize: 48, marginBottom: 8 },
  heroName: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  heroSci: { fontSize: 13, fontStyle: 'italic', marginTop: 4, textAlign: 'center' },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
  },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  pillText: { fontSize: 12, fontWeight: '700' },

  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },

  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    padding: 4,
  },
  statCell: { width: '50%', padding: 12 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  statValue: { fontSize: 15, fontWeight: '700', marginTop: 4 },

  sizeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeTag: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  sizeTagText: { fontSize: 13, fontWeight: '600' },

  bodyCard: { borderWidth: 1, padding: 14 },
  bodyText: { fontSize: 14, lineHeight: 21 },

  cta: {
    marginTop: 28,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#0B0B0B', fontSize: 15, fontWeight: '700' },
});
