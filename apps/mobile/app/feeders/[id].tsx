import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

type InventoryMode = 'count' | 'life_stage';
type LogType =
  | 'fed_feeders'
  | 'cleaning'
  | 'water_change'
  | 'restock'
  | 'count_update'
  | 'note';

interface FeederColony {
  id: string;
  user_id: string;
  feeder_species_id: string | null;
  enclosure_id: string | null;
  name: string;
  inventory_mode: InventoryMode;
  count: number | null;
  life_stage_counts: Record<string, number> | null;
  last_restocked: string | null;
  last_cleaned: string | null;
  last_fed_date: string | null;
  food_notes: string | null;
  notes: string | null;
  low_threshold: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  total_count: number | null;
  is_low_stock: boolean;
  species_display_name: string | null;
  species_missing: boolean;
}

interface FeederCareLog {
  id: string;
  feeder_colony_id: string;
  user_id: string;
  log_type: LogType;
  logged_at: string; // YYYY-MM-DD
  count_delta: number | null;
  notes: string | null;
  created_at: string;
}

interface QuickAction {
  type: LogType;
  label: string;
  icon: string;
  needsCountInput: boolean;
  allowNegative: boolean;
  description: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    type: 'fed_feeders',
    label: 'Fed',
    icon: '🥬',
    needsCountInput: false,
    allowNegative: false,
    description: 'You fed the colony (gut-load, veg, etc.)',
  },
  {
    type: 'cleaning',
    label: 'Cleaned',
    icon: '🧽',
    needsCountInput: false,
    allowNegative: false,
    description: 'Cleaned the bin',
  },
  {
    type: 'water_change',
    label: 'Water',
    icon: '💧',
    needsCountInput: false,
    allowNegative: false,
    description: 'Refreshed water / hydration source',
  },
  {
    type: 'restock',
    label: 'Restock',
    icon: '📦',
    needsCountInput: true,
    allowNegative: false,
    description: 'Added feeders to the colony',
  },
  {
    type: 'count_update',
    label: 'Adjust',
    icon: '✏️',
    needsCountInput: true,
    allowNegative: true,
    description: 'Manual inventory correction (+/-)',
  },
  {
    type: 'note',
    label: 'Note',
    icon: '📝',
    needsCountInput: false,
    allowNegative: false,
    description: 'Free-form observation (no count change)',
  },
];

