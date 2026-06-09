/**
 * Whip spider detail screen — ADR-006 taxon #1.
 *
 * Mirror of the centipede detail screen: hero / identity / husbandry /
 * logs / photos. Whip-spider-specific differences: leg span (not body
 * length), molt count (not instar with segments), and no segment / leg-
 * pair rows. Whip spiders are harmless, so there's no venom treatment.
 */
import React, { useCallback, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getImageUrl } from '../../src/utils/image-url';
import {
  deleteWhipSpider,
  getWhipSpider,
  listWhipSpiderFeedings,
  listWhipSpiderMolts,
  listWhipSpiderPhotos,
  listWhipSpiderSubstrateChanges,
  whipSpiderDisplayName,
  type WhipSpider,
  type WhipSpiderFeedingLog,
  type WhipSpiderMoltLog,
  type WhipSpiderPhoto,
  type WhipSpiderSubstrateChange,
} from '../../src/lib/whip-spiders';

function WhipSpiderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  // Push the floating hero actions below the Android status bar / iOS
  // notch — the hero is full-bleed, so without this the edit/delete
  // buttons collide with the status bar icons.
  const insets = useSafeAreaInsets();

  const [whipSpider, setWhipSpider] = useState<WhipSpider | null>(null);
  const [feedings, setFeedings] = useState<WhipSpiderFeedingLog[]>([]);
  const [molts, setMolts] = useState<WhipSpiderMoltLog[]>([]);
  const [substrate, setSubstrate] = useState<WhipSpiderSubstrateChange[]>([]);
  const [photos, setPhotos] = useState<WhipSpiderPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const s = await getWhipSpider(id);
      setWhipSpider(s);
      const [f, m, sub, p] = await Promise.all([
        listWhipSpiderFeedings(id).catch(() => [] as WhipSpiderFeedingLog[]),
        listWhipSpiderMolts(id).catch(() => [] as WhipSpiderMoltLog[]),
        listWhipSpiderSubstrateChanges(id).catch(
          () => [] as WhipSpiderSubstrateChange[],
        ),
        listWhipSpiderPhotos(id).catch(() => [] as WhipSpiderPhoto[]),
      ]);
      setFeedings(f);
      setMolts(m);
      setSubstrate(sub);
      setPhotos(p);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load this whip spider.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  const handleEdit = () => {
    router.push(`/whip-spider/edit?id=${id}` as any);
  };

  const handleDelete = () => {
    if (!whipSpider) return;
    Alert.alert(
      'Delete whip spider?',
      `This permanently removes ${whipSpiderDisplayName(whipSpider)} and all `
      + 'associated logs and photos. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWhipSpider(id!);
              router.back();
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof Error
                  ? err.message
                  : 'Could not delete this whip spider.',
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

  if (error || !whipSpider) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Text style={styles.errorText}>{error || 'Whip spider not found.'}</Text>
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
        {whipSpider.photo_url ? (
          <Image
            source={{ uri: getImageUrl(whipSpider.photo_url) }}
            style={styles.heroImage}
          />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <MaterialCommunityIcons
              name="spider"
              size={64}
              color={colors.textTertiary}
            />
          </View>
        )}
        <View style={[styles.heroActions, { top: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.heroButton}
            onPress={handleEdit}
            accessibilityLabel="Edit whip spider"
          >
            <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.heroButton, { backgroundColor: '#dc2626' }]}
            onPress={handleDelete}
            accessibilityLabel="Delete whip spider"
          >
            <MaterialCommunityIcons name="trash-can" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Identity */}
      <View style={styles.identity}>
        <Text style={styles.name}>
          {whipSpider.name || whipSpider.common_name || 'Unnamed whip spider'}
        </Text>
        {whipSpider.scientific_name && (
          <Text style={styles.scientific}>{whipSpider.scientific_name}</Text>
        )}
        {whipSpider.common_name && whipSpider.name && (
          <Text style={styles.subtitle}>{whipSpider.common_name}</Text>
        )}
      </View>

      {/* Basic info grid */}
      <Section title="Identity">
        <InfoRow label="Sex" value={fmtSex(whipSpider.sex)} colors={colors} />
        <InfoRow
          label="Molts"
          value={whipSpider.current_instar ? String(whipSpider.current_instar) : '—'}
          colors={colors}
        />
        <InfoRow
          label="Leg span"
          value={
            whipSpider.current_length_mm
              ? `${whipSpider.current_length_mm} mm`
              : '—'
          }
          colors={colors}
        />
        <InfoRow
          label="Acquired"
          value={whipSpider.date_acquired ?? '—'}
          colors={colors}
        />
      </Section>

      {/* Husbandry — only shown when at least one field is set */}
      {hasHusbandry(whipSpider) && (
        <Section title="Husbandry">
          {whipSpider.enclosure_type && (
            <InfoRow
              label="Type"
              value={whipSpider.enclosure_type}
              colors={colors}
            />
          )}
          {whipSpider.enclosure_size && (
            <InfoRow
              label="Size"
              value={whipSpider.enclosure_size}
              colors={colors}
            />
          )}
          {whipSpider.substrate_type && (
            <InfoRow
              label="Substrate"
              value={
                whipSpider.substrate_depth
                  ? `${whipSpider.substrate_type} (${whipSpider.substrate_depth})`
                  : whipSpider.substrate_type
              }
              colors={colors}
            />
          )}
          {(whipSpider.target_temp_min || whipSpider.target_temp_max) && (
            <InfoRow
              label="Temperature"
              value={`${whipSpider.target_temp_min ?? '?'}–${whipSpider.target_temp_max ?? '?'} °F`}
              colors={colors}
            />
          )}
          {(whipSpider.target_humidity_min || whipSpider.target_humidity_max) && (
            <InfoRow
              label="Humidity"
              value={`${whipSpider.target_humidity_min ?? '?'}–${whipSpider.target_humidity_max ?? '?'}%`}
              colors={colors}
            />
          )}
          <InfoRow
            label="Water dish"
            value={whipSpider.water_dish ? 'Yes' : 'No'}
            colors={colors}
          />
        </Section>
      )}

      {/* Logs — feeding */}
      <LogSection
        title="Feedings"
        emptyText="No feedings logged yet."
        ctaLabel="Log feeding"
        onCta={() => router.push(`/whip-spider/add-feeding?id=${id}` as any)}
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
        onCta={() => router.push(`/whip-spider/add-molt?id=${id}` as any)}
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
        onCta={() => router.push(`/whip-spider/add-substrate-change?id=${id}` as any)}
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
        onAction={() => router.push(`/whip-spider/add-photo?id=${id}` as any)}
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

      {whipSpider.notes && (
        <Section title="Notes">
          <Text style={styles.notes}>{whipSpider.notes}</Text>
        </Section>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSex(sex: WhipSpider['sex']): string {
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

function hasHusbandry(s: WhipSpider): boolean {
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
// Inline subcomponents
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
// Styles
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

export default withErrorBoundary(WhipSpiderDetailScreen);
