/**
 * Photo timeline (2026-10-20) — every photo of one animal in date order.
 * Swipe the photo or drag the slider; each photo is labelled by the SHED
 * period it falls in ("After shed 3 · Jun 12, 2026 · 2 days after shed") and
 * the slider carries a marker at every logged shed. Optional side-by-side
 * compare (first vs latest by default). Tarantuverse mobile has the molt
 * version (apps/mobile/src/components/PhotoTimeline.tsx) — keep them alike.
 *
 * Read-only, so it opens for living, died and transferred animals alike.
 * OTA-safe: core RN only (Modal, FlatList paging, PanResponder) — no
 * gesture-handler / reanimated / slider package. Grouping rules live in
 * src/lib/photo-timeline.ts (pure + tested); lengths go through
 * src/lib/units, never a hardcoded unit.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../contexts/ThemeContext';
import { useUnits } from '../hooks/useUnits';
import { formatLength } from '../lib/units';
import type { Photo } from '../lib/photos';
import type { ShedLog } from '../lib/animals';
import {
  daysAfterLabel,
  groupPhotosByMolt,
  markerFraction,
  markerLabel,
  periodLabel,
  type PhotoTimelineEntry,
  type PhotoTimelineMarker,
} from '../lib/photo-timeline';
import { TYPE } from '../theme/type';

/** Mirrors useTheme().layout.spacing (static here for StyleSheet.create). */
const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

type Entry = PhotoTimelineEntry<Photo>;
const NOUN = 'shed' as const;
const DATE_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/** Bare "YYYY-MM-DD" is a local day; datetimes carry their own offset. */
function formatLocalDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, opts);
}