function categoryEmoji(name: string | null): string {
  if (!name) return '🦗';
  const n = name.toLowerCase();
  if (n.includes('cricket')) return '🦗';
  if (n.includes('roach') || n.includes('dubia') || n.includes('hisser')) return '🪳';
  if (n.includes('meal') || n.includes('super') || n.includes('worm') || n.includes('larva')) return '🐛';
  return '🦗';
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function formatDaysLabel(days: number | null, zeroLabel: string, neverLabel: string): string {
  if (days == null) return neverLabel;
  if (days === 0) return zeroLabel;
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function formatLogType(t: LogType): string {
  switch (t) {
    case 'fed_feeders':
      return 'Fed feeders';
    case 'cleaning':
      return 'Cleaned';
    case 'water_change':
      return 'Water change';
    case 'restock':
      return 'Restocked';
    case 'count_update':
      return 'Count update';
    case 'note':
      return 'Note';
  }
}

function formatLogDate(iso: string): string {
  const parts = iso.split('-').map((p) => Number.parseInt(p, 10));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const [y, m, d] = parts;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return iso;
}

export default function FeederColonyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const colonyId = params.id;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [colony, setColony] = useState<FeederColony | null>(null);
  const [logs, setLogs] = useState<FeederCareLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Quick-log panel state
  const [activeAction, setActiveAction] = useState<LogType | null>(null);
  const [panelDelta, setPanelDelta] = useState('');
  const [panelNotes, setPanelNotes] = useState('');
  const [panelSubmitting, setPanelSubmitting] = useState(false);
  const [panelError, setPanelError] = useState('');

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchColony = useCallback(async () => {
    if (!colonyId) return;
    try {
      const [colonyRes, logsRes] = await Promise.all([
        apiClient.get<FeederColony>(`/feeder-colonies/${colonyId}`),
        apiClient.get<FeederCareLog[]>(`/feeder-colonies/${colonyId}/care-logs`),
      ]);
      setColony(colonyRes.data);
      setLogs(logsRes.data);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      const msg =
        e?.response?.status === 404
          ? 'Colony not found'
          : e?.response?.data?.detail || e?.message || 'Failed to load colony';
      setLoadError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [colonyId]);

  // Refetch on focus (so edits/new logs appear when returning from other screens)
  useFocusEffect(
    useCallback(() => {
      fetchColony();
    }, [fetchColony])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchColony();
  };

  const openAction = (type: LogType) => {
    setActiveAction((prev) => (prev === type ? null : type));
    setPanelDelta('');
    setPanelNotes('');
    setPanelError('');
  };

  const closePanel = () => {
    setActiveAction(null);
    setPanelDelta('');
    setPanelNotes('');
    setPanelError('');
  };

  const submitLog = async () => {
    if (!colony || !activeAction) return;
    const action = QUICK_ACTIONS.find((a) => a.type === activeAction);
    if (!action) return;

    let deltaNum: number | null = null;
    if (action.needsCountInput) {
      if (panelDelta.trim() === '') {
        setPanelError('Enter a number.');
        return;
      }
      const parsed = Number.parseInt(panelDelta, 10);
      if (!Number.isFinite(parsed)) {
        setPanelError("That doesn't look like a number.");
        return;
      }
      if (!action.allowNegative && parsed < 0) {
        setPanelError('Restock amounts must be positive — use Adjust to remove.');
        return;
      }
      deltaNum = parsed;
    }

    if (action.type === 'note' && !panelNotes.trim()) {
      setPanelError('Add a note to save.');
      return;
    }

    const payload: Record<string, unknown> = { log_type: activeAction };
    if (deltaNum !== null) payload.count_delta = deltaNum;
    if (panelNotes.trim()) payload.notes = panelNotes.trim();

    setPanelSubmitting(true);
    setPanelError('');
    try {
      await apiClient.post(`/feeder-colonies/${colony.id}/care-logs`, payload);
      closePanel();
      await fetchColony();
    } catch (e: any) {
      setPanelError(e?.response?.data?.detail || e?.message || 'Failed to log care event');
    } finally {
      setPanelSubmitting(false);
    }
  };

  const requestDeleteLog = (logId: string) => {
    setConfirmDeleteLogId(logId);
  };

  const confirmDeleteLog = async () => {
    if (!confirmDeleteLogId) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/feeder-colonies/care-logs/${confirmDeleteLogId}`);
      setConfirmDeleteLogId(null);
      await fetchColony();
    } catch (e: any) {
      setPanelError(e?.response?.data?.detail || e?.message || 'Failed to delete log');
      setConfirmDeleteLogId(null);
    } finally {
      setDeleting(false);
    }
  };

  const deleteColony = async () => {
    if (!colony) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/feeder-colonies/${colony.id}`);
      setConfirmDelete(false);
      router.replace('/feeders');
    } catch (e: any) {
      setLoadError(e?.response?.data?.detail || e?.message || 'Failed to delete colony');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const totalCountLabel = useMemo(() => {
    if (!colony) return '—';
    if (colony.total_count == null) return '—';
    return colony.total_count.toLocaleString();
  }, [colony]);

  // ── Render ──────────────────────────────────────────────────────────────
  const backAction = (
    <TouchableOpacity
      onPress={() => router.back()}
      accessibilityLabel="Back"
      style={{ paddingRight: 4 }}
    >
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const editAction = colony ? (
    <TouchableOpacity
      onPress={() => router.push(`/feeders/${colony.id}/edit` as any)}
      accessibilityLabel="Edit colony"
      style={{ paddingHorizontal: 4 }}
    >
      <MaterialCommunityIcons name="pencil-outline" size={24} color={iconColor} />
    </TouchableOpacity>
  ) : null;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Colony" leftAction={backAction} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError || !colony) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Colony" leftAction={backAction} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🦗</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {loadError || 'Colony not found'}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            It may have been deleted, or you may not have access to it.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.replace('/feeders')}
              style={[
                styles.ghostBtn,
                { borderColor: colors.border, borderRadius: layout.radius.md },
              ]}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                Back to Feeders
              </Text>
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
                <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
              </PrimaryButton>
            )}
          </View>
        </View>
      </View>
    );
  }

  const fedDays = daysSince(colony.last_fed_date);
  const cleanedDays = daysSince(colony.last_cleaned);
  const restockedDays = daysSince(colony.last_restocked);
  const speciesLabel = colony.species_missing
    ? 'Species removed'
    : colony.species_display_name || 'No species set';
  const lifeStageEntries =
    colony.inventory_mode === 'life_stage' && colony.life_stage_counts
      ? Object.entries(colony.life_stage_counts)
      : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title={colony.name}
        subtitle={speciesLabel}
        leftAction={backAction}
        rightAction={editAction}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Archived / low-stock banners */}
        {!colony.is_active && (
          <View
            style={[
              styles.archivedPill,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.archivedText, { color: colors.textSecondary }]}>
              Archived
            </Text>
          </View>
        )}

        {colony.is_low_stock && (
          <View
            style={[
              styles.lowBanner,
              {
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                borderColor: colors.warning ?? '#f59e0b',
                borderRadius: layout.radius.md,
              },
            ]}
            accessibilityRole="alert"
          >
            <Text style={styles.bannerEmoji}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: colors.warning ?? '#b45309' }]}>
                Running low
              </Text>
              <Text style={[styles.bannerSub, { color: colors.textSecondary }]}>
                Total count{' '}
                {colony.total_count == null
                  ? 'unknown'
                  : colony.total_count.toLocaleString()}{' '}
                is below your threshold of {colony.low_threshold}. Log a restock or adjust
                the threshold.
              </Text>
            </View>
          </View>
        )}

        {/* Inventory card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.md,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>
              {categoryEmoji(colony.species_display_name)}
            </Text>
            <Text
              style={[styles.sectionHeading, { color: colors.textTertiary }]}
            >
              INVENTORY
            </Text>
          </View>

          <View style={styles.invTotalRow}>
            <Text style={[styles.invTotal, { color: colors.textPrimary }]}>
              {totalCountLabel}
            </Text>
            <Text style={[styles.invTotalLabel, { color: colors.textTertiary }]}>
              {colony.inventory_mode === 'life_stage' ? 'across stages' : 'total'}
            </Text>
          </View>

          {lifeStageEntries.length > 0 && (
            <View style={styles.lifeStageGrid}>
              {lifeStageEntries.map(([stage, n]) => (
                <View
                  key={stage}
                  style={[
                    styles.lifeStageBucket,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderRadius: layout.radius.sm,
                    },
                  ]}
                >
                  <Text style={[styles.stageLabel, { color: colors.textTertiary }]}>
                    {stage}
                  </Text>
                  <Text style={[styles.stageValue, { color: colors.textPrimary }]}>
                    {n.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>
                Last fed
              </Text>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                {formatDaysLabel(fedDays, 'Today', 'Never')}
              </Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>
                Last cleaned
              </Text>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                {formatDaysLabel(cleanedDays, 'Today', 'Never')}
              </Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>
                Last restocked
              </Text>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                {formatDaysLabel(restockedDays, 'Today', 'Never')}
              </Text>
            </View>
          </View>

          {colony.low_threshold != null && (
            <Text style={[styles.thresholdNote, { color: colors.textTertiary }]}>
              Low-stock alert at {colony.low_threshold.toLocaleString()}.
            </Text>
          )}
        </View>

        {/* Quick-log actions */}
        <Text style={[styles.sectionHeading, { color: colors.textTertiary, marginBottom: 8 }]}>
          QUICK LOG
        </Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((action) => {
            const isActive = activeAction === action.type;
            return (
              <TouchableOpacity
                key={action.type}
                onPress={() => openAction(action.type)}
                accessibilityRole="button"
                accessibilityLabel={`${action.label}: ${action.description}`}
                accessibilityState={{ selected: isActive }}
                style={[
                  styles.actionTile,
                  {
                    backgroundColor: isActive ? 'rgba(139, 69, 19, 0.12)' : colors.surface,
                    borderColor: isActive ? colors.primary : colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Expanded panel */}
        {activeAction &&
          (() => {
            const action = QUICK_ACTIONS.find((a) => a.type === activeAction);
            if (!action) return null;
            return (
              <View
                style={[
                  styles.panel,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
              >
                <View style={styles.panelHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>
                      {action.icon} {action.label}
                    </Text>
                    <Text style={[styles.panelDesc, { color: colors.textTertiary }]}>
                      {action.description}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={closePanel}
                    accessibilityLabel="Cancel"
                    style={{ padding: 4 }}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={22}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                </View>

                {panelError !== '' && (
                  <View
                    style={[
                      styles.errorBox,
                      {
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderColor: colors.error ?? '#ef4444',
                      },
                    ]}
                  >
                    <Text style={[styles.errorText, { color: colors.error ?? '#b91c1c' }]}>
                      {panelError}
                    </Text>
                  </View>
                )}

                {action.needsCountInput && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                      {action.type === 'restock'
                        ? 'How many did you add?'
                        : 'Change amount (use − for removal)'}
                    </Text>
                    {colony.inventory_mode === 'life_stage' && (
                      <Text
                        style={[
                          styles.fieldHint,
                          { color: colors.textTertiary, marginBottom: 6 },
                        ]}
                      >
                        Life-stage buckets must be updated separately in Edit.
                      </Text>
                    )}
                    <TextInput
                      value={panelDelta}
                      onChangeText={(v) => {
                        const pat = action.allowNegative ? /^-?\d*$/ : /^\d*$/;
                        if (v === '' || pat.test(v)) setPanelDelta(v);
                      }}
                      keyboardType={action.allowNegative ? 'numbers-and-punctuation' : 'number-pad'}
                      placeholder={action.type === 'restock' ? 'e.g. 100' : 'e.g. -10'}
                      placeholderTextColor={colors.textTertiary}
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          borderRadius: layout.radius.sm,
                        },
                      ]}
                    />
                  </>
                )}

                <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginTop: 12 }]}>
                  Notes {action.type === 'note' && <Text style={{ color: '#ef4444' }}>*</Text>}
                </Text>
                <TextInput
                  value={panelNotes}
                  onChangeText={setPanelNotes}
                  multiline
                  numberOfLines={3}
                  maxLength={2000}
                  placeholder={
                    action.type === 'note'
                      ? 'What did you notice?'
                      : 'Optional — e.g. "fresh carrots + water crystals"'
                  }
                  placeholderTextColor={colors.textTertiary}
                  style={[
                    styles.input,
                    styles.textarea,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      borderRadius: layout.radius.sm,
                    },
                  ]}
                />

                <View style={styles.panelActions}>
                  <TouchableOpacity
                    onPress={closePanel}
                    style={[
                      styles.ghostBtn,
                      { borderColor: colors.border, borderRadius: layout.radius.sm },
                    ]}
                  >
                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <PrimaryButton
                    onPress={submitLog}
                    disabled={
                      panelSubmitting || (action.type === 'note' && !panelNotes.trim())
                    }
                    style={[styles.saveBtn, { borderRadius: layout.radius.sm }]}
                    outerStyle={{ borderRadius: layout.radius.sm }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600' }}>
                      {panelSubmitting ? 'Saving…' : 'Log it'}
                    </Text>
                  </PrimaryButton>
                </View>
              </View>
            );
          })()}

        {/* Notes section */}
        {(colony.food_notes || colony.notes) && (
          <>
            <Text
              style={[
                styles.sectionHeading,
                { color: colors.textTertiary, marginTop: 16, marginBottom: 8 },
              ]}
            >
              DETAILS
            </Text>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              {colony.food_notes && (
                <View style={{ marginBottom: colony.notes ? 12 : 0 }}>
                  <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>
                    Food / gut-load
                  </Text>
                  <Text style={[styles.detailBody, { color: colors.textPrimary }]}>
                    {colony.food_notes}
                  </Text>
                </View>
              )}
              {colony.notes && (
                <View>
                  <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>
                    Notes
                  </Text>
                  <Text style={[styles.detailBody, { color: colors.textPrimary }]}>
                    {colony.notes}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* History */}
        <Text
          style={[
            styles.sectionHeading,
            { color: colors.textTertiary, marginTop: 16, marginBottom: 8 },
          ]}
        >
          HISTORY
        </Text>
        {logs.length === 0 ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: layout.radius.md,
                alignItems: 'center',
              },
            ]}
          >
            <Text style={[styles.emptyHistory, { color: colors.textSecondary }]}>
              No care events yet. Use Quick log above to record your first one.
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.historyWrap,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: layout.radius.md,
              },
            ]}
          >
            {logs.map((log, idx) => {
              const action = QUICK_ACTIONS.find((a) => a.type === log.log_type);
              return (
                <View
                  key={log.id}
                  style={[
                    styles.logRow,
                    {
                      borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <Text style={styles.logIcon}>{action?.icon ?? '📋'}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.logTopRow}>
                      <Text style={[styles.logTitle, { color: colors.textPrimary }]}>
                        {formatLogType(log.log_type)}
                        {log.count_delta != null && (
                          <Text
                            style={{
                              color:
                                log.count_delta > 0
                                  ? '#16a34a'
                                  : log.count_delta < 0
                                    ? '#dc2626'
                                    : colors.textTertiary,
                              fontWeight: '700',
                            }}
                          >
                            {'  '}
                            {log.count_delta > 0 ? '+' : ''}
                            {log.count_delta.toLocaleString()}
                          </Text>
                        )}
                      </Text>
                      <Text style={[styles.logDate, { color: colors.textTertiary }]}>
                        {formatLogDate(log.logged_at)}
                      </Text>
                    </View>
                    {log.notes && (
                      <Text
                        style={[styles.logNotes, { color: colors.textSecondary }]}
                        numberOfLines={6}
                      >
                        {log.notes}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => requestDeleteLog(log.id)}
                    accessibilityLabel={`Delete ${formatLogType(log.log_type)} log`}
                    style={{ padding: 6 }}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={18}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Delete colony CTA */}
        <TouchableOpacity
          onPress={() => setConfirmDelete(true)}
          style={[
            styles.deleteBtn,
            {
              borderColor: colors.error ?? '#ef4444',
              borderRadius: layout.radius.md,
            },
          ]}
        >
          <Text style={[styles.deleteText, { color: colors.error ?? '#dc2626' }]}>
            Delete colony
          </Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Delete colony modal */}
      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setConfirmDelete(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: layout.radius.lg,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Delete this colony?
            </Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              All care logs for{' '}
              <Text style={{ fontWeight: '700' }}>{colony.name}</Text> will be permanently
              deleted. This can't be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setConfirmDelete(false)}
                disabled={deleting}
                style={[
                  styles.ghostBtn,
                  { borderColor: colors.border, borderRadius: layout.radius.sm },
                ]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={deleteColony}
                disabled={deleting}
                style={[
                  styles.destructiveBtn,
                  {
                    borderColor: colors.error ?? '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: layout.radius.sm,
                  },
                ]}
              >
                <Text style={{ color: colors.error ?? '#dc2626', fontWeight: '700' }}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete log modal */}
      <Modal
        visible={confirmDeleteLogId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setConfirmDeleteLogId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: layout.radius.lg,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Delete this log entry?
            </Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Inventory changes it caused will NOT be reverted.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setConfirmDeleteLogId(null)}
                disabled={deleting}
                style={[
                  styles.ghostBtn,
                  { borderColor: colors.border, borderRadius: layout.radius.sm },
                ]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDeleteLog}
                disabled={deleting}
                style={[
                  styles.destructiveBtn,
                  {
                    borderColor: colors.error ?? '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: layout.radius.sm,
                  },
                ]}
              >
                <Text style={{ color: colors.error ?? '#dc2626', fontWeight: '700' }}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 320,
  },
  ghostBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  retryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  archivedPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  archivedText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  lowBanner: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerEmoji: { fontSize: 22 },
  bannerTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  bannerSub: { fontSize: 13, lineHeight: 18 },
  card: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardEmoji: { fontSize: 22 },
  sectionHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  invTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 12,
  },
  invTotal: { fontSize: 36, fontWeight: '800' },
  invTotalLabel: { fontSize: 12 },
  lifeStageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  lifeStageBucket: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 90,
    flexGrow: 1,
  },
  stageLabel: { fontSize: 11, textTransform: 'capitalize' },
  stageValue: { fontSize: 17, fontWeight: '700', marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  metaCol: { flex: 1, minWidth: 0 },
  metaLabel: { fontSize: 11, marginBottom: 2 },
  metaValue: { fontSize: 13, fontWeight: '600' },
  thresholdNote: { fontSize: 11, marginTop: 10 },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  actionTile: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: '31.5%',
  },
  actionIcon: { fontSize: 22, marginBottom: 4 },
  actionLabel: { fontSize: 12, fontWeight: '600' },
  panel: {
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
    marginBottom: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  panelDesc: { fontSize: 12, marginTop: 2 },
  errorBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  errorText: { fontSize: 13 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  fieldHint: { fontSize: 11 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textarea: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  panelActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  detailBody: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  emptyHistory: { fontSize: 14, textAlign: 'center', padding: 8 },
  historyWrap: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  logRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  logIcon: { fontSize: 20 },
  logTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  logTitle: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  logDate: { fontSize: 11 },
  logNotes: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  deleteBtn: {
    marginTop: 24,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteText: { fontSize: 14, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  modalBody: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  destructiveBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
});
