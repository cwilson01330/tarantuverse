/**
 * Centipede detail screen — Phase 3b of the centipede expansion.
 *
 * Slimmer cousin of app/tarantula/[id].tsx — same hero/husbandry/log
 * structure but without the tarantula-specific bells (premolt
 * prediction, pause UX, breeding tab, feeding stats). Those land when
 * centipede-specific analytics + breeding ship.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getImageUrl } from '../../src/utils/image-url';
import {
  deleteCentipede,
  getCentipede,
  listCentipedeFeedings,
  listCentipedeMolts,
  listCentipedePhotos,
  listCentipedeSubstrateChanges,
  centipedeDisplayName,
  type Centipede,
  type CentipedeFeedingLog,
  type CentipedeMoltLog,
  type CentipedePhoto,
  type CentipedeSubstrateChange,
} from '../../src/lib/centipedes';

function CentipedeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  const [centipede, setCentipede] = useState<Centipede | null>(null);
  const [feedings, setFeedings] = useState<CentipedeFeedingLog[]>([]);
  const [molts, setMolts] = useState<CentipedeMoltLog[]>([]);
  const [substrate, setSubstrate] = useState<CentipedeSubstrateChange[]>([]);
  const [photos, setPhotos] = useState<CentipedePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const s = await getCentipede(id);
      setCentipede(s);
      // Parallel — the log lists are independent and small enough
      // that fanning out is faster than serial.
      const [f, m, sub, p] = await Promise.all([
        listCentipedeFeedings(id).catch(() => [] as CentipedeFeedingLog[]),
        listCentipedeMolts(id).catch(() => [] as CentipedeMoltLog[]),
        listCentipedeSubstrateChanges(id).catch(
          () => [] as CentipedeSubstrateChange[],
        ),
        listCentipedePhotos(id).catch(() => [] as CentipedePhoto[]),
      ]);
      setFeedings(f);
      setMolts(m);
      setSubstrate(sub);
      setPhotos(p);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load this centipede.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Refetch on focus — return-to-screen-after-logging cycle works
  // without a manual refresh button.
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  const handleEdit = () => {
    router.push(`/centipede/edit?id=${id}` as any);
  };

  const handleDelete = () => {
    if (!centipede) return;
    Alert.alert(
      'Delete centipede?',
      `This permanently removes ${centipedeDisplayName(centipede)} and all `
      + 'associated logs and photos. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCentipede(id!);
              router.back();
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof Error
                  ? err.message
                  : 'Could not delete this centipede.',
              );
            }
          },
        },
      ],
    );
  };

  const styles = makeStyles(colors);

  if (loading) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error || !centipede) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Text style={styles.errorText}>{error || 'Centipede not found.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchAll}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      {/* Hero */}
      <View style={styles.hero}>
        {centipede.photo_url ? (
          <Image
            source={{ uri: getImageUrl(centipede.photo_url) }}
            style={styles.heroImage}
          />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <MaterialCommunityIcons
              name="bug-outline"
              size={64}
              color={colors.textTertiary}
            />
          </View>
        )}
        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.heroButton}
            onPress={handleEdit}
            accessibilityLabel="Edit centipede"
          >
            <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.heroButton, { backgroundColor: '#dc2626' }]}
            onPress={handleDelete}
            accessibilityLabel="Delete centipede"
          >
            <MaterialCommunityIcons name="trash-can" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Identity */}
      <View style={styles.identity}>
        <Text style={styles.name}>
          {centipede.name || centipede.common_name || 'Unnamed centipede'}
        </Text>
        {centipede.scientific_name && (
          <Text style={styles.scientific}>{centipede.scientific_name}</Text>
        )}
        {centipede.common_name && centipede.name && (
          <Text style={styles.subtitle}>{centipede.common_name}</Text>
        )}
      </View>

      {/* Basic info grid */}
      <Section title="Identity">
        <InfoRow label="Sex" value={fmtSex(centipede.sex)} colors={colors} />
        <InfoRow
          label="Instar"
          value={centipede.current_instar ? String(centipede.current_instar) : '—'}
          colors={colors}
        />
        <InfoRow
          label="Length"
          value={
            centipede.current_length_mm
              ? `${centipede.current_length_mm} mm`
              : '—'
          }
          colors={colors}
        />
        {centipede.current_segment_count != null && (
          <InfoRow
            label="Segments"
            value={String(centipede.current_segment_count)}
            colors={colors}
          />
        )}
        {centipede.current_leg_pair_count != null && (
          <InfoRow
            label="Leg pairs"
            value={String(centipede.current_leg_pair_count)}
            colors={colors}
          />
        )}
        <InfoRow
          label="Acquired"
          value={centipede.date_acquired ?? '—'}
          colors={colors}
        />
      </Section>

      {/* Husbandry — only shown when at least one field is set */}
      {hasHusbandry(centipede) && (
        <Section title="Husbandry">
          {centipede.enclosure_type && (
            <InfoRow
              label="Type"
              value={centipede.enclosure_type}
              colors={colors}
            />
          )}
          {centipede.enclosure_size && (
            <InfoRow
              label="Size"
              value={centipede.enclosure_size}
              colors={colors}
            />
          )}
          {centipede.substrate_type && (
            <InfoRow
              label="Substrate"
              value={
                centipede.substrate_depth
                  ? `${centipede.substrate_type} (${centipede.substrate_depth})`
                  : centipede.substrate_type
              }
              colors={colors}
            />
          )}
          {(centipede.target_temp_min || centipede.target_temp_max) && (
            <InfoRow
              label="Temperature"
              value={`${centipede.target_temp_min ?? '?'}–${centipede.target_temp_max ?? '?'} °F`}
              colors={colors}
            />
          )}
          {(centipede.target_humidity_min || centipede.target_humidity_max) && (
            <InfoRow
              label="Humidity"
              value={`${centipede.target_humidity_min ?? '?'}–${centipede.target_humidity_max ?? '?'}%`}
              colors={colors}
            />
          )}
          <InfoRow
            label="Water dish"
            value={centipede.water_dish ? 'Yes' : 'No'}
            colors={colors}
          />
        </Section>
      )}

      {/* Logs — feeding */}
      <LogSection
        title="Feedings"
        emptyText="No feedings logged yet."
        ctaLabel="Log feeding"
        onCta={() => router.push(`/centipede/add-feeding?id=${id}` as any)}
        items={feedings.slice(0, 5)}
        renderItem={(item) => (
          <View style={styles.logRow}>
            <Text style={styles.logRowTitle}>
              {item.food_type || 'Feeding'} ·{' '}
              {item.accepted ? 'Accepted' : 'Refused'}
            </Text>
            <Text style={styles.logRowMeta}>{fmtDate(item.fed_at)}</Text>
          </View>
        )}
        colors={colors}
      />

      {/* Logs — molts */}
      <LogSection
        title="Molts"
        emptyText="No molts logged yet."
        ctaLabel="Log molt"
        onCta={() => router.push(`/centipede/add-molt?id=${id}` as any)}
        items={molts.slice(0, 5)}
        renderItem={(item) => (
          <View style={styles.logRow}>
            <Text style={styles.logRowTitle}>Molt</Text>
            <Text style={styles.logRowMeta}>{fmtDate(item.molted_at)}</Text>
          </View>
        )}
        colors={colors}
      />

      {/* Logs — substrate */}
      <LogSection
        title="Substrate changes"
        emptyText="No substrate changes logged yet."
        ctaLabel="Log substrate change"
        onCta={() => router.push(`/centipede/add-substrate-change?id=${id}` as any)}
        items={substrate.slice(0, 5)}
        renderItem={(item) => (
          <View style={styles.logRow}>
            <Text style={styles.logRowTitle}>
              {item.substrate_type || 'Substrate change'}
            </Text>
            <Text style={styles.logRowMeta}>{fmtDate(item.changed_at)}</Text>
          </View>
        )}
        colors={colors}
      />

      {/* Photos */}
      <Section
        title="Photos"
        actionLabel="Add photo"
        onAction={() => router.push(`/centipede/add-photo?id=${id}` as any)}
      >
        {photos.length === 0 ? (
          <Text style={styles.empty}>No photos yet.</Text>
        ) : (
          <FlatList
            horizontal
            data={photos}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (
              <Image
                source={{
                  uri: getImageUrl(item.thumbnail_url ?? item.url),
                }}
                style={styles.photoThumb}
              />
            )}
          />
        )}
      </Section>

      {centipede.notes && (
        <Section title="Notes">
          <Text style={styles.notes}>{centipede.notes}</Text>
        </Section>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Helpers — kept inline rather than promoted because they're tightly
// coupled to this screen's layout. Promote to src/lib/centipedes.ts if a
// second screen needs them.
// ---------------------------------------------------------------------------

function fmtSex(sex: Centipede['sex']): string {
  if (!sex || sex === 'unknown') return '—';
  return sex.charAt(0).toUpperCase() + sex.slice(1);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function hasHusbandry(s: Centipede): boolean {
  return Boolean(
    s.enclosure_type
      || s.enclosure_size
      || s.substrate_type
      || s.substrate_depth
      || s.target_temp_min
      || s.target_temp_max
      || s.target_humidity_min
      || s.target_humidity_max,
  );
}

// ---------------------------------------------------------------------------
// Inline subcomponents — share state through props rather than promoting
// to /components because the styling is screen-specific.
// ---------------------------------------------------------------------------

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.sectionHeader}>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
        {actionLabel && onAction && (
          <TouchableOpacity onPress={onAction}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>
              {actionLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function InfoRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={s.infoRow}>
      <Text style={[s.infoLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[s.infoValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function LogSection<T extends { id: string }>({
  title,
  emptyText,
  ctaLabel,
  onCta,
  items,
  renderItem,
  colors,
}: {
  title: string;
  emptyText: string;
  ctaLabel: string;
  onCta: () => void;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Section title={title} actionLabel={ctaLabel} onAction={onCta}>
      {items.length === 0 ? (
        <Text style={[s.empty, { color: colors.textTertiary }]}>
          {emptyText}
        </Text>
      ) : (
        items.map((item) => (
          <View key={item.id}>{renderItem(item)}</View>
        ))
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Styles — `s` is the shared subcomponent styles (no theme dependency);
// `makeStyles` builds the theme-dependent styles used directly by the
// screen.
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 14, fontWeight: '500' },
  empty: { fontSize: 13, fontStyle: 'italic' },
});

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingBottom: 32 },

    hero: { position: 'relative' },
    heroImage: { width: '100%', height: 280 },
    heroPlaceholder: {
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroActions: {
      position: 'absolute',
      top: 16,
      right: 16,
      flexDirection: 'row',
      gap: 8,
    },
    heroButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    identity: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
      gap: 4,
    },
    name: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
    scientific: {
      fontSize: 15,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    subtitle: { fontSize: 13, color: colors.textTertiary },

    logRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    logRowTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
      flex: 1,
    },
    logRowMeta: { fontSize: 12, color: colors.textTertiary },
    photoThumb: {
      width: 96,
      height: 96,
      borderRadius: 8,
      backgroundColor: colors.surfaceElevated,
    },
    notes: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

    errorText: { color: colors.textPrimary, marginBottom: 16 },
    retryButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
      borderRadius: 8,
    },
    retryText: { color: '#fff', fontWeight: '600' },
  });

export default withErrorBoundary(CentipedeDetailScreen);
