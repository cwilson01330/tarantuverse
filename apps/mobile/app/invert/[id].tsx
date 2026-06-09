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

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getImageUrl } from '../../src/utils/image-url';
import {
  INVERT_TAXA, deleteInvert, getInvert, invertDisplayName,
  listInvertFeedings, listInvertMolts, listInvertPhotos, listInvertSubstrateChanges,
  deleteInvertFeeding, deleteInvertMolt, deleteInvertSubstrateChange,
  setInvertMainPhoto, deleteInvertPhoto,
  type Invert, type InvertFeedingLog, type InvertMoltLog, type InvertPhoto, type InvertSubstrateChange,
} from '../../src/lib/inverts';
import { SectionCard, InfoRow as UIInfoRow } from '../../src/components/ui';
import { SPACING, TYPE } from '../../src/theme/tokens';

function InvertDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

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
    `/invert/add-feeding?id=${id}&logId=${f.id}&fed_at=${encodeURIComponent(f.fed_at)}&food_type=${encodeURIComponent(f.food_type ?? '')}&accepted=${f.accepted}&notes=${encodeURIComponent(f.notes ?? '')}` as any,
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

  // Personalized header title (name → common → scientific → "Unnamed <taxon>"),
  // mirroring the tarantula screen. The AppHeader is preset-aware (gradient in
  // Hobbyist, flat in Keeper). Action set is honest: share / QR / reminder
  // aren't wired for inverts yet (QR is tarantula-only on the roadmap), so the
  // header carries edit + delete until those subsystems generalize.
  const headerTitle = invertDisplayName(invert);
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
      <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
    </TouchableOpacity>
  );
  const headerActions = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <TouchableOpacity style={{ padding: 6 }} onPress={() => router.push(`/invert/edit?id=${id}` as any)} accessibilityLabel="Edit">
        <MaterialCommunityIcons name="pencil" size={22} color={iconColor} />
      </TouchableOpacity>
      <TouchableOpacity style={{ padding: 6 }} onPress={handleDelete} accessibilityLabel="Delete">
        <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.flex}>
      <AppHeader title={headerTitle} leftAction={backButton} rightAction={headerActions} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          {invert.photo_url ? (
            <Image source={{ uri: getImageUrl(invert.photo_url) }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Text style={{ fontSize: 64 }}>{meta?.glyph ?? '🐾'}</Text>
            </View>
          )}
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
        onEdit={editFeeding} onDelete={(f) => confirmDeleteLog('feeding', () => deleteInvertFeeding(f.id))}
        renderItem={(item) => (<><Text style={styles.logRowTitle}>{item.food_type || 'Feeding'} · {item.accepted ? 'Accepted' : 'Refused'}</Text><Text style={styles.logRowMeta}>{fmtDate(item.fed_at)}</Text></>)} colors={colors} />

      <LogSection title="Molts" emptyText="No molts logged yet." ctaLabel="Log molt"
        onCta={() => router.push(`/invert/add-molt?id=${id}` as any)} items={molts.slice(0, 5)}
        onEdit={editMolt} onDelete={(m) => confirmDeleteLog('molt', () => deleteInvertMolt(m.id))}
        renderItem={(item) => (<><Text style={styles.logRowTitle}>Molt</Text><Text style={styles.logRowMeta}>{fmtDate(item.molted_at)}</Text></>)} colors={colors} />

      <LogSection title="Substrate changes" emptyText="No substrate changes logged yet." ctaLabel="Log substrate change"
        onCta={() => router.push(`/invert/add-substrate-change?id=${id}` as any)} items={substrate.slice(0, 5)}
        onEdit={editSubstrate} onDelete={(c) => confirmDeleteLog('substrate change', () => deleteInvertSubstrateChange(c.id))}
        renderItem={(item) => (<><Text style={styles.logRowTitle}>{item.substrate_type || 'Substrate change'}</Text><Text style={styles.logRowMeta}>{fmtDate(item.changed_at)}</Text></>)} colors={colors} />

      <Section title="Photos" actionLabel="Add photo" onAction={() => router.push(`/invert/add-photo?id=${id}` as any)}>
        {photos.length === 0 ? (
          <Text style={[s.empty, { color: colors.textTertiary }]}>No photos yet.</Text>
        ) : (
          <>
            <FlatList horizontal data={photos} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}
              renderItem={({ item }) => {
                const isHero = invert.photo_url === item.url;
                return (
                  <TouchableOpacity activeOpacity={0.8} onLongPress={() => handlePhotoLongPress(item)} accessibilityRole="imagebutton" accessibilityLabel={isHero ? 'Hero photo. Long-press to manage.' : 'Photo. Long-press to set as hero or delete.'}>
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
            <Text style={[s.empty, { color: colors.textTertiary, fontStyle: 'normal' }]}>Long-press a photo to set it as the hero or delete it.</Text>
          </>
        )}
      </Section>

      {invert.notes && <Section title="Notes"><Text style={styles.notes}>{invert.notes}</Text></Section>}
      </ScrollView>
    </View>
  );
}

function fmtSex(sex: Invert['sex']): string { if (!sex || sex === 'unknown') return '—'; return sex.charAt(0).toUpperCase() + sex.slice(1); }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleDateString(); } catch { return iso; } }
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

function LogSection<T extends { id: string }>({ title, emptyText, ctaLabel, onCta, items, renderItem, onEdit, onDelete, colors }: { title: string; emptyText: string; ctaLabel: string; onCta: () => void; items: T[]; renderItem: (item: T) => React.ReactNode; onEdit?: (item: T) => void; onDelete?: (item: T) => void; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <Section title={title} actionLabel={ctaLabel} onAction={onCta}>
      {items.length === 0 ? (
        <Text style={[s.empty, { color: colors.textTertiary }]}>{emptyText}</Text>
      ) : items.map((item) => (
        <View key={item.id} style={[s.logRow, { borderBottomColor: colors.border }]}>
          <View style={s.logRowContent}>{renderItem(item)}</View>
          {onEdit && (
            <TouchableOpacity onPress={() => onEdit(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${title.toLowerCase()} entry`}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity onPress={() => onDelete(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${title.toLowerCase()} entry`}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </Section>
  );
}

const s = StyleSheet.create({
  empty: { ...TYPE.label, fontStyle: 'italic' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  logRowContent: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
});

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingBottom: SPACING.xxl },
    hero: { position: 'relative' },
    heroImage: { width: '100%', height: 280 },
    heroPlaceholder: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
    heroActions: { position: 'absolute', right: SPACING.lg, flexDirection: 'row', gap: SPACING.sm },
    heroButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
    identity: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.xs },
    name: { ...TYPE.title, color: colors.textPrimary },
    scientific: { ...TYPE.body, color: colors.textSecondary, fontStyle: 'italic' },
    subtitle: { ...TYPE.label, color: colors.textTertiary },
    logRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    logRowTitle: { ...TYPE.bodyStrong, color: colors.textPrimary, flex: 1 },
    logRowMeta: { ...TYPE.caption, color: colors.textTertiary },
    photoThumb: { width: 96, height: 96, borderRadius: 8, backgroundColor: colors.surfaceElevated },
    heroTag: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    heroTagText: { ...TYPE.caption, color: '#fff' },
    notes: { ...TYPE.body, color: colors.textSecondary },
    errorText: { ...TYPE.body, color: colors.textPrimary, marginBottom: SPACING.lg },
    retryButton: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, backgroundColor: colors.primary, borderRadius: 8 },
    retryText: { ...TYPE.bodyStrong, color: '#fff' },
  });

export default withErrorBoundary(InvertDetailScreen);
