/**
 * PauseFeedingSheet — bottom-sheet modal for setting/clearing the
 * `feeding_paused_reason` + `feeding_paused_until` flags on a snake or
 * lizard.
 *
 * Why this exists: ball pythons go on multi-month hunger strikes as
 * normal behavior. Without a way to tell the app "I know, leave me
 * alone," the FeedingStatusBanner escalates to overdue and the keeper
 * tunes out the alerts entirely. This is the mute-button.
 *
 * UX:
 *   - 5 reason chips: Hunger strike / Post-rehouse / Recovering /
 *     Breeding season / Other
 *   - Optional "until" date (YYYY-MM-DD). Blank = indefinite.
 *   - Save → PUT /snakes/{id} (or /lizards/{id}) with the two fields
 *   - "Resume now" button (only when already paused) → PUT with both
 *     fields cleared to null
 *
 * Brumation is a separate concept handled by `brumation_active`. This
 * sheet doesn't touch that — keepers managing brumation use the
 * existing flow on the detail screen / edit form.
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
import { pauseFeeding, resumeFeeding } from '../lib/snakes';

const REASON_OPTIONS: Array<{ value: string; label: string; helper: string }> = [
  {
    value: 'hunger_strike',
    label: 'Hunger strike',
    helper: 'Refusing meals — common for ball pythons in winter.',
  },
  {
    value: 'post_rehouse',
    label: 'Post-rehouse',
    helper: 'Settling into a new enclosure.',
  },
  {
    value: 'recovering',
    label: 'Recovering',
    helper: 'Post-illness, post-surgery, or post-regurgitation.',
  },
  {
    value: 'breeding_season',
    label: 'Breeding season',
    helper: 'Off-feed during pairing or post-laying.',
  },
  {
    value: 'other',
    label: 'Other',
    helper: 'Any other keeper-known reason.',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  taxon: 'snake' | 'lizard';
  animalId: string;
  animalName?: string | null;
  /** Current reason, if any — passed in so resume makes sense. */
  currentReason: string | null;
  currentUntil: string | null;
  /** Called after a successful save/resume so parent can refetch. */
  onChange: () => void;
}

export function PauseFeedingSheet({
  visible,
  onClose,
  taxon,
  animalId,
  animalName,
  currentReason,
  currentUntil,
  onChange,
}: Props) {
  const { colors, layout } = useTheme();
  const isPaused = !!currentReason;

  const [reason, setReason] = useState<string | null>(currentReason);
  const [until, setUntil] = useState<string>(currentUntil ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the sheet opens — pulls fresh from props.
  useEffect(() => {
    if (visible) {
      setReason(currentReason);
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
      await pauseFeeding(taxon, animalId, reason, until.trim() || null);
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
      await resumeFeeding(taxon, animalId);
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
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
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
                  {animalName
                    ? `Reminders for ${animalName} won't escalate to "overdue" while paused.`
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
                            ? colors.surfaceRaised
                            : colors.surface,
                          borderColor: selected ? colors.primary : colors.border,
                          borderRadius: layout.radius.md,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          selected ? 'radiobox-marked' : 'radiobox-blank'
                        }
                        size={20}
                        color={selected ? colors.primary : colors.textTertiary}
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
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                style={[
                  styles.dateInput,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
              />
              <Text
                style={{
                  color: colors.textTertiary,
                  fontSize: 11,
                  marginTop: 6,
                  lineHeight: 15,
                }}
              >
                Leave blank if you don't know when feeding will resume.
                Hunger strikes can run months — that's fine.
              </Text>

              {error ? (
                <Text
                  style={{
                    color: colors.danger,
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
                    borderRadius: layout.radius.md,
                    opacity: submitting ? 0.6 : 1,
                  },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#0B0B0B" />
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
                      borderRadius: layout.radius.md,
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
  },
  dateInput: {
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    fontSize: 15,
    marginTop: 6,
  },

  primaryButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PauseFeedingSheet;