export default function PhotoTimeline({
  visible,
  onClose,
  animalName,
  photos,
  sheds,
}: {
  visible: boolean;
  onClose: () => void;
  animalName: string;
  photos: Photo[];
  sheds: ShedLog[];
}) {
  const { colors, layout } = useTheme();
  const { units } = useUnits();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { entries, markers, moltCount } = useMemo(
    () => groupPhotosByMolt(photos, sheds.map((s) => ({ id: s.id, at: s.shed_at }))),
    [photos, sheds],
  );
  const n = entries.length;
  const shedById = useMemo(() => new Map(sheds.map((s) => [s.id, s])), [sheds]);

  // Mounted only while open (the parent renders it conditionally), so this
  // opens on the newest photo and compare defaults to first vs latest.
  const [idx, setIdx] = useState(() => Math.max(0, n - 1));
  const [compare, setCompare] = useState(false);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(() => Math.max(0, n - 1));
  const listRef = useRef<FlatList<Entry>>(null);

  // Photos can change underneath (a refetch): keep the indices in range.
  useEffect(() => {
    setIdx((i) => Math.min(i, Math.max(0, n - 1)));
    setRight((i) => Math.min(i, Math.max(0, n - 1)));
    setLeft((i) => Math.min(i, Math.max(0, n - 1)));
  }, [n]);

  /** Slider / chip / arrow → move the pager too. Swipes set idx directly. */
  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(n - 1, i));
    setIdx(next);
    listRef.current?.scrollToIndex({ index: next, animated: false });
  };

  if (n === 0) return null;

  const titleFor = (e: Entry) => periodLabel(e.moltNumber, moltCount, NOUN) ?? 'Photo';
  const metaFor = (e: Entry) =>
    [formatLocalDate(e.date, DATE_OPTS), daysAfterLabel(e.daysAfterMolt, NOUN)].filter(Boolean).join(' · ');
  const sizeFor = (e: Entry) => {
    if (!e.moltId) return null;
    const v = formatLength(shedById.get(e.moltId)?.length_after_in, units);
    return v ? `Length after shed ${e.moltNumber}: ${v}` : null;
  };

  const current = entries[Math.min(idx, n - 1)];
  const periods: { moltNumber: number; first: number; count: number }[] = [];
  entries.forEach((e, i) => {
    const last = periods[periods.length - 1];
    if (last && last.moltNumber === e.moltNumber) last.count++;
    else periods.push({ moltNumber: e.moltNumber, first: i, count: 1 });
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + SPACING.sm }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerText}>
            <Text style={[TYPE.heading, { color: colors.textPrimary }]} accessibilityRole="header">Photo timeline</Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {animalName} · {n} photos{moltCount ? ` · ${moltCount} ${moltCount === 1 ? 'shed' : 'sheds'} logged` : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setCompare((c) => !c)}
            accessibilityRole="button"
            accessibilityState={{ selected: compare }}
            accessibilityLabel="Compare two photos side by side"
            style={[
              styles.pill,
              { borderRadius: layout.radius.xl, borderColor: compare ? colors.primary : colors.border, backgroundColor: compare ? colors.primary : colors.surface },
            ]}
          >
            <Text style={[TYPE.label, { color: compare ? colors.surface : colors.textPrimary }]}>Compare</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close photo timeline" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.close}>
            <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {compare ? (
          <View style={styles.compareRow}>
            {([['Left', left, setLeft], ['Right', right, setRight]] as const).map(([side, value, set]) => {
              const e = entries[Math.min(value, n - 1)];
              return (
                <View key={side} style={styles.comparePane}>
                  <View style={[styles.compareImageBox, { backgroundColor: colors.surfaceRaised, borderRadius: layout.radius.md }]}>
                    <Image source={{ uri: e.photo.url }} style={styles.fill} resizeMode="contain" accessibilityLabel={e.photo.caption || titleFor(e)} />
                  </View>
                  <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>{titleFor(e)}</Text>
                  <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={2}>{metaFor(e)}</Text>
                  {sizeFor(e) ? <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={2}>{sizeFor(e)}</Text> : null}
                  <View style={styles.stepper}>
                    <StepButton icon="chevron-left" disabled={value <= 0} onPress={() => set(value - 1)} label={`${side} photo: earlier`} />
                    <Text style={[TYPE.label, { color: colors.textSecondary }]}>{value + 1} / {n}</Text>
                    <StepButton icon="chevron-right" disabled={value >= n - 1} onPress={() => set(value + 1)} label={`${side} photo: later`} />
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <>
            <View style={[styles.pagerBox, { backgroundColor: colors.surfaceRaised }]}>
              <FlatList
                ref={listRef}
                data={entries}
                keyExtractor={(e) => e.photo.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={Math.min(idx, n - 1)}
                getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                onMomentumScrollEnd={(ev) => setIdx(Math.max(0, Math.min(n - 1, Math.round(ev.nativeEvent.contentOffset.x / width))))}
                renderItem={({ item }) => (
                  <View style={{ width, height: '100%' }}>
                    <Image source={{ uri: item.photo.url }} style={styles.fill} resizeMode="contain" accessibilityLabel={item.photo.caption || titleFor(item)} />
                  </View>
                )}
              />
              <View style={[styles.counter, { backgroundColor: colors.surface, borderRadius: layout.radius.sm }]}>
                <Text style={[TYPE.caption, { color: colors.textPrimary }]}>{idx + 1} / {n}</Text>
              </View>
            </View>

            <View style={styles.captionBox}>
              <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>{titleFor(current)}</Text>
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>{metaFor(current)}</Text>
              {sizeFor(current) ? <Text style={[TYPE.body, { color: colors.textSecondary }]}>{sizeFor(current)}</Text> : null}
              {current.photo.caption ? <Text style={[TYPE.body, { color: colors.textTertiary, fontStyle: 'italic' }]} numberOfLines={2}>{current.photo.caption}</Text> : null}
            </View>

            {n > 1 && (
              <Scrubber
                count={n}
                index={idx}
                markers={markers}
                onChange={goTo}
                valueText={`${titleFor(current)}, ${metaFor(current)}`}
              />
            )}
            <View style={styles.rangeLabels}>
              <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{formatLocalDate(entries[0].date, DATE_OPTS)}</Text>
              <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{formatLocalDate(entries[n - 1].date, DATE_OPTS)}</Text>
            </View>

            {moltCount > 0 && periods.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {periods.map((p) => {
                  const active = current.moltNumber === p.moltNumber;
                  return (
                    <TouchableOpacity
                      key={p.moltNumber}
                      onPress={() => goTo(p.first)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.pill,
                        { borderRadius: layout.radius.xl, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface },
                      ]}
                    >
                      <Text style={[TYPE.caption, { color: active ? colors.surface : colors.textSecondary }]}>
                        {periodLabel(p.moltNumber, moltCount, NOUN)} ({p.count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}

        <Text style={[TYPE.caption, styles.note, { color: colors.textTertiary }]}>
          Photos are dated by when they were added to the app.{moltCount === 0 ? ' Log sheds to see each photo placed between them.' : ''}
        </Text>
      </View>
    </Modal>
  );
}

function StepButton({ icon, disabled, onPress, label }: { icon: 'chevron-left' | 'chevron-right'; disabled: boolean; onPress: () => void; label: string }) {
  const { colors, layout } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.step, { borderColor: colors.border, borderRadius: layout.radius.xl, opacity: disabled ? 0.35 : 1 }]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

/**
 * Index slider on PanResponder (core RN — no slider package, so it ships by
 * OTA). Stops at each photo; shed markers sit between the stops. Screen
 * readers get an adjustable control (swipe up/down to step).
 */
function Scrubber({
  count,
  index,
  markers,
  onChange,
  valueText,
}: {
  count: number;
  index: number;
  markers: PhotoTimelineMarker[];
  onChange: (i: number) => void;
  valueText: string;
}) {
  const { colors, layout } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const widthRef = useRef(0);
  const startX = useRef(0);
  const last = useRef(index);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const countRef = useRef(count);
  countRef.current = count;
  last.current = index;

  const pick = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return;
    const f = Math.max(0, Math.min(1, x / w));
    const i = Math.round(f * (countRef.current - 1));
    if (i !== last.current) {
      last.current = i;
      onChangeRef.current(i);
    }
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the drag when the finger wanders off the track.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        pick(startX.current);
      },
      onPanResponderMove: (_e, g) => pick(startX.current + g.dx),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  };
  const frac = count > 1 ? index / (count - 1) : 0;
  const THUMB = 22;

  return (
    <View style={styles.scrubWrap}>
      {/* Shed marker labels above the track (ticks only when crowded). */}
      <View style={styles.markerRow} pointerEvents="none">
        {trackWidth > 0 && markers.map((m) => (
          <View key={m.molts[0].id} style={[styles.marker, { left: markerFraction(m.beforeIndex, count) * trackWidth - 30 }]}>
            {markers.length <= 6 ? (
              <Text style={[TYPE.caption, { color: colors.warning }]} numberOfLines={1}>{markerLabel(m, NOUN)}</Text>
            ) : null}
            <View style={[styles.markerTick, { backgroundColor: colors.warning }]} />
          </View>
        ))}
      </View>
      <View
        style={styles.track}
        onLayout={onLayout}
        {...responder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Scrub through photos"
        accessibilityValue={{ text: valueText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChange(Math.min(count - 1, index + 1));
          if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(0, index - 1));
        }}
      >
        <View pointerEvents="none" style={[styles.trackLine, { backgroundColor: colors.border, borderRadius: layout.radius.xl }]} />
        <View pointerEvents="none" style={[styles.trackFill, { width: frac * trackWidth, backgroundColor: colors.primary, borderRadius: layout.radius.xl }]} />
        {trackWidth > 0 && markers.map((m) => (
          <View
            key={m.molts[0].id}
            pointerEvents="none"
            style={[styles.trackMarker, { left: markerFraction(m.beforeIndex, count) * trackWidth - 1, backgroundColor: colors.warning }]}
          />
        ))}
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: THUMB,
              height: THUMB,
              left: frac * trackWidth - THUMB / 2,
              backgroundColor: colors.primary,
              borderColor: colors.surface,
              borderRadius: layout.radius.xl,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, minWidth: 0 },
  pill: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderWidth: 1 },
  close: { padding: SPACING.xs },
  pagerBox: { flex: 1, marginTop: SPACING.md },
  fill: { width: '100%', height: '100%' },
  counter: { position: 'absolute', top: SPACING.sm, right: SPACING.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  captionBox: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, gap: 2 },
  scrubWrap: { paddingHorizontal: SPACING.xl, marginTop: SPACING.md },
  markerRow: { height: 22 },
  marker: { position: 'absolute', top: 0, width: 60, alignItems: 'center' },
  markerTick: { width: 2, height: 4, marginTop: 1 },
  track: { height: 36, justifyContent: 'center' },
  trackLine: { position: 'absolute', left: 0, right: 0, height: 4 },
  trackFill: { position: 'absolute', left: 0, height: 4 },
  trackMarker: { position: 'absolute', width: 2, height: 14 },
  thumb: { position: 'absolute', borderWidth: 2 },
  rangeLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.xl },
  chips: { gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  note: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  compareRow: { flex: 1, flexDirection: 'row', gap: SPACING.sm, padding: SPACING.md },
  comparePane: { flex: 1, minWidth: 0, gap: 2 },
  compareImageBox: { flex: 1, overflow: 'hidden', marginBottom: SPACING.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.sm },
  step: { borderWidth: 1, padding: SPACING.xs },
});
