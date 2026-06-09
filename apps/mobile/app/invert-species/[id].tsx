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

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getInvertSpecies, FEEDING_MODE_LABELS, type InvertSpecies } from '../../src/lib/inverts';

const VENOM_LABELS: Record<string, string> = { mild: 'Mild', moderate: 'Moderate', medically_significant: 'Medically significant' };
const CARE_LABELS: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

function InvertSpeciesCareSheetScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [species, setSpecies] = useState<InvertSpecies | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try { setSpecies(await getInvertSpecies(id)); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't load this care sheet."); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { fetch(); }, [fetch]);

  const styles = makeStyles(colors);
  if (loading) return <View style={[styles.flex, styles.center]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  if (error || !species) {
    return (<View style={[styles.flex, styles.center]}><Text style={styles.errorText}>{error || 'Not found.'}</Text><TouchableOpacity style={styles.retryButton} onPress={fetch}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View>);
  }

  const harmless = !species.venom_severity;

  return (
    <View style={styles.flex}>
      <AppHeader title={species.common_names?.[0] || species.scientific_name} subtitle={species.scientific_name}
        leftAction={<TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} /></TouchableOpacity>} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.tagRow}>
          {species.care_level && <View style={[styles.tag, { backgroundColor: colors.surface }]}><Text style={[styles.tagText, { color: colors.textPrimary }]}>{CARE_LABELS[species.care_level] ?? species.care_level}</Text></View>}
          {harmless ? (
            <View style={[styles.tag, { backgroundColor: '#dcfce7' }]}><Text style={[styles.tagText, { color: '#166534' }]}>Harmless</Text></View>
          ) : (
            <View style={[styles.tag, { backgroundColor: '#fee2e2' }]}><Text style={[styles.tagText, { color: '#991b1b' }]}>Venom: {VENOM_LABELS[species.venom_severity!] ?? species.venom_severity}</Text></View>
          )}
          {species.communal_suitable && <View style={[styles.tag, { backgroundColor: '#dbeafe' }]}><Text style={[styles.tagText, { color: '#1e40af' }]}>Communal OK</Text></View>}
          {!species.is_verified && <View style={[styles.tag, { backgroundColor: '#fef3c7' }]}><Text style={[styles.tagText, { color: '#92400e' }]}>Unverified</Text></View>}
        </View>

        {harmless ? (
          <View style={[styles.callout, { backgroundColor: '#dcfce7', borderLeftColor: '#166534' }]}>
            <Text style={[styles.calloutTitle, { color: '#166534' }]}>No medically significant venom</Text>
            <Text style={[styles.calloutBody, { color: '#166534' }]}>This species is not considered dangerous to humans. Always research individual care before keeping.</Text>
          </View>
        ) : (species.venom_notes || species.venom_severity === 'medically_significant') ? (
          <View style={[styles.callout, { backgroundColor: '#fee2e2', borderLeftColor: '#991b1b' }]}>
            <Text style={[styles.calloutTitle, { color: '#991b1b' }]}>{species.venom_severity === 'medically_significant' ? 'Medically significant venom' : 'Venom note'}</Text>
            <Text style={[styles.calloutBody, { color: '#991b1b' }]}>{species.venom_notes || 'Venom is medically significant. Experienced keepers only — check local legality and have a protocol.'}</Text>
          </View>
        ) : null}

        {species.care_guide && <Section title="About" colors={colors}><Text style={styles.body}>{species.care_guide.replace(/\*\*(.*?)\*\*/g, '$1')}</Text></Section>}

        <Section title="Taxonomy" colors={colors}>
          <Fact label="Family" value={species.family} colors={colors} />
          <Fact label="Genus" value={species.genus} colors={colors} />
          <Fact label="Native region" value={species.native_region} colors={colors} />
          <Fact label="Type" value={cap(species.type)} colors={colors} />
          <Fact label="Temperament" value={species.temperament} colors={colors} />
        </Section>

        <Section title="Size & growth" colors={colors}>
          <Fact label="Adult size" value={species.adult_size} colors={colors} />
          {(species.adult_length_min_mm || species.adult_length_max_mm) && <Fact label="Length" value={`${species.adult_length_min_mm ?? '?'}–${species.adult_length_max_mm ?? '?'} mm`} colors={colors} />}
          <Fact label="Growth rate" value={species.growth_rate} colors={colors} />
        </Section>

        <Section title="Climate" colors={colors}>
          {(species.temperature_min || species.temperature_max) && <Fact label="Temperature" value={`${species.temperature_min ?? '?'}–${species.temperature_max ?? '?'} °F`} colors={colors} />}
          {(species.humidity_min || species.humidity_max) && <Fact label="Humidity" value={`${species.humidity_min ?? '?'}–${species.humidity_max ?? '?'}%`} colors={colors} />}
        </Section>

        <Section title="Enclosure" colors={colors}>
          <Fact label="Sling size" value={species.enclosure_size_sling} colors={colors} />
          <Fact label="Juvenile size" value={species.enclosure_size_juvenile} colors={colors} />
          <Fact label="Adult size" value={species.enclosure_size_adult} colors={colors} />
          <Fact label="Substrate" value={species.substrate_type} colors={colors} />
          <Fact label="Substrate depth" value={species.substrate_depth} colors={colors} />
          <Fact label="Water dish" value={species.water_dish_required ? 'Required' : 'Optional'} colors={colors} />
        </Section>

        <Section title="Feeding" colors={colors}>
          <Fact label="Feeding mode" value={species.feeding_mode ? FEEDING_MODE_LABELS[species.feeding_mode] : null} colors={colors} />
          <Fact label="Prey size" value={species.prey_size} colors={colors} />
          <Fact label="Sling cadence" value={species.feeding_frequency_sling} colors={colors} />
          <Fact label="Juvenile cadence" value={species.feeding_frequency_juvenile} colors={colors} />
          <Fact label="Adult cadence" value={species.feeding_frequency_adult} colors={colors} />
        </Section>

        <Text style={styles.metaText}>Times kept: {species.times_kept}</Text>
      </ScrollView>
    </View>
  );
}

