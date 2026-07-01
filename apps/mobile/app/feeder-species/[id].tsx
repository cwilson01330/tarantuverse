import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';
import { categoryEmoji } from './index';

interface FeederSpecies {
  id: string;
  scientific_name: string;
  common_names: string[] | null;
  category: string | null;
  care_level: string | null;
  temperature_min: number | null;
  temperature_max: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  typical_adult_size_mm: number | null;
  supports_life_stages: boolean;
  default_life_stages: string[] | null;
  prey_size_notes: string | null;
  care_notes: string | null;
  image_url: string | null;
}

const CARE_COLORS: Record<string, string> = {
  easy: '#16a34a',
  moderate: '#d97706',
  hard: '#dc2626',
};

function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rangeLabel(
  min: number | null,
  max: number | null,
  unit: string
): string | null {
  if (min != null && max != null) return `${min}–${max}${unit}`;
  if (min != null) return `≥ ${min}${unit}`;
  if (max != null) return `≤ ${max}${unit}`;
  return null;
}

export default function FeederSpeciesDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const speciesId = params.id;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [species, setSpecies] = useState<FeederSpecies | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const fetchSpecies = useCallback(async () => {
    if (!speciesId) return;
    try {
      const res = await apiClient.get<FeederSpecies>(`/feeder-species/${speciesId}`);
      setSpecies(res.data);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      setLoadError(
        e?.response?.status === 404
          ? 'Care sheet not found'
          : e?.response?.data?.detail || e?.message || 'Failed to load care sheet'
      );
    } finally {
      setLoading(false);
    }
  }, [speciesId]);

  useEffect(() => {
    fetchSpecies();
  }, [fetchSpecies]);

  const backAction = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" style={{ paddingRight: 4 }}>
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Care sheet" leftAction={backAction} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError || !species) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Care sheet" leftAction={backAction} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🦗</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {loadError || 'Care sheet not found'}
          </Text>
          <PrimaryButton
            onPress={() => {
              setLoading(true);
              setLoadError('');
              fetchSpecies();
            }}
            style={[styles.retryBtn, { borderRadius: layout.radius.md }]}
            outerStyle={{ borderRadius: layout.radius.md }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </PrimaryButton>
        </View>
      </View>
    );
  }

  const common =
    species.common_names && species.common_names.length > 0 ? species.common_names[0] : null;
  const title = common || species.scientific_name;
  const careColor = species.care_level ? CARE_COLORS[species.care_level] : undefined;
  const tempLabel = rangeLabel(species.temperature_min, species.temperature_max, '°F');
  const humidityLabel = rangeLabel(species.humidity_min, species.humidity_max, '%');
  const hasClimate = !!(tempLabel || humidityLabel);
  const hasLifeStages =
    species.supports_life_stages &&
    !!species.default_life_stages &&
    species.default_life_stages.length > 0;
  const otherCommon =
    species.common_names && species.common_names.length > 1
      ? species.common_names.slice(1).join(', ')
      : null;

  const overviewItems: { label: string; value: string }[] = [];
  if (species.category) overviewItems.push({ label: 'Type', value: titleCase(species.category) });
  if (species.care_level)
    overviewItems.push({ label: 'Care level', value: titleCase(species.care_level) });
  if (species.typical_adult_size_mm != null)
    overviewItems.push({ label: 'Adult size', value: `${species.typical_adult_size_mm} mm` });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title={title} subtitle={common ? species.scientific_name : undefined} leftAction={backAction} />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{categoryEmoji(species.category)}</Text>
          {species.care_level && careColor && (
            <View style={[styles.careBadge, { backgroundColor: `${careColor}22`, borderColor: careColor }]}>
              <Text style={[styles.careBadgeText, { color: careColor }]}>
                {titleCase(species.care_level)} to keep
              </Text>
            </View>
          )}
          {otherCommon && (
            <Text style={[styles.aka, { color: colors.textTertiary }]} numberOfLines={2}>
              Also called: {otherCommon}
            </Text>
          )}
        </View>

        {/* Overview */}
        {overviewItems.length > 0 && (
          <Section title="OVERVIEW" colors={colors} layout={layout}>
            <View style={styles.gridRow}>
              {overviewItems.map((it) => (
                <View key={it.label} style={styles.gridCell}>
                  <Text style={[styles.cellLabel, { color: colors.textTertiary }]}>{it.label}</Text>
                  <Text style={[styles.cellValue, { color: colors.textPrimary }]}>{it.value}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Climate */}
        {hasClimate && (
          <Section title="CLIMATE" colors={colors} layout={layout}>
            <View style={styles.gridRow}>
              {tempLabel && (
                <View style={styles.gridCell}>
                  <Text style={[styles.cellLabel, { color: colors.textTertiary }]}>Temperature</Text>
                  <Text style={[styles.cellValue, { color: colors.textPrimary }]}>{tempLabel}</Text>
                </View>
              )}
              {humidityLabel && (
                <View style={styles.gridCell}>
                  <Text style={[styles.cellLabel, { color: colors.textTertiary }]}>Humidity</Text>
                  <Text style={[styles.cellValue, { color: colors.textPrimary }]}>{humidityLabel}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.bodyNote, { color: colors.textTertiary }]}>
              Room temperature suits most feeders; warmth speeds breeding and growth.
            </Text>
          </Section>
        )}

        {/* Life stages */}
        {hasLifeStages && (
          <Section title="LIFE STAGES" colors={colors} layout={layout}>
            <View style={styles.stageWrap}>
              {species.default_life_stages!.map((stage) => (
                <View
                  key={stage}
                  style={[
                    styles.stageChip,
                    { backgroundColor: colors.background, borderColor: colors.border, borderRadius: layout.radius.sm },
                  ]}
                >
                  <Text style={[styles.stageChipText, { color: colors.textPrimary }]}>{stage}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.bodyNote, { color: colors.textTertiary }]}>
              Commonly kept and offered at these stages — match prey size to your animal.
            </Text>
          </Section>
        )}

        {/* Prey / feeding */}
        {species.prey_size_notes && (
          <Section title="AS PREY" colors={colors} layout={layout}>
            <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{species.prey_size_notes}</Text>
          </Section>
        )}

        {/* Care notes */}
        {species.care_notes && (
          <Section title="KEEPING & GUT-LOADING" colors={colors} layout={layout}>
            <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{species.care_notes}</Text>
          </Section>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  children,
  colors,
  layout,
}: {
  title: string;
  children: React.ReactNode;
  colors: any;
  layout: any;
}) {
  return (
    <>
      <Text style={[styles.sectionHeading, { color: colors.textTertiary }]}>{title}</Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
        ]}
      >
        {children}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 18, textAlign: 'center' },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 18 },
  hero: { alignItems: 'center', marginBottom: 20 },
  heroEmoji: { fontSize: 60, marginBottom: 10 },
  careBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  careBadgeText: { fontSize: 12, fontWeight: '700' },
  aka: { fontSize: 12, marginTop: 10, textAlign: 'center', fontStyle: 'italic' },
  sectionHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  card: { borderWidth: 1, padding: 16, marginBottom: 16 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridCell: { minWidth: 90, flexGrow: 1 },
  cellLabel: { fontSize: 11, marginBottom: 3 },
  cellValue: { fontSize: 15, fontWeight: '600' },
  bodyText: { fontSize: 14, lineHeight: 21 },
  bodyNote: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  stageWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stageChip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  stageChipText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
});
