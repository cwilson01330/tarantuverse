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
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import QRSheet from '../../src/components/QRSheet';
import { EndColonySheet } from '../../src/components/EndColonySheet';
import { ColonyTransferSheet } from '../../src/components/colony/ColonyTransferSheet';
import ColonyPopulationCard from '../../src/components/colony/ColonyPopulationCard';
import ColonyQuickLogSheet, { type QuickKind } from '../../src/components/colony/ColonyQuickLogSheet';
import ColonyActivity from '../../src/components/colony/ColonyActivity';
import { taxonMdiIcon } from '../../src/lib/inverts';
import { SPACING, TYPE } from '../../src/theme/tokens';
import { COLONY_EVENT_MDI } from '../../src/lib/colony-events';
import { getImageUrl } from '../../src/utils/image-url';
import { getErrorMessage } from '../../src/utils/errors';
import { parseLocalDate, toISODateLocal, formatLocalDate } from '../../src/utils/date';
import { INVERT_TAXA } from '../../src/lib/inverts';
import {
  getColony,
  listColonyEvents,
  getColonyPopulationHistory,
  type PopulationHistory,
  listColonyPhotos,
  listColonyFeedings,
  listColonyMolts,
  listColonySubstrateChanges,
  listColonyCareLogs,
  createColonyCareLog,
  deleteColonyCareLog,
  updateColonyCareLog,
  updateColonyFeeding,
  deleteColonyFeeding,
  updateColonyMolt,
  updateColonySubstrateChange,
  updateColonyEvent,
  CARE_LOG_LABELS,
  type ColonyCareLog,
  type CareLogType,
  createColonySubstrateChange,
  deleteColonySubstrateChange,
  substrateReasonsFor,
  createColonyMolt,
  deleteColonyMolt,
  setColonyMainPhoto,
  deleteColonyPhoto,
  type ColonyPhoto,
  type ColonyFeedingLog,
  type ColonyMoltLog,
  type ColonySubstrateChange,
  createColonyEvent,
  deleteColonyEvent,
  deleteColony,
  reopenColony,
  colonyEndReasonLabel,
  eventHasSeverity,
  COLONY_EVENT_LABELS,
  type Colony,
  type ColonyEvent,
  type ColonyEventType,
} from '../../src/lib/colonies';
import { useAuth } from '../../src/contexts/AuthContext';
import { formatTempRange } from '../../src/lib/units';
import { ROLE_HELP, ROLE_LABEL, attribution, can, canChangeEntry, useCollectionRole } from '../../src/lib/co-keepers';

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
  const [photos, setPhotos] = useState<ColonyPhoto[]>([]);
  const [feedings, setFeedings] = useState<ColonyFeedingLog[]>([]);
  const [molts, setMolts] = useState<ColonyMoltLog[]>([]);
  const [moltBusy, setMoltBusy] = useState(false);
  const [moltFormOpen, setMoltFormOpen] = useState(false);
  const [moltDate, setMoltDate] = useState(toISODateLocal(new Date()));
  const [moltNote, setMoltNote] = useState('');
  const [substrates, setSubstrates] = useState<ColonySubstrateChange[]>([]);
  const [subFormOpen, setSubFormOpen] = useState(false);
  const [subDate, setSubDate] = useState(toISODateLocal(new Date()));
  const [subReason, setSubReason] = useState('');
  const [subType, setSubType] = useState('');
  const [subNote, setSubNote] = useState('');
  const [subBusy, setSubBusy] = useState(false);
  // Hydration (cwc_20260910). Defaults to `water_dish` because that's the
  // commonest act across taxa, but for a detritivore culture `misted` and
  // `overflow` are the ones that carry the husbandry.
  const [careLogs, setCareLogs] = useState<ColonyCareLog[]>([]);
  const [history, setHistory] = useState<PopulationHistory | null>(null);
  const [careFormOpen, setCareFormOpen] = useState(false);
  const [careType, setCareType] = useState<CareLogType>('water_dish');
  const [careDate, setCareDate] = useState(toISODateLocal(new Date()));
  const [careNote, setCareNote] = useState('');
  const [careBusy, setCareBusy] = useState(false);
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
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);

  // Co-keepers (rung 3): what the viewer may do here. Hides controls that
  // would fail — the API checks every request.
  const { user, units } = useAuth();
  const { role, ownerName } = useCollectionRole(user?.id, colony?.user_id);
  const isOwner = role === 'owner';
  // An ended colony is a historical record: like a died animal's screen, every
  // logging and editing control goes away. Only Reopen survives, and it needs
  // the raw role rather than the gated one.
  const isEnded = !!colony?.ended_at;
  // Handed to another keeper through a claimed whole-colony transfer: a
  // historical record like an ended colony, so logging and editing close.
  const isTransferred = !!colony?.transferred_out_at;
  const canKeepRole = can(role, 'keeper');
  const canLog = can(role, 'logger') && !isEnded && !isTransferred;
  const canKeep = canKeepRole && !isEnded && !isTransferred;
  const [endOpen, setEndOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const mayChange = (e: { logged_by_user_id?: string | null }) => canChangeEntry(role, user?.id, e);
  const [deleting, setDeleting] = useState(false);
  const [showAllFeed, setShowAllFeed] = useState(false);
  // Edit modal for molt / substrate / water / event rows (feeding edits reuse
  // the add-feeding screen). One modal, fields vary by kind.
  const [editTarget, setEditTarget] = useState<
    { kind: 'molt' | 'substrate' | 'care' | 'event'; id: string } | null
  >(null);
  const [eDate, setEDate] = useState(toISODateLocal(new Date()));
  const [eNote, setENote] = useState('');
  const [eType, setEType] = useState<CareLogType>('water_dish');
  const [eReason, setEReason] = useState('');
  const [eSubType, setESubType] = useState('');
  const [eStage, setEStage] = useState('');
  const [eDelta, setEDelta] = useState('');
  const [eSeverity, setESeverity] = useState('');
  const [eBusy, setEBusy] = useState(false);
  const [eError, setEError] = useState('');
  const [quick, setQuick] = useState<QuickKind | null>(null);
  const [husbandryOpen, setHusbandryOpen] = useState(false);
  /** Slices that failed to load on the last fetch (empty = all good). */
  const [partialFailure, setPartialFailure] = useState<string[]>([]);

  const fetchColony = useCallback(async () => {
    if (!colonyId) return;
    try {
      // Non-fatal slices: one bad endpoint mustn't break the whole screen —
      // but the failure is RECORDED, not swallowed, so an error never reads
      // as "nothing logged" (design handoff §14.8).
      const failed: string[] = [];
      const soft = <T,>(p: Promise<T>, fallback: T, what: string): Promise<T> =>
        p.catch(() => { failed.push(what); return fallback; });
      const [colonyRes, eventsRes, photosRes, feedingsRes, moltsRes, subsRes, careRes, historyRes] = await Promise.all([
        getColony(colonyId),
        listColonyEvents(colonyId),
        soft(listColonyPhotos(colonyId), [] as ColonyPhoto[], 'photos'),
        soft(listColonyFeedings(colonyId), [] as ColonyFeedingLog[], 'feedings'),
        soft(listColonyMolts(colonyId), [] as ColonyMoltLog[], 'molts'),
        soft(listColonySubstrateChanges(colonyId), [] as ColonySubstrateChange[], 'substrate changes'),
        soft(listColonyCareLogs(colonyId), [] as ColonyCareLog[], 'water logs'),
        soft(getColonyPopulationHistory(colonyId), null, 'population history'),
      ]);
      setPartialFailure(failed);
      setColony(colonyRes);
      setEvents(eventsRes);
      setPhotos(photosRes);
      setFeedings(feedingsRes);
      setMolts(moltsRes);
      setSubstrates(subsRes);
      setCareLogs(careRes);
      setHistory(historyRes);
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

  const openForm = (preset: ColonyEventType = 'observation') => {
    setFormOpen(true);
    setEventType(preset);
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

  /** Undo an end. A correction, so confirmed gently and never blocked by the
   *  plan cap (the colony starts counting again). */
  const handleReopen = () => {
    if (!colony || reopening) return;
    Alert.alert(
      `Reopen ${colony.name}?`,
      'It will return to your collection, count toward your plan again, and logging will be open.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          onPress: async () => {
            setReopening(true);
            try {
              await reopenColony(colony.id);
              await fetchColony();
            } catch (e) {
              Alert.alert('Could not reopen', getErrorMessage(e));
            } finally {
              setReopening(false);
            }
          },
        },
      ],
    );
  };

  const backAction = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" style={{ paddingRight: 4 }}>
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  // QR sits beside Edit. Owner only, like the upload-session route behind it.
  const qrAction = colony && isOwner ? (
    <TouchableOpacity
      onPress={() => setQrOpen(true)}
      accessibilityLabel="QR label and photo upload"
      style={{ paddingHorizontal: 4 }}
    >
      <MaterialCommunityIcons name="qrcode" size={24} color={iconColor} />
    </TouchableOpacity>
  ) : null;

  const editButton = colony && canKeep ? (
    <TouchableOpacity
      onPress={() => router.push(`/colony/${colony.id}/edit` as any)}
      accessibilityLabel="Edit colony"
      style={{ paddingHorizontal: 4 }}
    >
      <MaterialCommunityIcons name="pencil-outline" size={24} color={iconColor} />
    </TouchableOpacity>
  ) : null;

  // Share card: keeper-level like sharing an animal. canKeep is already false
  // for an ended colony, which the API refuses a new card for (409).
  const shareButton = colony && canKeep ? (
    <TouchableOpacity
      onPress={() => router.push(`/share/${colony.id}?kind=colony` as any)}
      accessibilityLabel="Share card"
      style={{ paddingHorizontal: 4 }}
    >
      <MaterialCommunityIcons name="share-variant" size={24} color={iconColor} />
    </TouchableOpacity>
  ) : null;

  const editAction = qrAction || editButton || shareButton ? (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shareButton}
      {qrAction}
      {editButton}
    </View>
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



  /** Group feeding goes through a form, not a one-tap write.
   *
   *  For a single animal, "fed" is a complete record — there's one mouth and
   *  it got one prey item. For a group it isn't: the useful fact is "six
   *  crickets into eleven spiders", and a one-tap log that silently means
   *  "1 unspecified prey" is a claim the keeper never made. So the colony
   *  path collects prey type, size, count and outcome.
   *
   *  This is deliberately scoped to colonies for now. Quantity would also be
   *  honest on individual animals — a keeper drops three crickets in for an
   *  adult female — and it's the only shape that could ever support decrementing
   *  a feeder colony's inventory as prey is used. That's a larger change
   *  touching every taxon's feeding form, so it isn't bundled here. */
  const openFeedingForm = () => {
    if (!colonyId) return;
    router.push({
      pathname: '/colony/add-feeding',
      // Taxon drives the prey vocabulary — greens for a dubia bin, crickets
      // for a balfouri communal.
      params: { id: colonyId, taxon: colony?.taxon ?? '' },
    });
  };

  /** Log a molt found in the colony.
   *
   *  Deliberately just a date and a note — no legspan or weight. For a communal
   *  those would invite a guess about an animal the keeper can't identify, and
   *  a guessed measurement is worse than a missing one. Everything worth saying
   *  ("one molt, confirmed female") is how keepers already write it.
   *
   *  NB: an earlier version used Alert.prompt, which is iOS-only and silently
   *  does nothing on Android. Inline form instead.
   */
  const submitMolt = async () => {
    if (!colonyId || moltBusy) return;
    setMoltBusy(true);
    try {
      await createColonyMolt(colonyId, {
        molted_at: new Date(moltDate + 'T12:00:00').toISOString(),
        notes: moltNote.trim() || null,
      });
      setMoltFormOpen(false);
      setMoltNote('');
      setMoltDate(toISODateLocal(new Date()));
      await fetchColony();
    } catch (e) {
      Alert.alert('Could not log molt', getErrorMessage(e));
    } finally {
      setMoltBusy(false);
    }
  };

  /** Log a substrate change for the whole colony.
   *
   *  Rehousing a group is a bigger and riskier operation than moving one
   *  animal, so the reason matters more here — "they needed more height" is
   *  the kind of note that explains a later problem.
   */
  const submitSubstrate = async () => {
    if (!colonyId || subBusy) return;
    setSubBusy(true);
    try {
      await createColonySubstrateChange(colonyId, {
        changed_at: subDate,
        substrate_type: subType.trim() || null,
        reason: subReason || null,
        notes: subNote.trim() || null,
      });
      setSubFormOpen(false);
      setSubReason('');
      setSubType('');
      setSubNote('');
      await fetchColony();
    } catch (e) {
      Alert.alert('Could not save', getErrorMessage(e));
    } finally {
      setSubBusy(false);
    }
  };

  /** Log a watering for the whole colony.
   *
   *  The date picker only gives a day, but the column is a timestamp — so the
   *  chosen day is combined with the current time of day rather than stamped
   *  with a fabricated midnight, and the list below shows the date alone. Same
   *  handling as the animal screens; the stored clock time is never presented
   *  as something the keeper told us.
   */
  const submitCareLog = async () => {
    if (!colonyId || careBusy) return;
    setCareBusy(true);
    try {
      const chosen = parseLocalDate(careDate) ?? new Date();
      const now = new Date();
      chosen.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
      await createColonyCareLog(colonyId, {
        log_type: careType,
        logged_at: (chosen > now ? now : chosen).toISOString(),
        notes: careNote.trim() || null,
      });
      setCareFormOpen(false);
      setCareNote('');
      await fetchColony();
    } catch (e) {
      Alert.alert('Could not save', getErrorMessage(e));
    } finally {
      setCareBusy(false);
    }
  };

  const confirmDeleteCareLog = (c: ColonyCareLog) => {
    Alert.alert('Delete this water log?', formatLocalDate(c.logged_at), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteColonyCareLog(c.id);
            await fetchColony();
          } catch (e) {
            Alert.alert('Could not delete', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const confirmDeleteSubstrate = (c: ColonySubstrateChange) => {
    Alert.alert('Delete this substrate change?', formatLocalDate(c.changed_at), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteColonySubstrateChange(c.id);
            await fetchColony();
          } catch (e) {
            Alert.alert('Could not delete', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const confirmDeleteMolt = (molt: ColonyMoltLog) => {
    Alert.alert('Delete this molt record?', formatLocalDate(molt.molted_at), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteColonyMolt(molt.id);
            await fetchColony();
          } catch (e) {
            Alert.alert('Could not delete', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  /** Row tap: Edit / Delete. */
  const rowActions = (title: string, detail: string, onEdit: () => void, onDelete: () => void) => {
    Alert.alert(title, detail, [
      { text: 'Edit', onPress: onEdit },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmDeleteFeeding = (f: ColonyFeedingLog) => {
    Alert.alert('Delete this feeding?', formatLocalDate(f.fed_at), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteColonyFeeding(f.id);
            await fetchColony();
          } catch (e) {
            Alert.alert('Could not delete', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const editFeeding = (f: ColonyFeedingLog) => {
    if (!colonyId) return;
    router.push({
      pathname: '/colony/add-feeding',
      params: {
        id: colonyId,
        taxon: colony?.taxon ?? '',
        feedingId: f.id,
        fedAt: f.fed_at,
        foodType: f.food_type ?? '',
        foodSize: f.food_size ?? '',
        qty: f.quantity != null ? String(f.quantity) : '',
        acc: f.accepted ? '1' : '0',
        note: f.notes ?? '',
      },
    });
  };

  const openEdit = (kind: 'molt' | 'substrate' | 'care' | 'event', row: any) => {
    setEError('');
    setEditTarget({ kind, id: row.id });
    setENote(row.notes ?? '');
    if (kind === 'molt') setEDate(toISODateLocal(new Date(row.molted_at)));
    if (kind === 'care') {
      setEDate(toISODateLocal(new Date(row.logged_at)));
      setEType(row.log_type);
    }
    if (kind === 'substrate') {
      setEDate(String(row.changed_at).slice(0, 10));
      setEReason(row.reason ?? '');
      setESubType(row.substrate_type ?? '');
    }
    if (kind === 'event') {
      setEDate(String(row.occurred_at).slice(0, 10));
      setEStage(row.stage ?? '');
      setEDelta(row.count_delta != null ? String(row.count_delta) : '');
      setESeverity(row.severity ?? '');
    }
  };

  const saveEdit = async () => {
    if (!editTarget || eBusy) return;
    setEBusy(true);
    setEError('');
    try {
      const note = eNote.trim() || null;
      if (editTarget.kind === 'molt') {
        const m = molts.find((x) => x.id === editTarget.id);
        if (!m) return;
        await updateColonyMolt(m.id, {
          molted_at: toISODateLocal(new Date(m.molted_at)) === eDate ? m.molted_at : new Date(eDate + 'T12:00:00').toISOString(),
          notes: note,
        });
      } else if (editTarget.kind === 'substrate') {
        await updateColonySubstrateChange(editTarget.id, {
          changed_at: eDate,
          substrate_type: eSubType.trim() || null,
          reason: eReason || null,
          notes: note,
        });
      } else if (editTarget.kind === 'care') {
        const c = careLogs.find((x) => x.id === editTarget.id);
        if (!c) return;
        await updateColonyCareLog(c.id, {
          log_type: eType,
          logged_at: toISODateLocal(new Date(c.logged_at)) === eDate ? c.logged_at : new Date(eDate + 'T12:00:00').toISOString(),
          notes: note,
        });
      } else {
        const ev = events.find((x) => x.id === editTarget.id);
        if (!ev) return;
        const payload: Record<string, unknown> = { occurred_at: eDate, notes: note };
        if (eventHasSeverity(ev.event_type)) payload.severity = eSeverity || null;
        if (ev.count_delta != null || eventNeedsDelta(ev.event_type)) {
          if (eDelta.trim() === '' && eventNeedsDelta(ev.event_type)) {
            setEError('Enter a count change (use − to remove).');
            return;
          }
          const parsed = eDelta.trim() === '' ? null : parseInt(eDelta, 10);
          if (parsed !== null && !Number.isFinite(parsed)) {
            setEError('That doesn’t look like a number.');
            return;
          }
          if (parsed !== null && parsed < 0 && ev.event_type !== 'count_correction' && POSITIVE_EVENTS.has(ev.event_type)) {
            setEError('That amount must be positive.');
            return;
          }
          payload.count_delta = parsed;
          payload.stage = eStage.trim() || null;
        }
        if (ev.event_type === 'observation' && !note) {
          setEError('An observation needs a note.');
          return;
        }
        await updateColonyEvent(ev.id, payload);
      }
      setEditTarget(null);
      await fetchColony();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setEError(typeof detail === 'string' ? detail : getErrorMessage(e));
    } finally {
      setEBusy(false);
    }
  };

  /** Photo options. Mirrors the invert detail screen: visible control, not a
   *  long-press-only gesture. */
  const handlePhotoOptions = (photo: ColonyPhoto) => {
    const isHero = colony?.photo_url === photo.url;
    Alert.alert('Photo options', photo.caption || 'Manage this photo', [
      { text: 'Cancel', style: 'cancel' },
      ...(!isHero
        ? [{
            text: 'Set as hero photo',
            onPress: async () => {
              try { await setColonyMainPhoto(photo.id); await fetchColony(); }
              catch (e) { Alert.alert('Error', getErrorMessage(e)); }
            },
          }]
        : []),
      {
        text: 'Delete photo',
        style: 'destructive' as const,
        onPress: () => {
          Alert.alert('Delete photo?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try { await deleteColonyPhoto(photo.id); await fetchColony(); }
                catch (e) { Alert.alert('Error', getErrorMessage(e)); }
              },
            },
          ]);
        },
      },
    ]);
  };

  const husbandryItems: InfoGridItem[] = [];
  // Enclosure leads the grid — for a communal, floor space per animal is the
  // variable that decides whether the group holds together, so it belongs
  // above substrate rather than buried after it.
  if (colony.enclosure_type) husbandryItems.push({ icon: 'shape-outline', label: 'Type', value: colony.enclosure_type });
  if (colony.enclosure_size) husbandryItems.push({ icon: 'cube-outline', label: 'Enclosure', value: colony.enclosure_size });
  if (colony.substrate_type) husbandryItems.push({ icon: 'layers', label: 'Substrate', value: colony.substrate_type });
  if (colony.substrate_depth) husbandryItems.push({ icon: 'ruler', label: 'Substrate depth', value: colony.substrate_depth });
  if (colony.target_temp_min || colony.target_temp_max)
    husbandryItems.push({
      icon: 'thermometer',
      label: 'Temperature',
      value: formatTempRange(colony.target_temp_min, colony.target_temp_max, units) ?? '—',
    });
  if (colony.target_humidity_min || colony.target_humidity_max)
    husbandryItems.push({
      icon: 'water-percent',
      label: 'Humidity',
      value: `${colony.target_humidity_min ?? '—'}–${colony.target_humidity_max ?? '—'}%`,
    });
  if (colony.location) husbandryItems.push({ icon: 'map-marker-outline', label: 'Location', value: colony.location });
  husbandryItems.push({ icon: 'cup-water', label: 'Water dish', value: colony.water_dish ? 'Yes' : 'No' });
  if (colony.last_substrate_change)
    husbandryItems.push({ icon: 'calendar-refresh', label: 'Substrate changed', value: formatLocalDate(colony.last_substrate_change, { month: 'short', day: 'numeric', year: 'numeric' }) });
  // One-line preview for the collapsed Husbandry row: "85–95°F · egg flats"
  // (in the keeper's units).
  const husbandryPreview = [
    colony.target_temp_min || colony.target_temp_max
      ? formatTempRange(colony.target_temp_min, colony.target_temp_max, units)
      : null,
    colony.substrate_type,
    colony.enclosure_size,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      <AppHeader
        title={colony.name}
        subtitle={`${meta?.label ?? 'Colony'} colony`}
        leftAction={backAction}
        rightAction={editAction}
      />
      {partialFailure.length > 0 && (
        <View
          style={[styles.partialFail, { borderColor: colors.error + '66', backgroundColor: colors.error + '14', borderRadius: layout.radius.md }]}
          accessibilityRole="alert"
        >
          <Text style={[styles.detailBody, { color: colors.textPrimary }]}>
            Couldn&apos;t load {partialFailure.length === 1 ? partialFailure[0] : `${partialFailure.slice(0, -1).join(', ')} and ${partialFailure[partialFailure.length - 1]}`}, so parts of this page may be missing or out of date.
          </Text>
          <TouchableOpacity onPress={onRefresh} accessibilityRole="button" style={styles.partialFailRetry}>
            <Text style={[styles.addEventLink, { color: colors.primary }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}
      {role && !isOwner && (
        <Text style={[styles.detailBody, { color: colors.textSecondary, paddingHorizontal: 16, paddingTop: 8 }]}>
          {ownerName ? `${ownerName}'s colony. ` : ''}You're a {ROLE_LABEL[role]} — {ROLE_HELP[role]}
        </Text>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={'padding'}>
        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.contentInner}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Identity — design handoff screen 8: nobody opens a colony to look
              at it, so the 200px hero became a thumbnail beside the species. */}
          <View style={[styles.identity, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
            {colony.photo_url ? (
              <Image source={{ uri: getImageUrl(colony.photo_url) }} style={[styles.identityThumb, { borderRadius: layout.radius.sm }]} accessibilityLabel={`Photo of ${colony.name}`} />
            ) : (
              <View style={[styles.identityThumb, styles.identityTile, { backgroundColor: colors.primary + '1F', borderRadius: layout.radius.sm }]}>
                <MaterialCommunityIcons name={taxonMdiIcon(colony.taxon) as any} size={24} color={colors.accent} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[TYPE.bodyStrong, { color: colony.species_missing ? colors.textSecondary : colors.textPrimary }, colony.species_missing && { fontStyle: 'italic' }]}
                numberOfLines={2}
              >
                {speciesLabel}
              </Text>
              {colony.species_id && !colony.species_missing ? (
                <TouchableOpacity
                  onPress={() => router.push(`/invert-species/${colony.species_id}` as any)}
                  accessibilityRole="link"
                  style={styles.identityLink}
                >
                  <Text style={[TYPE.label, { color: colors.accent }]}>Care sheet →</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {!colony.is_active && !isEnded && (
              <View style={[styles.archivedPill, styles.archivedInline, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={styles.archivedText}>Archived</Text>
              </View>
            )}
          </View>

          {/* Status card for an ended colony. A neutral dot, the same quiet
              full stop the died-animal card uses: never colors.error (nothing
              was destroyed), no checkmark, no success colour. */}
          {isEnded && colony.ended_at ? (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md, gap: SPACING.sm },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <View
                  style={{ width: SPACING.sm + 1, height: SPACING.sm + 1, borderRadius: layout.radius.sm, backgroundColor: colors.textTertiary }}
                />
                <Text style={[TYPE.subheading, { color: colors.textPrimary, flex: 1 }]}>
                  {[
                    `Ended ${formatLocalDate(colony.ended_at, { month: 'short', day: 'numeric', year: 'numeric' })}`,
                    colonyEndReasonLabel(colony.end_reason),
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>
                This is a historical record. Everything below is kept. The colony is out of your collection and your animal count.
              </Text>
              {colony.end_notes ? (
                <Text style={[TYPE.body, { color: colors.textTertiary, fontStyle: 'italic' }]}>{colony.end_notes}</Text>
              ) : null}
              <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
                Logging is closed. Records stay readable and exportable.
              </Text>
              {canKeepRole ? (
                <TouchableOpacity onPress={handleReopen} disabled={reopening} accessibilityRole="button">
                  <Text style={[TYPE.bodyStrong, { color: colors.textSecondary }]}>
                    {reopening ? 'Saving…' : 'Reopen colony'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Handed off as a whole colony. Same neutral full stop as the ended
              card: nothing was destroyed. */}
          {isTransferred && colony.transferred_out_at ? (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md, gap: SPACING.sm },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <View
                  style={{ width: SPACING.sm + 1, height: SPACING.sm + 1, borderRadius: layout.radius.sm, backgroundColor: colors.textTertiary }}
                />
                <Text style={[TYPE.subheading, { color: colors.textPrimary, flex: 1 }]}>
                  {`Transferred ${formatLocalDate(colony.transferred_out_at, { month: 'short', day: 'numeric', year: 'numeric' })}`}
                </Text>
              </View>
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>
                This colony went to a new keeper through a claim link. This is a historical record: everything below is kept, and the colony is out of your collection and your animal count.
              </Text>
            </View>
          ) : null}

          {/* Population card — count, 30-day trend, weekly bars, stage split. */}
          <ColonyPopulationCard
            stageCounts={colony.stage_counts}
            estimated={colony.count_is_estimated}
            history={history}
            taxon={colony.taxon}
          />

          {/* Quick log — the four things keepers log day to day. Each asks
              only stage + count; everything else is behind "More options". */}
          {canLog && (
            <View style={styles.quickRow}>
              {([
                { kind: 'birth', label: 'Births', icon: 'egg-outline', color: colors.success },
                { kind: 'death', label: 'Deaths', icon: 'minus-circle-outline', color: colors.error },
                { kind: 'removed', label: 'Removed', icon: 'export', color: colors.warning },
                { kind: 'recount', label: 'Recount', icon: 'counter', color: colors.accent },
              ] as const).map((b) => (
                <TouchableOpacity
                  key={b.kind}
                  onPress={() => setQuick(b.kind)}
                  style={[styles.quickTile, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}
                  accessibilityRole="button"
                  accessibilityLabel={b.kind === 'recount' ? 'Recount a stage' : `Log ${b.label.toLowerCase()}`}
                >
                  <MaterialCommunityIcons name={b.icon} size={22} color={b.color} />
                  <Text style={[TYPE.label, { color: colors.textPrimary }]}>{b.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Recent activity (moved up — design handoff screen 8) */}
          <View style={styles.eventsHeaderRow}>
            <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>RECENT ACTIVITY</Text>
            {canLog && <TouchableOpacity onPress={formOpen ? closeForm : () => openForm()} accessibilityRole="button" accessibilityLabel={formOpen ? 'Cancel adding an event' : 'Log another kind of event'}>
              <Text style={[styles.addEventLink, { color: colors.primary }]}>{formOpen ? 'Cancel' : '+ Other event'}</Text>
            </TouchableOpacity>}
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
                      <MaterialCommunityIcons name={COLONY_EVENT_MDI[t] as any} size={14} color={selected ? '#fff' : colors.textSecondary} />
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

          <ColonyActivity
            events={events}
            canChange={mayChange}
            onDelete={(ev) => setConfirmDeleteEventId(ev.id)}
            onEdit={(ev) =>
              rowActions(
                COLONY_EVENT_LABELS[ev.event_type] ?? 'Event',
                formatLocalDate(ev.occurred_at),
                () => openEdit('event', ev),
                () => setConfirmDeleteEventId(ev.id),
              )
            }
          />


          {/* Husbandry */}
          {husbandryItems.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
              <TouchableOpacity
                onPress={() => setHusbandryOpen((o) => !o)}
                style={styles.collapseHead}
                accessibilityRole="button"
                accessibilityState={{ expanded: husbandryOpen }}
              >
                <MaterialCommunityIcons name="home-thermometer-outline" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>Husbandry</Text>
                  {!husbandryOpen && husbandryPreview ? (
                    <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>{husbandryPreview}</Text>
                  ) : null}
                </View>
                <MaterialCommunityIcons name={husbandryOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              {husbandryOpen ? <View style={{ marginTop: 12 }}><InfoGrid items={husbandryItems} /></View> : null}
            </View>
          )}


          {/* Feeding. A communal is fed as a unit, so this is a group log —
              one row per feeding event, not one per animal. ADR-010 deferred
              this on the grounds colony taxa are casual-feed detritivores,
              which is true of isopods but not of a balfouri communal. */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>FEEDING</Text>
              {canLog && <TouchableOpacity
                onPress={openFeedingForm}
                accessibilityRole="button"
                accessibilityLabel="Log a feeding for this colony"
              >
                <Text style={[styles.addEventLink, { color: colors.primary }]}>+ Log feeding</Text>
              </TouchableOpacity>}
            </View>
            {feedings.length === 0 ? (
              <Text style={[styles.detailBody, { color: colors.textTertiary }]}>
                No feedings logged yet.
              </Text>
            ) : (
              (showAllFeed ? feedings : feedings.slice(0, 8)).map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={styles.feedRow}
                  disabled={!mayChange(f)}
                  onPress={() =>
                    rowActions('Feeding', formatLocalDate(f.fed_at), () => editFeeding(f), () => confirmDeleteFeeding(f))
                  }
                  onLongPress={() => confirmDeleteFeeding(f)}
                  accessibilityRole="button"
                  accessibilityLabel={`Feeding ${formatLocalDate(f.fed_at)}. Tap to edit or delete.`}
                >
                  <MaterialCommunityIcons
                    name={f.accepted ? 'silverware-fork-knife' : 'close-circle-outline'}
                    size={16}
                    color={f.accepted ? colors.textSecondary : colors.error}
                  />
                  <Text style={[styles.detailBody, { flex: 1 }]}>
                    {/* Lead with the count — for a group it's the number that
                        carries meaning. Omitted entirely when unrecorded rather
                        than shown as "1", which would invent a fact. */}
                    {[
                      f.quantity != null ? `${f.quantity}×` : null,
                      f.food_size,
                      f.food_type,
                    ]
                      .filter(Boolean)
                      .join(' ') || 'Fed'}
                    {f.accepted ? '' : ' — refused'}
                  </Text>
                  {attribution(f) ? (
                    <Text style={[styles.detailBody, { color: colors.textTertiary }]}>{attribution(f)}</Text>
                  ) : null}
                  {/* Relative AND absolute, same as the animal timeline. */}
                  <Text style={[styles.detailBody, { color: colors.textTertiary }]}>
                    {new Date(f.fed_at).toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              ))
            )}
            {feedings.length > 8 && (
              <TouchableOpacity
                onPress={() => setShowAllFeed((v) => !v)}
                accessibilityRole="button"
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={[styles.addEventLink, { color: colors.primary }]}>
                  {showAllFeed ? 'Show fewer' : `See all ${feedings.length}`}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Water (cwc_20260910).
              ABOVE substrate deliberately. For a detritivore culture —
              isopods, springtails — hydration is the husbandry: they're
              misted or overflowed constantly and fed almost incidentally, so
              this is closer to what a feeding log is for a tarantula than to a
              maintenance note. No due date and no overdue state here or
              anywhere; there's no evidence base for a watering cadence. */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>WATER</Text>
              {canLog && <TouchableOpacity
                onPress={() => setCareFormOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityLabel="Log a watering for this colony"
              >
                <Text style={[styles.addEventLink, { color: colors.primary }]}>
                  {careFormOpen ? 'Cancel' : '+ Log water'}
                </Text>
              </TouchableOpacity>}
            </View>

            {careFormOpen && (
              <View style={{ marginBottom: 12, gap: 10 }}>
                <Text style={styles.fieldLabel}>WHAT DID YOU DO?</Text>
                <View style={styles.chipWrap}>
                  {(Object.keys(CARE_LOG_LABELS) as CareLogType[]).map((k) => {
                    const sel = k === careType;
                    return (
                      <TouchableOpacity
                        key={k}
                        onPress={() => setCareType(k)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sel }}
                        style={[
                          styles.eventChip,
                          {
                            borderColor: sel ? colors.primary : colors.border,
                            backgroundColor: sel ? colors.primary : colors.surface,
                          },
                        ]}
                      >
                        <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                          {CARE_LOG_LABELS[k]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <DateInput
                  value={parseLocalDate(careDate) ?? new Date()}
                  onChange={(d) => setCareDate(toISODateLocal(d))}
                  maximumDate={new Date()}
                  label="Date watered"
                />
                <TextInput
                  style={styles.textarea}
                  value={careNote}
                  onChangeText={setCareNote}
                  multiline
                  placeholder="Notes — optional"
                  placeholderTextColor={colors.textTertiary}
                />
                <PrimaryButton
                  onPress={submitCareLog}
                  disabled={careBusy}
                  accessibilityLabel="Save water log"
                >
                  {careBusy ? 'Saving…' : 'Save water log'}
                </PrimaryButton>
              </View>
            )}

            {careLogs.length === 0 ? (
              <Text style={[styles.detailBody, { color: colors.textTertiary }]}>
                No watering logged yet.
              </Text>
            ) : (
              careLogs.slice(0, 10).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  disabled={!mayChange(c)}
                  onPress={() =>
                    rowActions(CARE_LOG_LABELS[c.log_type], formatLocalDate(c.logged_at), () => openEdit('care', c), () => confirmDeleteCareLog(c))
                  }
                  onLongPress={() => confirmDeleteCareLog(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`${CARE_LOG_LABELS[c.log_type]} on ${formatLocalDate(c.logged_at)}. Tap to edit or delete.`}
                  style={{ paddingVertical: 8 }}
                >
                  <Text style={[styles.detailBody, { color: colors.textPrimary }]}>
                    {CARE_LOG_LABELS[c.log_type]}
                  </Text>
                  {/* Date only — the stored time of day is ours, not theirs. */}
                  <Text style={[styles.detailBody, { color: colors.textTertiary }]}>
                    {[formatLocalDate(c.logged_at), c.notes].filter(Boolean).join(' · ')}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Substrate (csc_20260731).
              Applies to every colony taxon — a dubia bin gets cleaned out and
              for detritivores the substrate IS the food — but the reasons
              differ, so the chips are taxon-aware. Rehousing a whole group is
              a bigger operation than moving one animal, which is why the
              reason and note carry real weight here. */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>SUBSTRATE</Text>
              {canLog && <TouchableOpacity
                onPress={() => setSubFormOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityLabel="Log a substrate change for this colony"
              >
                <Text style={[styles.addEventLink, { color: colors.primary }]}>
                  {subFormOpen ? 'Cancel' : '+ Log change'}
                </Text>
              </TouchableOpacity>}
            </View>

            {subFormOpen && (
              <View style={{ marginBottom: 12, gap: 10 }}>
                <DateInput
                  value={parseLocalDate(subDate) ?? new Date()}
                  onChange={(d) => setSubDate(toISODateLocal(d))}
                  maximumDate={new Date()}
                  label="Date changed"
                />
                <Text style={styles.fieldLabel}>REASON</Text>
                <View style={styles.chipWrap}>
                  {substrateReasonsFor(colony.taxon).map((r) => {
                    const sel = r === subReason;
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setSubReason(sel ? '' : r)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sel }}
                        style={[
                          styles.eventChip,
                          {
                            borderColor: sel ? colors.primary : colors.border,
                            backgroundColor: sel ? colors.primary : colors.surface,
                          },
                        ]}
                      >
                        <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                          {r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={styles.input}
                  value={subType}
                  onChangeText={setSubType}
                  placeholder="Substrate type (optional)"
                  placeholderTextColor={colors.textTertiary}
                />
                <TextInput
                  style={styles.textarea}
                  value={subNote}
                  onChangeText={setSubNote}
                  multiline
                  placeholder="Notes — e.g. moved back to the taller enclosure"
                  placeholderTextColor={colors.textTertiary}
                />
                <PrimaryButton
                  onPress={submitSubstrate}
                  disabled={subBusy}
                  style={[styles.saveBtn, { borderRadius: layout.radius.sm }]}
                  outerStyle={{ borderRadius: layout.radius.sm }}
                >
                  <Text style={styles.onPrimaryText}>{subBusy ? 'Saving…' : 'Save change'}</Text>
                </PrimaryButton>
              </View>
            )}

            {substrates.length === 0 ? (
              <Text style={[styles.detailBody, { color: colors.textTertiary }]}>
                No substrate changes logged yet.
              </Text>
            ) : (
              substrates.slice(0, 10).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.feedRow}
                  disabled={!mayChange(c)}
                  onPress={() =>
                    rowActions('Substrate change', formatLocalDate(c.changed_at), () => openEdit('substrate', c), () => confirmDeleteSubstrate(c))
                  }
                  onLongPress={() => confirmDeleteSubstrate(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Substrate change ${formatLocalDate(c.changed_at)}. Tap to edit or delete.`}
                >
                  <MaterialCommunityIcons name="shovel" size={16} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailBody}>
                      {[c.reason, c.substrate_type].filter(Boolean).join(' · ') || 'Substrate changed'}
                    </Text>
                    {c.notes ? (
                      <Text style={[styles.detailBody, { color: colors.textTertiary, fontSize: 12 }]}>
                        {c.notes}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.detailBody, { color: colors.textTertiary }]}>
                    {formatLocalDate(c.changed_at)}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Molts (cml_20260730).
              For a communal a shed skin is often the ONLY observation that
              surfaces on its own — the animals are hidden and can't be handled
              without dismantling the enclosure — and it's how sexing happens:
              you sex the molt, not the spider. So this matters more here than
              on a solitary animal, not less. */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>MOLTS</Text>
              {canLog && <TouchableOpacity
                onPress={() => setMoltFormOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityLabel="Record a molt found in this colony"
              >
                <Text style={[styles.addEventLink, { color: colors.primary }]}>
                  {moltFormOpen ? 'Cancel' : '+ Found a molt'}
                </Text>
              </TouchableOpacity>}
            </View>

            {moltFormOpen && (
              <View style={{ marginBottom: 12, gap: 10 }}>
                <DateInput
                  value={parseLocalDate(moltDate) ?? new Date()}
                  onChange={(d) => setMoltDate(toISODateLocal(d))}
                  maximumDate={new Date()}
                  label="Date found"
                />
                <TextInput
                  style={styles.textarea}
                  value={moltNote}
                  onChangeText={setMoltNote}
                  multiline
                  placeholder="e.g. one molt, confirmed female"
                  placeholderTextColor={colors.textTertiary}
                />
                {/* No legspan or weight fields: you can't measure an animal you
                    can't identify, and a guessed number is worse than none. */}
                <Text style={[styles.detailBody, { color: colors.textTertiary, fontSize: 12 }]}>
                  Colony molts aren&apos;t tied to one animal — nobody can tell which
                  of the group shed it.
                </Text>
                <PrimaryButton
                  onPress={submitMolt}
                  disabled={moltBusy}
                  style={[styles.saveBtn, { borderRadius: layout.radius.sm }]}
                  outerStyle={{ borderRadius: layout.radius.sm }}
                >
                  <Text style={styles.onPrimaryText}>
                    {moltBusy ? 'Saving…' : 'Save molt'}
                  </Text>
                </PrimaryButton>
              </View>
            )}

            {molts.length === 0 ? (
              <Text style={[styles.detailBody, { color: colors.textTertiary }]}>
                No molts recorded yet.
              </Text>
            ) : (
              molts.slice(0, 10).map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.feedRow}
                  disabled={!mayChange(m)}
                  onLongPress={() => confirmDeleteMolt(m)}
                  onPress={() =>
                    rowActions('Molt record', formatLocalDate(m.molted_at), () => openEdit('molt', m), () => confirmDeleteMolt(m))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Molt found ${formatLocalDate(m.molted_at)}. Tap to edit or delete.`}
                >
                  <MaterialCommunityIcons name="feather" size={16} color={colors.textSecondary} />
                  <Text style={[styles.detailBody, { flex: 1 }]}>
                    {m.notes || 'Molt found'}
                  </Text>
                  <Text style={[styles.detailBody, { color: colors.textTertiary }]}>
                    {formatLocalDate(m.molted_at)}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Photos. A communal is a display animal housed as a group — it gets
              a gallery like anything else in the collection. The card in the
              collection grid has always had a photo slot; until now there was
              no way to fill it. */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>PHOTOS</Text>
              {canLog && <TouchableOpacity
                onPress={() => router.push(`/colony/add-photo?id=${colonyId}` as any)}
                accessibilityRole="button"
                accessibilityLabel="Add a photo to this colony"
              >
                <Text style={[styles.addEventLink, { color: colors.primary }]}>+ Add photo</Text>
              </TouchableOpacity>}
            </View>
            {photos.length === 0 ? (
              <Text style={[styles.detailBody, { color: colors.textTertiary }]}>
                No photos yet.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {photos.map((ph) => {
                  const isHero = colony.photo_url === ph.url;
                  return (
                    <View key={ph.id} style={{ marginRight: 8 }}>
                      <Image
                        source={{ uri: getImageUrl(ph.thumbnail_url ?? ph.url) }}
                        style={styles.colonyPhotoThumb}
                        accessibilityLabel={ph.caption || 'Colony photo'}
                      />
                      {isHero && (
                        <View style={styles.colonyHeroTag}>
                          <MaterialCommunityIcons name="star" size={11} color="#fff" />
                        </View>
                      )}
                      {/* Visible control, not a long-press. */}
                      {canKeep && <TouchableOpacity
                        style={styles.colonyPhotoManage}
                        onPress={() => handlePhotoOptions(ph)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Photo options"
                        accessibilityHint="Set as hero photo or delete"
                      >
                        <MaterialCommunityIcons name="dots-horizontal" size={16} color="#fff" />
                      </TouchableOpacity>}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Notes */}
          {colony.notes ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
              <Text style={styles.sectionHeading}>NOTES</Text>
              <Text style={styles.detailBody}>{colony.notes}</Text>
            </View>
          ) : null}

          {/* Transfer or sell — owner only, running colonies only (the API
              refuses ended, archived and already-transferred ones too). */}
          {isOwner && !isEnded && !isTransferred && colony.is_active && <TouchableOpacity
            onPress={() => setTransferOpen(true)}
            style={[styles.ghostBtn, { alignItems: 'center', marginBottom: SPACING.md, borderRadius: layout.radius.md }]}
            accessibilityRole="button"
          >
            <Text style={styles.ghostBtnText}>Transfer or sell</Text>
          </TouchableOpacity>}

          {/* End colony. Neutral, above delete: a colony that crashed or was
              sold shouldn't have to be deleted to leave the collection. */}
          {canKeep && <TouchableOpacity
            onPress={() => setEndOpen(true)}
            style={[styles.ghostBtn, { alignItems: 'center', marginBottom: SPACING.md, borderRadius: layout.radius.md }]}
            accessibilityRole="button"
          >
            <Text style={styles.ghostBtnText}>End colony</Text>
          </TouchableOpacity>}

          {/* Delete colony */}
          {isOwner && <TouchableOpacity
            onPress={() => setConfirmDelete(true)}
            style={[styles.deleteBtn, { borderColor: colors.error, borderRadius: layout.radius.md }]}
          >
            <Text style={[styles.deleteText, { color: colors.error }]}>Delete colony</Text>
          </TouchableOpacity>}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <ColonyQuickLogSheet
        kind={quick}
        colonyId={colony.id}
        taxon={colony.taxon}
        stageCounts={colony.stage_counts}
        onClose={() => setQuick(null)}
        onSaved={fetchColony}
        onMore={(type) => openForm(type)}
      />

      <ColonyTransferSheet
        visible={transferOpen}
        onClose={() => setTransferOpen(false)}
        colonyId={colony.id}
        name={colony.name}
        stageCounts={colony.stage_counts}
        estimated={colony.count_is_estimated}
        shareLabel={colony.species_scientific_name || colony.species_display_name || colony.name}
      />

      <EndColonySheet
        visible={endOpen}
        onClose={() => setEndOpen(false)}
        colonyId={colony.id}
        name={colony.name}
        onDone={() => { setEndOpen(false); fetchColony(); }}
      />

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

      {/* Edit modal: molt / substrate / water / event rows */}
      <Modal visible={editTarget !== null} transparent animationType="fade" onRequestClose={() => !eBusy && setEditTarget(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={{ width: '100%', maxWidth: 420, flexGrow: 0 }}
            contentContainerStyle={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg, gap: 10 }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>
              {editTarget?.kind === 'molt' ? 'Edit molt'
                : editTarget?.kind === 'substrate' ? 'Edit substrate change'
                : editTarget?.kind === 'care' ? 'Edit water log'
                : 'Edit event'}
            </Text>
            {eError !== '' && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{eError}</Text>
              </View>
            )}
            {editTarget?.kind === 'care' && (
              <View style={styles.chipWrap}>
                {(Object.keys(CARE_LOG_LABELS) as CareLogType[]).map((k) => {
                  const sel = k === eType;
                  return (
                    <TouchableOpacity
                      key={k}
                      onPress={() => setEType(k)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      style={[styles.eventChip, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }]}
                    >
                      <Text style={[TYPE.label, { color: sel ? '#fff' : colors.textPrimary }]}>{CARE_LOG_LABELS[k]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <Text style={styles.fieldLabel}>Date</Text>
            <DateInput
              value={parseLocalDate(eDate) ?? new Date()}
              onChange={(d) => setEDate(toISODateLocal(d))}
              maximumDate={editTarget?.kind === 'event' ? undefined : new Date()}
              label="Date"
            />
            {editTarget?.kind === 'substrate' && (
              <>
                <Text style={styles.fieldLabel}>Substrate type</Text>
                <TextInput
                  value={eSubType}
                  onChangeText={setESubType}
                  placeholder="Optional"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, { borderRadius: layout.radius.sm }]}
                />
                <Text style={styles.fieldLabel}>Reason</Text>
                <View style={styles.chipWrap}>
                  {substrateReasonsFor(colony.taxon).map((r) => {
                    const sel = r === eReason;
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setEReason(sel ? '' : r)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sel }}
                        style={[styles.eventChip, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }]}
                      >
                        <Text style={[TYPE.label, { color: sel ? '#fff' : colors.textPrimary }]}>{r}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            {editTarget?.kind === 'event' && (() => {
              const ev = events.find((x) => x.id === editTarget.id);
              if (!ev) return null;
              return (
                <>
                  {(ev.count_delta != null || eventNeedsDelta(ev.event_type)) && (
                    <>
                      <Text style={styles.fieldLabel}>Count change (use − to remove)</Text>
                      <TextInput
                        value={eDelta}
                        onChangeText={(v) => { if (v === '' || /^-?\d*$/.test(v)) setEDelta(v); }}
                        keyboardType="numbers-and-punctuation"
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.input, { borderRadius: layout.radius.sm }]}
                      />
                      <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
                        Changing this moves the population by the difference.
                      </Text>
                      <Text style={styles.fieldLabel}>Stage (blank = mixed)</Text>
                      <TextInput
                        value={eStage}
                        onChangeText={setEStage}
                        autoCapitalize="none"
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.input, { borderRadius: layout.radius.sm }]}
                      />
                    </>
                  )}
                  {eventHasSeverity(ev.event_type) && (
                    <View style={styles.chipWrap}>
                      {SEVERITY_OPTIONS.map((o) => {
                        const sel = o.value === eSeverity;
                        return (
                          <TouchableOpacity
                            key={o.value}
                            onPress={() => setESeverity(sel ? '' : o.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: sel }}
                            style={[styles.eventChip, { borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }]}
                          >
                            <Text style={[TYPE.label, { color: sel ? '#fff' : colors.textPrimary }]}>{o.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </>
              );
            })()}
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textarea, { borderRadius: layout.radius.sm }]}
              value={eNote}
              onChangeText={setENote}
              multiline
              placeholder="Optional"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditTarget(null)} disabled={eBusy} style={[styles.ghostBtn, { borderRadius: layout.radius.sm }]}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <PrimaryButton
                onPress={saveEdit}
                disabled={eBusy}
                style={styles.saveBtn}
                outerStyle={{ borderRadius: layout.radius.sm }}
                accessibilityLabel="Save changes"
              >
                <Text style={styles.onPrimaryText}>{eBusy ? 'Saving…' : 'Save changes'}</Text>
              </PrimaryButton>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Delete event modal */}
      <Modal visible={confirmDeleteEventId !== null} transparent animationType="fade" onRequestClose={() => !deleting && setConfirmDeleteEventId(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }]}>
            <Text style={styles.modalTitle}>Delete this event?</Text>
            <Text style={styles.modalBody}>Its count change will be taken back out of the population.</Text>
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

      {/* Enclosure label + phone photo upload. resource="colonies" points the
          label at /col/{id} and the upload session at the colony route. */}
      <QRSheet
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        tarantulaId={colony.id}
        resource="colonies"
        tarantulaName={colony.name}
        scientificName={colony.species_scientific_name}
        onPhotoAdded={fetchColony}
      />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    identity: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
    identityThumb: { width: 52, height: 52 },
    identityTile: { alignItems: 'center', justifyContent: 'center' },
    identityLink: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
    archivedInline: { position: 'relative', top: 0, right: 0 },
    quickRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 16 },
    quickTile: { flex: 1, alignItems: 'center', gap: 4, borderWidth: 1, paddingVertical: 11, minHeight: 64, justifyContent: 'center' },
    collapseHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    content: { flex: 1 },
    partialFail: { marginHorizontal: 16, marginTop: 12, padding: 12, borderWidth: 1, gap: 4 },
    partialFailRetry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
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
    feedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    colonyPhotoThumb: { width: 96, height: 96, borderRadius: 8, backgroundColor: colors.surfaceElevated },
    colonyHeroTag: {
      position: 'absolute', top: 6, left: 6,
      backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: 3,
    },
    colonyPhotoManage: {
      position: 'absolute', bottom: 4, right: 4,
      width: 24, height: 24, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.65)',
    },
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
    historyBlock: { marginTop: 16, paddingTop: 14, borderTopWidth: 1 },
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
