/**
 * Brumation (aestivation for amphibians) on / off, on the animal screen.
 *
 * Keeper-level, like the feeding pause. Starting records the device's
 * local date. While on, the server never flags the animal overdue on
 * Feeding Day (`is_brumating` on /animals/feeding-status). Viewers and
 * loggers see the state but not the switch; nothing renders for them when
 * it's off.
 *
 * Colours from useTheme(), type from TYPE, spacing/radius from the theme
 * layout — no hardcoded values.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/type';
import { todayISO } from '../forms/FormPrimitives';
import { type Animal, restLabel, setBrumation } from '../../lib/animals';

export function BrumationRow({
  animal,
  canKeep,
  onChanged,
}: {
  animal: Animal;
  canKeep: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const { colors, layout } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = !!animal.brumation_active;
  const label = restLabel(animal.taxon);

  if (!active && !canKeep) return null;

  async function toggle() {
    if (busy) return;
    const next = !active;
    setBusy(true);
    setError(null);
    try {
      await setBrumation(animal.id, next, next ? todayISO() : null);
      await onChanged();
    } catch {
      setError(next ? `Couldn't start ${label.toLowerCase()}. Try again.` : `Couldn't end ${label.toLowerCase()}. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  const since = animal.brumation_started_at ? fmtDay(animal.brumation_started_at) : null;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: layout.radius.md,
        padding: layout.spacing.md,
        gap: layout.spacing.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: layout.spacing.sm }}>
        <MaterialCommunityIcons name="sleep" size={18} color={colors.textSecondary} />
        <Text style={[TYPE.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>
          {active ? (since ? `${label} since ${since}` : `${label} on`) : label}
        </Text>
        {canKeep && (
          <TouchableOpacity
            onPress={() => void toggle()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={active ? `End ${label.toLowerCase()}` : `Start ${label.toLowerCase()}`}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: layout.spacing.xs }}
          >
            {busy ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>{active ? 'End' : 'Start'}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
      <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
        {active
          ? "Not flagged overdue on Feeding Day while this is on."
          : "Turn on while it rests for the season. It won't be flagged overdue on Feeding Day until you end it."}
      </Text>
      {error ? <Text style={[TYPE.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