function cap(s: string | null | undefined): string | null { if (!s) return null; return s.charAt(0).toUpperCase() + s.slice(1); }

function Section({ title, colors, children }: { title: string; colors: ReturnType<typeof useTheme>['colors']; children: React.ReactNode }) {
  return (<View style={[ss.section, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[ss.sectionTitle, { color: colors.textTertiary }]}>{title}</Text>{children}</View>);
}
function Fact({ label, value, colors }: { label: string; value: string | null | undefined; colors: ReturnType<typeof useTheme>['colors'] }) {
  if (!value) return null;
  return (<View style={[ss.factRow, { borderBottomColor: colors.border }]}><Text style={[ss.factLabel, { color: colors.textTertiary }]}>{label}</Text><Text style={[ss.factValue, { color: colors.textPrimary }]}>{value}</Text></View>);
}

const ss = StyleSheet.create({
  section: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 4, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  factLabel: { fontSize: 13 },
  factValue: { fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right', marginLeft: 12 },
});

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 16, paddingBottom: 32, gap: 12 },
    tagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
    tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    tagText: { fontSize: 12, fontWeight: '600' },
    callout: { borderLeftWidth: 4, padding: 12, borderRadius: 8, gap: 4, marginBottom: 4 },
    calloutTitle: { fontSize: 14, fontWeight: '700' },
    calloutBody: { fontSize: 13, lineHeight: 18 },
    body: { fontSize: 14, color: colors.textPrimary, lineHeight: 21 },
    metaText: { fontSize: 11, color: colors.textTertiary, textAlign: 'center', marginTop: 8 },
    errorText: { color: colors.textPrimary, marginBottom: 16 },
    retryButton: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.primary, borderRadius: 8 },
    retryText: { color: '#fff', fontWeight: '600' },
  });

export default withErrorBoundary(InvertSpeciesCareSheetScreen);
