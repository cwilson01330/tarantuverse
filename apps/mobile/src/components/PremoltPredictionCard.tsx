import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';
import {
  PREMOLT_COPY,
  answerPremolt,
  premoltAnswerable,
  premoltCardState,
  type PremoltAnswer,
  type PremoltPrediction,
} from '../lib/premolt-view';
import { ON_PRIMARY } from '../utils/status-colors';
import { TYPE } from '../theme/tokens';
import { showReminderToast } from './ReminderToast';

interface Props {
  invertId: string;
  /** Keepers of an open (not died / transferred) animal can answer. */
  canAnswer: boolean;
  /** Called after an answer was saved, so the parent can refresh what it shows. */
  onAnswered?: () => void;
}

export default function PremoltPredictionCard({ invertId, canAnswer, onAnswered }: Props) {
  const { colors } = useTheme();
  const [prediction, setPrediction] = useState<PremoltPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState<PremoltAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const fetchPrediction = async () => {
      try {
        const response = await apiClient.get(`/premolt/inverts/${invertId}`);
        if (!cancelled) setPrediction(response.data);
      } catch (err) {
        console.error('Failed to fetch premolt prediction:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPrediction();
    return () => { cancelled = true; };
  }, [invertId]);

  const answer = async (choice: PremoltAnswer) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPosting(choice);
    setError(null);
    try {
      const fresh = await answerPremolt(invertId, choice);
      setPrediction(fresh);
      if (choice === 'not_yet') showReminderToast(PREMOLT_COPY.snoozedToast);
      onAnswered?.();
    } catch (e: any) {
      setError(e?.message || 'Could not save your answer. Please try again.');
    } finally {
      inFlight.current = false;
      setPosting(null);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const state = premoltCardState(prediction);
  if (!prediction || state === 'hidden') {
    return null;
  }

  // Matured (ult_20260911). Checked BEFORE data quality, because maturity is
  // a fact about the animal while data quality is a fact about the logs.
  // Deliberately states elapsed time only. No countdown, no "expect X months".
  if (state === 'matured') {
    const since = prediction.days_since_matured;
    const elapsed =
      since == null
        ? null
        : since < 31
        ? `${since} day${since === 1 ? '' : 's'} ago`
        : since < 365
        ? `${Math.round(since / 30)} months ago`
        : `${(since / 365).toFixed(1)} years ago`;
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>Matured</Text>
        <View style={[styles.insufficientBox, { backgroundColor: 'transparent' }]}>
          <Text style={[styles.insufficientText, { color: colors.textSecondary }]}>
            {/* has_matured = a final molt was logged. Otherwise the server
                decided from the life stage (adults of taxa that stop molting,
                adult male tarantulas) — don't claim a molt nobody recorded. */}
            {!prediction.has_matured
              ? prediction.taxon === 'tarantula'
                ? "Mature males don't molt again, so premolt predictions stop here."
                : "Adults of this kind don't molt again, so premolt predictions stop here."
              : elapsed
              ? `Ultimate molt recorded ${elapsed}. No further molts expected, so premolt predictions stop here.`
              : 'Ultimate molt recorded. No further molts expected, so premolt predictions stop here.'}
          </Text>
        </View>
      </View>
    );
  }

  if (state === 'insufficient') {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.primary + '20', borderColor: colors.primary },
        ]}
      >
        <Text style={[styles.title, { color: colors.primary }]}>Premolt</Text>
        <View style={[styles.insufficientBox, { backgroundColor: colors.primary + '10' }]}>
          <Text style={[styles.insufficientText, { color: colors.textPrimary }]}>
            Need more data — log feedings and molts to enable predictions
          </Text>
        </View>
      </View>
    );
  }

  const isAlert = state === 'alert';
  const isClear = state === 'clear';
  const tint = isAlert ? colors.warning : isClear ? colors.success : colors.border;
  const statusText =
    state === 'paused'
      ? PREMOLT_COPY.paused
      : state === 'snoozed'
      ? PREMOLT_COPY.snoozedToast
      : isAlert
      ? PREMOLT_COPY.headline
      : PREMOLT_COPY.clear;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isAlert || isClear ? tint + '20' : colors.surface,
          borderColor: tint,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Premolt</Text>
      </View>

      <View style={[styles.statusBox, { backgroundColor: isAlert || isClear ? tint + '20' : colors.surfaceElevated }]}>
        <Text style={[styles.statusText, { color: colors.textPrimary }]}>{statusText}</Text>
      </View>

      {isAlert && !!prediction.reason && (
        <Text style={[styles.reasonText, { color: colors.textPrimary }]}>{prediction.reason}</Text>
      )}

      {canAnswer && premoltAnswerable(prediction) && (
        <View style={styles.answerRow}>
          <TouchableOpacity
            style={[styles.answerButton, { backgroundColor: colors.primary, opacity: posting ? 0.6 : 1 }]}
            onPress={() => answer('yes')}
            disabled={!!posting}
            accessibilityRole="button"
            accessibilityLabel={PREMOLT_COPY.yes}
          >
            {posting === 'yes' ? (
              <ActivityIndicator color={ON_PRIMARY} />
            ) : (
              <Text style={[styles.answerText, { color: ON_PRIMARY }]}>{PREMOLT_COPY.yes}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.answerButton, { borderColor: colors.border, borderWidth: 1, opacity: posting ? 0.6 : 1 }]}
            onPress={() => answer('not_yet')}
            disabled={!!posting}
            accessibilityRole="button"
            accessibilityLabel={PREMOLT_COPY.notYet}
          >
            {posting === 'not_yet' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.answerText, { color: colors.textPrimary }]}>{PREMOLT_COPY.notYet}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <Text style={[styles.errorText, { color: colors.error }]} accessibilityRole="alert">
          {error}
        </Text>
      )}

      {/* Metrics */}
      <View style={styles.metricsContainer}>
        {prediction.recent_refusal_streak > 0 && (
          <View style={[styles.metricItem, { backgroundColor: colors.surface }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              Feeding refusals
            </Text>
            <Text style={[styles.metricValue, { color: colors.error }]}>
              {prediction.recent_refusal_streak}
            </Text>
          </View>
        )}

        {prediction.days_since_last_molt != null && (
          <View style={[styles.metricItem, { backgroundColor: colors.surface }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              Days since molt
            </Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
              {prediction.days_since_last_molt}
            </Text>
          </View>
        )}

        {prediction.molt_interval_progress != null && !!prediction.average_molt_interval && (
          <View style={[styles.progressContainer, { backgroundColor: colors.surface }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                Molt interval progress
              </Text>
              <Text style={[styles.progressPercentage, { color: colors.textPrimary }]}>
                {Math.round(prediction.molt_interval_progress)}%
              </Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(prediction.molt_interval_progress, 100)}%`,
                    backgroundColor: isAlert ? colors.warning : colors.success,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressNote, { color: colors.textTertiary }]}>
              Avg interval: {prediction.average_molt_interval.toFixed(0)} days
            </Text>
          </View>
        )}

        {prediction.refusal_rate_last_30_days != null && (
          <View style={[styles.metricItem, { backgroundColor: colors.surface }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              Refusal rate (30d)
            </Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
              {prediction.refusal_rate_last_30_days.toFixed(0)}%
            </Text>
          </View>
        )}

        {prediction.estimated_molt_window_days != null && (
          <View style={[styles.metricItem, { backgroundColor: colors.surface }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              Estimated window
            </Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
              ~{prediction.estimated_molt_window_days} days
            </Text>
          </View>
        )}
      </View>

      {prediction.data_quality === 'fair' && (
        <Text
          style={[
            styles.dataQualityNote,
            { color: colors.textTertiary, borderTopColor: colors.border },
          ]}
        >
          Log more feedings and molts to improve prediction accuracy
        </Text>
      )}
    </View>
  );
}

// StyleSheet defined at module level — avoids temporal dead zone issues
// that occur when StyleSheet.create is placed after early returns inside the component.
const styles = StyleSheet.create({
  container: {
    margin: 8,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  reasonText: {
    ...TYPE.body,
    marginBottom: 12,
  },
  answerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  answerButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  answerText: {
    ...TYPE.bodyStrong,
  },
  errorText: {
    ...TYPE.label,
    marginBottom: 12,
  },
  statusBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  metricsContainer: {
    gap: 10,
  },
  metricItem: {
    padding: 12,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressContainer: {
    padding: 12,
    borderRadius: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressNote: {
    fontSize: 11,
    marginTop: 4,
  },
  insufficientBox: {
    padding: 12,
    borderRadius: 10,
  },
  insufficientText: {
    fontSize: 14,
  },
  dataQualityNote: {
    fontSize: 11,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
