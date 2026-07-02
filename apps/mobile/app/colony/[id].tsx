/**
 * Colony detail — ADR-010 (Colony mode).
 *
 * Population-level detail: gradient AppHeader with the colony name, hero
 * photo/emoji, taxon + species (care-sheet link), total population +
 * per-bucket chips, husbandry InfoGrid, and an EVENTS section with an inline
 * add-event form + a timeline where each row can be deleted. Edit + delete
 * colony actions.
 *
 * Mirrors feeders/[id].tsx (quick-log panel + history + delete modals) and
 * app/invert/[id].tsx (species care-sheet link, shared InfoGrid).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import DateInput from '../../src/components/DateInput';
import { InfoGrid, type InfoGridItem } from '../../src/components/ui';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getImageUrl } from '../../src/utils/image-url';
import { parseLocalDate, toISODateLocal, formatLocalDate } from '../../src/utils/date';
import { INVERT_TAXA } from '../../src/lib/inverts';
import {
  getColony,
  listColonyEvents,
  createColonyEvent,
  deleteColonyEvent,
  deleteColony,
  formatColonyCount,
  eventHasSeverity,
  COLONY_EVENT_LABELS,
  COLONY_EVENT_ICONS,
  type Colony,
  type ColonyEvent,
  type ColonyEventType,
} from '../../src/lib/colonies';

const EVENT_TYPES: ColonyEventType[] = [
  'birth',
  'death',
  'added',
  'removed',
  'cannibalism',
  'aggression',
  'molt_found',
  'split',
  'merge',
  'observation',
  'count_correction',
];

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];

/** Event types that add to the population (positive delta by nature). */
const POSITIVE_EVENTS = new Set<ColonyEventType>(['birth', 'added', 'merge']);
/** Event types that reduce the population (negative delta by nature). */
const NEGATIVE_EVENTS = new Set<ColonyEventType>(['death', 'removed', 'cannibalism', 'split']);

function eventNeedsDelta(t: ColonyEventType): boolean {
  return POSITIVE_EVENTS.has(t) || NEGATIVE_EVENTS.has(t) || t === 'count_correction';
}

