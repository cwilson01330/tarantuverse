/**
 * PauseFeedingSheet — bottom-sheet modal for setting/clearing the
 * `feeding_paused_reason` + `feeding_paused_until` flags on a tarantula.
 *
 * Why this exists: tarantulas in premolt routinely refuse food for
 * weeks or even months. A 7-month-premolt sling shouldn't trigger a
 * red overdue alert every day or it conditions the keeper to ignore
 * real overdue alerts on other spiders. This sheet is the mute-button.
 *
 * UX:
 *   - 5 reason chips: Premolt / Post-rehouse / Recovering /
 *     Mating season / Other
 *   - Optional "until" date (YYYY-MM-DD). Blank = indefinite.
 *   - Save → PUT /tarantulas/{id} with the two fields
 *   - "Resume now" button (only when already paused) → PUT with both
 *     fields cleared to null
 *
 * Mirrors apps/mobile-herpetoverse/src/components/PauseFeedingSheet.tsx
 * with tarantula-specific reason copy. Backed by migration pst_20260502.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import apiClient from '../services/api';

const REASON_OPTIONS: Array<{ value: string; label: string; helper: string }> = [
  {
    value: 'premolt',
    label: 'Premolt',
    helper: "She's in premolt — common for slings and mature females.",
  },
  {
    value: 'post_rehouse',
    label: 'Post-rehouse',
    helper: 'Settling into a new enclosure. A skipped feeding or two is normal.',
  },
  {
    value: 'recovering',
    label: 'Recovering',
    helper: 'After a fall, leg loss, or other stress.',
  },
  {
    value: 'mating_season',
    label: 'Mating season',
    helper: 'Mature male wandering, or breeding pause for a female.',
  },
  {
    value: 'other',
    label: 'Other',
    helper: 'Any other keeper-known reason. Add a note if you want.',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  tarantulaId: string;
  tarantulaName?: string | null;
  /** Current reason, if any — passed in so resume makes sense. */
  currentReason: string | null;
  currentUntil: string | null;
  /** Called after a successful save/resume so parent can refetch. */
  onChange: () => void;
}

export function PauseFeedingSheet({
  visible,
  onClose,
  tarantulaId,
  tarantulaName,
  currentReason,
  currentUntil,
  onChange,
}: Props) {
  const { colors } = useTheme();
  const isPaused = !!currentReason;

  const [reason, setReason] = useState<string | null>(currentReason);
  const [until, setUntil] = useState<string>(currentUntil ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the sheet opens — pulls fresh from props.
  useEffect(() => {
    if (visible) {
      setReason(currentReason || 'premolt');
      setUntil(currentUntil ?? '');
      setError(null);
      setSubmitting(false);
    }
  }, [visible, currentReason, currentUntil]);

  const validateUntil = (): string | null => {
    if (!until.trim()) return null; // optional
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until.trim())) {
      return 'Use YYYY-MM-DD or leave blank for indefinite.';
    }
    const d = new Date(until.trim() + 'T00:00:00');
    if (Number.isNaN(d.getTime())) {
      return "That date doesn't look right.";
    }
    return null;
  };

  async function handleSave() {
    if (!reason) {
      setError('Pick a reason for the pause.');
      return;
    }
    const untilError = validateUntil();
    if (untilError) {
      setError(untilError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.put(`/api/v1/tarantulas/${tarantulaId}`, {
        feeding_paused_reason: reason,
        feeding_paused_until: until.trim() || null,
      });
      onChange();
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Could not save. Try again?',
      );
      setSubmitting(false);
    }
  }

  async function handleResume() {
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.put(`/api/v1/tarantulas/${tarantulaId}`, {
        feeding_paused_reason: null,
        feeding_paused_until: null,
      });
      onChange();
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Could not resume. Try again?',
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  {isPaused ? 'Edit pause' : 'Pause feeding reminders'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {tarantulaName
                    ? `Reminders for ${tarantulaName} won't escalate to "overdue" while paused.`
                    : "Reminders won't escalate to \"overdue\" while paused."}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text
                style={[
                  styles.label,
                  { color: colors.textSecondary, marginTop: 4 },
                ]}
              >
                Reason
              </Text>
              <View style={{ gap: 8, marginTop: 6 }}>
                {REASON_OPTIONS.map((opt) => {
                  const selected = reason === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setReason(opt.value)}
                      style={[
                        styles.reasonRow,
                        {
                          backgroundColor: selected
                            ? colors.surfaceElevated
                            : colors.surface,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          selected ? 'radiobox-marked' : 'radiobox-blank'
                        }
                        size={20}
                        color={selected ? colors.primary : colors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: colors.textPrimary,
                            fontWeight: '600',
                            fontSize: 14,
                          }}
                        >
                          {opt.label}
                        </Text>
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: 12,
                            marginTop: 2,
                          }}
                        >
                          {opt.helper}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text
                style={[
                  styles.label,
                  { color: colors.textSecondary, marginTop: 16 },
                ]}
              >
                Auto-resume on (optional)
              </Text>
              <TextInput
                value={until}
                onChangeText={setUntil}
                placeholder="YYYY-MM-DD or blank for indefinite"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                style={[
                  styles.dateInput,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 11,
                  marginTop: 6,
                  lineHeight: 15,
                }}
              >
                Leave blank if you don't know when feeding will resume.
                Premolts can run months — that's fine.
              </Text>

              {error ? (
                <Text
                  style={{
                    color: '#dc2626',
                    fontSize: 13,
                    marginTop: 12,
                  }}
                >
                  {error}
                </Text>
              ) : null}
            </ScrollView>

            <View style={{ marginTop: 14, gap: 8 }}>
              <TouchableOpacity
                onPress={handleSave}
                disabled={submitting}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: submitting ? 0.6 : 1,
                  },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isPaused ? 'Update pause' : 'Pause feeding'}
                  </Text>
                )}
              </TouchableOpacity>

              {isPaused ? (
                <TouchableOpacity
                  onPress={handleResume}
                  disabled={submitting}
                  style={[
                    styles.secondaryButton,
                    {
                      borderColor: colors.border,
                      opacity: submitting ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.secondaryButtonText,
                      { color: colors.textPrimary },
                    ]}
                  >
                    Resume feeding now
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  dateInput: {
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 15,
    marginTop: 6,
  },

  primaryButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PauseFeedingSheet;
