/**
 * "Feeding reminders pause until Nov 24 — check the fangs are fully black…"
 * line for the molt forms (Effortless logging, task 5).
 *
 * Shown only when the owner's switch is on and the taxon has a window (or an
 * existing molt carries an override above zero). `Change` offers a last paused day
 * or "Don't pause". The parent sends `feeding_pause_days` only when the keeper
 * touched it, so an untouched form keeps the default (null on the server).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';
import { apiClient } from '../services/api';
import { parseLocalDate, toISODateLocal } from '../utils/date';
import { effectivePauseDays, isPauseActive, moltFormLine, pauseDaysFor, pauseUntil } from '../lib/post-molt';
import DateInput from './DateInput';

interface PauseInfo {
  enabled: boolean;
  default_days: number | null;
}

/** Form state: the molt's own window (null = default) and whether the keeper touched it. */
export function usePostMoltPause() {
  const [override, setOverride] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  /** Seed from a saved molt (edit mode). Not a keeper change, so nothing is sent. */
  const load = useCallback((saved: number | null | undefined) => {
    setOverride(saved ?? null);
  }, []);
  const choose = useCallback((days: number) => {
    setOverride(days);
    setTouched(true);
  }, []);
  /** Spread into the save payload: nothing unless the keeper changed it. */
  const payload: { feeding_pause_days?: number } = touched && override != null ? { feeding_pause_days: override } : {};
  return { override, touched, load, choose, payload };
}

interface Props {
  /** Animal id for the settings lookup (a tarantula's id is its invert id). */
  invertId: string | undefined;
  /** Molt day, YYYY-MM-DD (local). */
  moltDate: string;
  override: number | null;
  onChoose: (days: number) => void;
}

export function PostMoltPauseLine({ invertId, moltDate, override, onChoose }: Props) {
  const { colors, layout } = useTheme();
  const [info, setInfo] = useState<PauseInfo | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!invertId) return;
    let live = true;
    apiClient
      .get<PauseInfo>(`/inverts/${invertId}/post-molt-pause`)
      .then((r) => { if (live) setInfo(r.data); })
      .catch(() => { /* no line is the safe fallback */ });
    return () => { live = false; };
  }, [invertId]);

  if (!info?.enabled) return null;
  if (!info.default_days && !((override ?? 0) > 0)) return null;

  const days = effectivePauseDays(info.default_days, override);
  const until = days != null ? pauseUntil(moltDate, days) : null;

  // A back-dated molt whose window already ended pauses nothing: no line.
  if (until && !isPauseActive(until, toISODateLocal(new Date()))) return null;

  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: layout.radius.md }]}>
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        {until ? moltFormLine(until) : "Feeding reminders won't pause after this molt."}
      </Text>
      <TouchableOpacity onPress={() => setChanging((v) => !v)} accessibilityRole="button" accessibilityLabel="Change feeding pause">
        <Text style={[styles.change, { color: colors.primary }]}>Change</Text>
      </TouchableOpacity>
      {changing ? (
        <View style={styles.panel}>
          <DateInput
            value={parseLocalDate(until ?? moltDate) ?? new Date()}
            onChange={(d) => {
              const n = pauseDaysFor(moltDate, toISODateLocal(d));
              if (n != null) onChoose(n);
              setChanging(false);
            }}
            futureYears={1}
            label="Pause until"
          />
          <TouchableOpacity
            onPress={() => { onChoose(0); setChanging(false); }}
            accessibilityRole="button"
            style={styles.dont}
          >
            <Text style={[styles.change, { color: colors.textSecondary }]}>Don't pause</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, padding: 12, marginBottom: 16, gap: 6 },
  text: { ...TYPE.body },
  change: { ...TYPE.bodyStrong },
  panel: { marginTop: 6, gap: 8 },
  dont: { paddingVertical: 4 },
});