export default function ColonyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const colonyId = params.id;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [colony, setColony] = useState<Colony | null>(null);
  const [events, setEvents] = useState<ColonyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Add-event form
  const [formOpen, setFormOpen] = useState(false);
  const [eventType, setEventType] = useState<ColonyEventType>('observation');
  const [eventStage, setEventStage] = useState('');
  const [eventDelta, setEventDelta] = useState('');
  const [eventDate, setEventDate] = useState(toISODateLocal(new Date()));
  const [eventSeverity, setEventSeverity] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [eventError, setEventError] = useState('');

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchColony = useCallback(async () => {
    if (!colonyId) return;
    try {
      const [colonyRes, eventsRes] = await Promise.all([
        getColony(colonyId),
        listColonyEvents(colonyId),
      ]);
      setColony(colonyRes);
      setEvents(eventsRes);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      const msg =
        e?.response?.status === 404
          ? 'Colony not found'
          : e?.response?.data?.detail || e?.message || 'Failed to load colony';
      setLoadError(typeof msg === 'string' ? msg : 'Failed to load colony');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [colonyId]);

  useFocusEffect(
    useCallback(() => {
      fetchColony();
    }, [fetchColony]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchColony();
  };

  const openForm = () => {
    setFormOpen(true);
    setEventType('observation');
    setEventStage('');
    setEventDelta('');
    setEventDate(toISODateLocal(new Date()));
    setEventSeverity('');
    setEventNotes('');
    setEventError('');
  };

  const closeForm = () => {
    setFormOpen(false);
    setEventError('');
  };

  const submitEvent = async () => {
    if (!colony) return;

    let deltaNum: number | null = null;
    if (eventNeedsDelta(eventType)) {
      if (eventDelta.trim() === '') {
        setEventError('Enter how many.');
        return;
      }
      const parsed = Number.parseInt(eventDelta, 10);
      if (!Number.isFinite(parsed)) {
        setEventError("That doesn't look like a number.");
        return;
      }
      // Normalize sign from the event's nature so the keeper only enters a
      // magnitude. count_correction keeps its literal sign (may be +/-).
      let magnitude = Math.abs(parsed);
      if (NEGATIVE_EVENTS.has(eventType)) magnitude = -magnitude;
      deltaNum = eventType === 'count_correction' ? parsed : magnitude;
    }

    if (eventType === 'observation' && !eventNotes.trim()) {
      setEventError('Add a note for an observation.');
      return;
    }

    setEventSubmitting(true);
    setEventError('');
    try {
      await createColonyEvent(colony.id, {
        event_type: eventType,
        stage: eventStage.trim() || null,
        count_delta: deltaNum,
        occurred_at: eventDate,
        severity: eventHasSeverity(eventType) ? eventSeverity || null : null,
        notes: eventNotes.trim() || null,
      });
      closeForm();
      await fetchColony();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed to log event';
      setEventError(typeof detail === 'string' ? detail : 'Failed to log event');
    } finally {
      setEventSubmitting(false);
    }
  };

  const confirmDeleteEvent = async () => {
    if (!confirmDeleteEventId) return;
    setDeleting(true);
    try {
      await deleteColonyEvent(confirmDeleteEventId);
      setConfirmDeleteEventId(null);
      await fetchColony();
    } catch (e: any) {
      setConfirmDeleteEventId(null);
    } finally {
      setDeleting(false);
    }
  };

  const removeColony = async () => {
    if (!colony) return;
    setDeleting(true);
    try {
      await deleteColony(colony.id);
      setConfirmDelete(false);
      router.replace('/(tabs)/collection' as any);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed to delete colony';
      setLoadError(typeof detail === 'string' ? detail : 'Failed to delete colony');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const totalLabel = useMemo(() => {
    if (!colony) return '—';
    return formatColonyCount(colony.total_count, colony.count_is_estimated);
  }, [colony]);

  const backAction = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" style={{ paddingRight: 4 }}>
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const editAction = colony ? (
    <TouchableOpacity
      onPress={() => router.push(`/colony/${colony.id}/edit` as any)}
      accessibilityLabel="Edit colony"
      style={{ paddingHorizontal: 4 }}
    >
      <MaterialCommunityIcons name="pencil-outline" size={24} color={iconColor} />
    </TouchableOpacity>
  ) : null;

  const styles = makeStyles(colors);

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Colony" leftAction={backAction} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError || !colony) {
    return (
      <View style={styles.container}>
        <AppHeader title="Colony" leftAction={backAction} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🐾</Text>
          <Text style={styles.emptyTitle}>{loadError || 'Colony not found'}</Text>
          <Text style={styles.emptySub}>It may have been deleted, or you may not have access to it.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/collection' as any)}
              style={[styles.ghostBtn, { borderRadius: layout.radius.md }]}
            >
              <Text style={styles.ghostBtnText}>Back to collection</Text>
            </TouchableOpacity>
            {loadError !== '' && (
              <PrimaryButton
                onPress={() => {
                  setLoading(true);
                  setLoadError('');
                  fetchColony();
                }}
                style={[styles.retryBtn, { borderRadius: layout.radius.md }]}
                outerStyle={{ borderRadius: layout.radius.md }}
              >
                <Text style={styles.onPrimaryText}>Retry</Text>
              </PrimaryButton>
            )}
          </View>
        </View>
      </View>
    );
  }

  const meta = INVERT_TAXA[colony.taxon];
  const speciesLabel = colony.species_missing
    ? 'Species removed'
    : colony.species_display_name || colony.species_scientific_name || 'No species set';

  const stageEntries = Object.entries(colony.stage_counts ?? {});

  const husbandryItems: InfoGridItem[] = [];
  if (colony.substrate_type) husbandryItems.push({ icon: 'layers', label: 'Substrate', value: colony.substrate_type });
  if (colony.substrate_depth) husbandryItems.push({ icon: 'ruler', label: 'Substrate depth', value: colony.substrate_depth });
  if (colony.target_temp_min || colony.target_temp_max)
    husbandryItems.push({
      icon: 'thermometer',
      label: 'Temperature',
      value: `${colony.target_temp_min ?? '—'}–${colony.target_temp_max ?? '—'}°F`,
    });
  if (colony.target_humidity_min || colony.target_humidity_max)
    husbandryItems.push({
      icon: 'water-percent',
      label: 'Humidity',
      value: `${colony.target_humidity_min ?? '—'}–${colony.target_humidity_max ?? '—'}%`,
    });
  husbandryItems.push({ icon: 'cup-water', label: 'Water dish', value: colony.water_dish ? 'Yes' : 'No' });
  if (colony.last_substrate_change)
    husbandryItems.push({ icon: 'calendar-refresh', label: 'Substrate changed', value: formatLocalDate(colony.last_substrate_change, { month: 'short', day: 'numeric', year: 'numeric' }) });

  return (
    <View style={styles.container}>
      <AppHeader
        title={colony.name}
        subtitle={`${meta?.label ?? 'Colony'} colony`}
        leftAction={backAction}
        rightAction={editAction}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={'padding'}>
        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.contentInner}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Hero */}
          <View style={styles.hero}>
            {colony.photo_url ? (
              <Image source={{ uri: getImageUrl(colony.photo_url) }} style={styles.heroImage} accessibilityLabel={`Photo of ${colony.name}`} />
            ) : (
              <View style={styles.heroPlaceholder}>
                <Text style={styles.heroEmoji}>{meta?.glyph ?? '🐾'}</Text>
              </View>
            )}
            {!colony.is_active && (
              <View style={[styles.archivedPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={styles.archivedText}>Archived</Text>
              </View>
            )}
          </View>

          {/* Species / care-sheet link */}
          {colony.species_id && !colony.species_missing ? (
            <TouchableOpacity
              onPress={() => router.push(`/invert-species/${colony.species_id}` as any)}
              activeOpacity={0.7}
              accessibilityLabel="View care sheet for this species"
              style={[styles.careCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sectionHeading}>SPECIES</Text>
                <Text style={styles.careSummary} numberOfLines={2}>{speciesLabel}</Text>
                <Text style={[styles.careLink, { color: colors.primary }]}>View full care sheet →</Text>
              </View>
              <MaterialCommunityIcons name="book-open-variant" size={26} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
              <Text style={styles.sectionHeading}>SPECIES</Text>
              <Text style={[styles.speciesPlain, colony.species_missing && { fontStyle: 'italic', color: colors.textTertiary }]}>
                {speciesLabel}
              </Text>
            </View>
          )}

          {/* Population card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
            <Text style={styles.sectionHeading}>POPULATION</Text>
            <View style={styles.totalRow}>
              <Text style={styles.total}>{totalLabel}</Text>
              <Text style={styles.totalLabel}>{colony.count_is_estimated ? 'estimated total' : 'total'}</Text>
            </View>
            {stageEntries.length > 0 && (
              <View style={styles.stageGrid}>
                {stageEntries.map(([stage, n]) => (
                  <View key={stage} style={[styles.stageBucket, { backgroundColor: colors.background, borderColor: colors.border, borderRadius: layout.radius.sm }]}>
                    <Text style={styles.stageLabel}>{stage}</Text>
                    <Text style={styles.stageValue}>{n.toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            )}
            {colony.count_is_estimated && (
              <Text style={styles.estimateNote}>This colony's headcount is an estimate.</Text>
            )}
          </View>

          {/* Husbandry */}
          {husbandryItems.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
              <Text style={[styles.sectionHeading, { marginBottom: 12 }]}>HUSBANDRY</Text>
              <InfoGrid items={husbandryItems} />
            </View>
          )}

          {/* Notes */}
          {colony.notes ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
              <Text style={styles.sectionHeading}>NOTES</Text>
              <Text style={styles.detailBody}>{colony.notes}</Text>
            </View>
          ) : null}

          {/* Events */}
          <View style={styles.eventsHeaderRow}>
            <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>EVENTS</Text>
            <TouchableOpacity onPress={formOpen ? closeForm : openForm} accessibilityRole="button" accessibilityLabel={formOpen ? 'Cancel add event' : 'Add event'}>
              <Text style={[styles.addEventLink, { color: colors.primary }]}>{formOpen ? 'Cancel' : '+ Add event'}</Text>
            </TouchableOpacity>
          </View>

          {formOpen && (
            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
              {eventError !== '' && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{eventError}</Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>Event type</Text>
              <View style={styles.chipWrap}>
                {EVENT_TYPES.map((t) => {
                  const selected = t === eventType;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setEventType(t)}
                      style={[styles.eventChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.background }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={{ fontSize: 13 }}>{COLONY_EVENT_ICONS[t]}</Text>
                      <Text style={{ color: selected ? '#fff' : colors.textPrimary, fontSize: 12, fontWeight: '600' }}>{COLONY_EVENT_LABELS[t]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {eventNeedsDelta(eventType) && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                    {eventType === 'count_correction' ? 'Adjustment (use − to remove)' : 'How many'}
                  </Text>
                  <TextInput
                    value={eventDelta}
                    onChangeText={(v) => {
                      const pat = eventType === 'count_correction' ? /^-?\d*$/ : /^\d*$/;
                      if (v === '' || pat.test(v)) setEventDelta(v);
                    }}
                    keyboardType={eventType === 'count_correction' ? 'numbers-and-punctuation' : 'number-pad'}
                    placeholder={eventType === 'count_correction' ? 'e.g. -5' : 'e.g. 20'}
                    placeholderTextColor={colors.textTertiary}
                    style={[styles.input, { borderRadius: layout.radius.sm }]}
                  />
                </>
              )}

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Stage (optional)</Text>
              <TextInput
                value={eventStage}
                onChangeText={setEventStage}
                placeholder="e.g. nymphs (blank = mixed)"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                style={[styles.input, { borderRadius: layout.radius.sm }]}
              />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Date</Text>
              <DateInput
                value={parseLocalDate(eventDate) ?? new Date()}
                onChange={(d) => setEventDate(toISODateLocal(d))}
                maximumDate={new Date()}
                label="Event date"
              />

              {eventHasSeverity(eventType) && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Severity</Text>
                  <View style={styles.chipWrap}>
                    {SEVERITY_OPTIONS.map((opt) => {
                      const selected = opt.value === eventSeverity;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => setEventSeverity(selected ? '' : opt.value)}
                          style={[styles.eventChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.background }]}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <Text style={{ color: selected ? '#fff' : colors.textPrimary, fontSize: 12, fontWeight: '600' }}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                Notes {eventType === 'observation' && <Text style={{ color: colors.error }}>*</Text>}
              </Text>
              <TextInput
                value={eventNotes}
                onChangeText={setEventNotes}
                multiline
                numberOfLines={3}
                maxLength={2000}
                placeholder="What happened?"
                placeholderTextColor={colors.textTertiary}
                style={[styles.input, styles.textarea, { borderRadius: layout.radius.sm }]}
              />

              <View style={styles.panelActions}>
                <TouchableOpacity onPress={closeForm} style={[styles.ghostBtn, { borderRadius: layout.radius.sm }]}>
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>
                <PrimaryButton
                  onPress={submitEvent}
                  disabled={eventSubmitting}
                  style={[styles.saveBtn, { borderRadius: layout.radius.sm }]}
                  outerStyle={{ borderRadius: layout.radius.sm }}
                >
                  <Text style={styles.onPrimaryText}>{eventSubmitting ? 'Saving…' : 'Log it'}</Text>
                </PrimaryButton>
              </View>
            </View>
          )}

          {/* Timeline */}
          {events.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md, alignItems: 'center' }]}>
              <Text style={styles.emptyHistory}>No events yet. Log births, deaths, restocks, and observations to track the colony over time.</Text>
            </View>
          ) : (
            <View style={[styles.historyWrap, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
              {events.map((ev, idx) => (
                <View
                  key={ev.id}
                  style={[styles.logRow, { borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                >
                  <Text style={styles.logIcon}>{COLONY_EVENT_ICONS[ev.event_type]}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.logTopRow}>
                      <Text style={styles.logTitle}>
                        {COLONY_EVENT_LABELS[ev.event_type]}
                        {ev.stage ? <Text style={styles.logStage}>{`  ${ev.stage}`}</Text> : null}
                        {ev.count_delta != null && ev.count_delta !== 0 && (
                          <Text style={{ color: ev.count_delta > 0 ? colors.success : colors.error, fontWeight: '700' }}>
                            {`  ${ev.count_delta > 0 ? '+' : ''}${ev.count_delta.toLocaleString()}`}
                          </Text>
                        )}
                      </Text>
                      <Text style={styles.logDate}>{formatLocalDate(ev.occurred_at, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                    </View>
                    {ev.severity ? <Text style={styles.logSeverity}>{`Severity: ${ev.severity}`}</Text> : null}
                    {ev.notes ? <Text style={styles.logNotes} numberOfLines={6}>{ev.notes}</Text> : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => setConfirmDeleteEventId(ev.id)}
                    accessibilityLabel={`Delete ${COLONY_EVENT_LABELS[ev.event_type]} event`}
                    style={{ padding: 6 }}
                  >
                    <MaterialCommunityIcons name="close" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Delete colony */}
          <TouchableOpacity
            onPress={() => setConfirmDelete(true)}
            style={[styles.deleteBtn, { borderColor: colors.error, borderRadius: layout.radius.md }]}
          >
            <Text style={[styles.deleteText, { color: colors.error }]}>Delete colony</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete colony modal */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => !deleting && setConfirmDelete(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }]}>
            <Text style={styles.modalTitle}>Delete this colony?</Text>
            <Text style={styles.modalBody}>
              All events for <Text style={{ fontWeight: '700' }}>{colony.name}</Text> will be permanently deleted. This can't be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setConfirmDelete(false)} disabled={deleting} style={[styles.ghostBtn, { borderRadius: layout.radius.sm }]}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={removeColony} disabled={deleting} style={[styles.destructiveBtn, { borderColor: colors.error, borderRadius: layout.radius.sm }]}>
                <Text style={{ color: colors.error, fontWeight: '700' }}>{deleting ? 'Deleting…' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete event modal */}
      <Modal visible={confirmDeleteEventId !== null} transparent animationType="fade" onRequestClose={() => !deleting && setConfirmDeleteEventId(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }]}>
            <Text style={styles.modalTitle}>Delete this event?</Text>
            <Text style={styles.modalBody}>Population changes it caused will NOT be reverted.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setConfirmDeleteEventId(null)} disabled={deleting} style={[styles.ghostBtn, { borderRadius: layout.radius.sm }]}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDeleteEvent} disabled={deleting} style={[styles.destructiveBtn, { borderColor: colors.error, borderRadius: layout.radius.sm }]}>
                <Text style={{ color: colors.error, fontWeight: '700' }}>{deleting ? 'Deleting…' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1 },
    contentInner: { padding: 16 },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6, textAlign: 'center', color: colors.textPrimary },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20, maxWidth: 320, color: colors.textSecondary },
    ghostBtn: { borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 16 },
    ghostBtnText: { color: colors.textPrimary, fontWeight: '600' },
    onPrimaryText: { color: '#fff', fontWeight: '600' },
    retryBtn: { paddingVertical: 10, paddingHorizontal: 18 },
    hero: { marginBottom: 16, position: 'relative' },
    heroImage: { width: '100%', height: 200, borderRadius: 16, backgroundColor: colors.border },
    heroPlaceholder: { width: '100%', height: 200, borderRadius: 16, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
    heroEmoji: { fontSize: 72 },
    archivedPill: { position: 'absolute', top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
    archivedText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textSecondary },
    card: { borderWidth: 1, padding: 16, marginBottom: 16 },
    sectionHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.textTertiary, marginBottom: 8 },
    speciesPlain: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    careCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 16, marginBottom: 16 },
    careSummary: { fontSize: 15, fontWeight: '600', lineHeight: 20, color: colors.textPrimary },
    careLink: { fontSize: 13, fontWeight: '700', marginTop: 8 },
    totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 12 },
    total: { fontSize: 36, fontWeight: '800', color: colors.textPrimary },
    totalLabel: { fontSize: 12, color: colors.textTertiary },
    stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    stageBucket: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 10, minWidth: 90, flexGrow: 1 },
    stageLabel: { fontSize: 11, textTransform: 'capitalize', color: colors.textTertiary },
    stageValue: { fontSize: 17, fontWeight: '700', marginTop: 2, color: colors.textPrimary },
    estimateNote: { fontSize: 11, marginTop: 10, color: colors.textTertiary, fontStyle: 'italic' },
    detailBody: { fontSize: 14, lineHeight: 20, color: colors.textPrimary },
    eventsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    addEventLink: { fontSize: 14, fontWeight: '700' },
    panel: { borderWidth: 1, padding: 14, marginBottom: 16 },
    errorBox: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: colors.error, borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 10 },
    errorText: { fontSize: 13, color: colors.error },
    fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, color: colors.textPrimary },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    eventChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
    input: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.background },
    textarea: { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 },
    panelActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
    saveBtn: { paddingVertical: 10, paddingHorizontal: 16 },
    emptyHistory: { fontSize: 14, textAlign: 'center', padding: 8, color: colors.textSecondary },
    historyWrap: { borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
    logRow: { flexDirection: 'row', padding: 12, gap: 10, alignItems: 'flex-start' },
    logIcon: { fontSize: 20 },
    logTopRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    logTitle: { fontSize: 14, fontWeight: '600', flexShrink: 1, color: colors.textPrimary },
    logStage: { fontSize: 12, color: colors.textTertiary, textTransform: 'capitalize' },
    logDate: { fontSize: 11, color: colors.textTertiary },
    logSeverity: { fontSize: 12, marginTop: 2, color: colors.textSecondary, textTransform: 'capitalize' },
    logNotes: { fontSize: 13, marginTop: 4, lineHeight: 18, color: colors.textSecondary },
    deleteBtn: { marginTop: 8, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
    deleteText: { fontSize: 14, fontWeight: '600' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modalCard: { width: '100%', maxWidth: 420, borderWidth: 1, padding: 20 },
    modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8, color: colors.textPrimary },
    modalBody: { fontSize: 14, lineHeight: 20, marginBottom: 18, color: colors.textSecondary },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    destructiveBtn: { borderWidth: 1, backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingVertical: 10, paddingHorizontal: 16 },
  });
