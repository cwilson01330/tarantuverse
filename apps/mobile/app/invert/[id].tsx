/**
 * Generic invert detail screen — ADR-007.
 *
 * One screen for every non-tarantula taxon. Resolves taxon from the fetched
 * record and reads the registry for glyph / size label. Logs route through
 * the generic /invert/* log screens. Safe-area inset on the hero actions
 * (Android status-bar fix).
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getImageUrl } from '../../src/utils/image-url';
import {
  INVERT_TAXA, deleteInvert, getInvert, invertDisplayName,
  listInvertFeedings, listInvertMolts, listInvertPhotos, listInvertSubstrateChanges,
  type Invert, type InvertFeedingLog, type InvertMoltLog, type InvertPhoto, type InvertSubstrateChange,
} from '../../src/lib/inverts';

function InvertDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [invert, setInvert] = useState<Invert | null>(null);
  const [feedings, setFeedings] = useState<InvertFeedingLog[]>([]);
  const [molts, setMolts] = useState<InvertMoltLog[]>([]);
  const [substrate, setSubstrate] = useState<InvertSubstrateChange[]>([]);
  const [photos, setPhotos] = useState<InvertPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const i = await getInvert(id);
      setInvert(i);
      const [f, m, sub, p] = await Promise.all([
        listInvertFeedings(i.taxon, id).catch(() => [] as InvertFeedingLog[]),
        listInvertMolts(i.taxon, id).catch(() => [] as InvertMoltLog[]),
        listInvertSubstrateChanges(i.taxon, id).catch(() => [] as InvertSubstrateChange[]),
        listInvertPhotos(i.taxon, id).catch(() => [] as InvertPhoto[]),
      ]);
      setFeedings(f); setMolts(m); setSubstrate(sub); setPhotos(p);
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

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <View style={styles.hero}>
        {invert.photo_url ? (
          <Image source={{ uri: getImageUrl(invert.photo_url) }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Text style={{ fontSize: 64 }}>{meta?.glyph ?? '🐾'}</Text>
          </View>
        )}
        <View style={[styles.heroActions, { top: insets.top + 12 }]}>
          <TouchableOpacity style={styles.heroButton} onPress={() => router.push(`/invert/edit?id=${id}` as any)} accessibilityLabel="Edit">
            <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.heroButton, { backgroundColor: '#dc2626' }]} onPress={handleDelete} accessibilityLabel="Delete">
            <MaterialCommunityIcons name="trash-can" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.identity}>
        <Text style={styles.name}>{invert.name || invert.common_name || `Unnamed ${meta?.label.toLowerCase() ?? 'invert'}`}</Text>
        {invert.scientific_name && <Text style={styles.scientific}>{invert.scientific_name}</Text>}
        {invert.common_name && invert.name && <Text style={styles.subtitle}>{invert.common_name}</Text>}
      </View>

      <Section title="Identity">
        <InfoRow label="Sex" value={fmtSex(invert.sex)} colors={colors} />
        <InfoRow label="Molts" value={invert.current_instar ? String(invert.current_instar) : '—'} colors={colors} />
        <InfoRow label={meta?.sizeLabel ?? 'Size'} value={invert.current_length_mm ? `${invert.current_length_mm} mm` : '—'} colors={colors} />
        <InfoRow label="Acquired" value={invert.date_acquired ?? '—'} colors={colors} />
      </Section>

      {hasHusbandry(invert) && (
        <Section title="Husbandry">
          {invert.enclosure_type && <InfoRow label="Type" value={invert.enclosure_type} colors={colors} />}
          {invert.enclosure_size && <InfoRow label="Size" value={invert.enclosure_size} colors={colors} />}
          {invert.substrate_type && <InfoRow label="Substrate" value={invert.substrate_depth ? `${invert.substrate_type} (${invert.substrate_depth})` : invert.substrate_type} colors={colors} />}
          {(invert.target_temp_min || invert.target_temp_max) && <InfoRow label="Temperature" value={`${invert.target_temp_min ?? '?'}–${invert.target_temp_max ?? '?'} °F`} colors={colors} />}
          {(invert.target_humidity_min || invert.target_humidity_max) && <InfoRow label="Humidity" value={`${invert.target_humidity_min ?? '?'}–${invert.target_humidity_max ?? '?'}%`} colors={colors} />}
          <InfoRow label="Water dish" value={invert.water_dish ? 'Yes' : 'No'} colors={colors} />
        </Section>
      )}

      <LogSection title="Feedings" emptyText="No feedings logged yet." ctaLabel="Log feeding"
        onCta={() => router.push(`/invert/add-feeding?id=${id}` as any)} items={feedings.slice(0, 5)}
        renderItem={(item) => (<View style={styles.logRow}><Text style={styles.logRowTitle}>{item.food_type || 'Feeding'} · {item.accepted ? 'Accepted' : 'Refused'}</Text><Text style={styles.logRowMeta}>{fmtDate(item.fed_at)}</Text></View>)} colors={colors} />

      <LogSection title="Molts" emptyText="No molts logged yet." ctaLabel="Log molt"
        onCta={() => router.push(`/invert/add-molt?id=${id}` as any)} items={molts.slice(0, 5)}
        renderItem={(item) => (<View style={styles.logRow}><Text style={styles.logRowTitle}>Molt</Text><Text style={styles.logRowMeta}>{fmtDate(item.molted_at)}</Text></View>)} colors={colors} />

      <LogSection title="Substrate changes" emptyText="No substrate changes logged yet." ctaLabel="Log substrate change"
        onCta={() => router.push(`/invert/add-substrate-change?id=${id}` as any)} items={substrate.slice(0, 5)}
        renderItem={(item) => (<View style={styles.logRow}><Text style={styles.logRowTitle}>{item.substrate_type || 'Substrate change'}</Text><Text style={styles.logRowMeta}>{fmtDate(item.changed_at)}</Text></View>)} colors={colors} />

      <Section title="Photos" actionLabel="Add photo" onAction={() => router.push(`/invert/add-photo?id=${id}` as any)}>
        {photos.length === 0 ? (
          <Text style={styles.empty}>No photos yet.</Text>
        ) : (
          <FlatList horizontal data={photos} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => <Image source={{ uri: getImageUrl(item.thumbnail_url ?? item.url) }} style={styles.photoThumb} />} />
        )}
      </Section>

      {invert.notes && <Section title="Notes"><Text style={styles.notes}>{invert.notes}</Text></Section>}
    </ScrollView>
  );
}

function fmtSex(sex: Invert['sex']): string { if (!sex || sex === 'unknown') return '—'; return sex.charAt(0).toUpperCase() + sex.slice(1); }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleDateString(); } catch { return iso; } }
function hasHusbandry(s: Invert): boolean {
  return Boolean(s.enclosure_type || s.enclosure_size || s.substrate_type || s.substrate_depth || s.target_temp_min || s.target_temp_max || s.target_humidity_min || s.target_humidity_max);
}

function Section({ title, actionLabel, onAction, children }: { title: string; actionLabel?: string; onAction?: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.sectionHeader}>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
        {actionLabel && onAction && <TouchableOpacity onPress={onAction}><Text style={{ color: colors.primary, fontWeight: '600' }}>{actionLabel}</Text></TouchableOpacity>}
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={s.infoRow}>
      <Text style={[s.infoLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[s.infoValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function LogSection<T extends { id: string }>({ title, emptyText, ctaLabel, onCta, items, renderItem, colors }: { title: string; emptyText: string; ctaLabel: string; onCta: () => void; items: T[]; renderItem: (item: T) => React.ReactNode; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <Section title={title} actionLabel={ctaLabel} onAction={onCta}>
      {items.length === 0 ? <Text style={[s.empty, { color: colors.textTertiary }]}>{emptyText}</Text> : items.map((item) => <View key={item.id}>{renderItem(item)}</View>)}
    </Section>
  );
}

const s = StyleSheet.create({
  section: { marginHorizontal: 16, marginVertical: 6, padding: 14, borderRadius: 12, borderWidth: 1, gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
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
    heroPlaceholder: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
    heroActions: { position: 'absolute', right: 16, flexDirection: 'row', gap: 8 },
    heroButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
    identity: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
    name: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
    scientific: { fontSize: 15, color: colors.textSecondary, fontStyle: 'italic' },
    subtitle: { fontSize: 13, color: colors.textTertiary },
    logRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    logRowTitle: { fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1 },
    logRowMeta: { fontSize: 12, color: colors.textTertiary },
    photoThumb: { width: 96, height: 96, borderRadius: 8, backgroundColor: colors.surfaceElevated },
    notes: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    errorText: { color: colors.textPrimary, marginBottom: 16 },
    retryButton: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.primary, borderRadius: 8 },
    retryText: { color: '#fff', fontWeight: '600' },
  });

export default withErrorBoundary(InvertDetailScreen);
