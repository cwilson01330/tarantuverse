import React, { useState, useEffect, Suspense } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateInput from '../../src/components/DateInput';
import { apiClient } from '../../src/services/api';
import { scheduleFeedingReminder } from '../../src/services/notifications';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
const PauseFeedingSheet = React.lazy(
  () => import('../../src/components/PauseFeedingSheet'),
);

const PAUSE_REASON_LABELS: Record<string, string> = {
  premolt: 'In premolt',
  post_rehouse: 'Settling after rehouse',
  recovering: 'Recovering',
  mating_season: 'Mating-season pause',
  other: 'Paused',
};

const FOOD_TYPES = [
  'Cricket',
  'Dubia Roach',
  'Red Runner',
  'Mealworm',
  'Superworm',
  'Hornworm',
  'Waxworm',
  'Other',
];

const FOOD_SIZES = ['Small', 'Medium', 'Large'];

export default function AddFeedingScreen() {
  const router = useRouter();
  // `id` is the tarantula id (always present). `feedingId` is set when
  // we're editing an existing entry — toggles the form into edit mode:
  //   - title flips to "Edit Feeding"
  //   - we GET the existing feeding to pre-fill state
  //   - save dispatches PUT instead of POST
  //   - we skip the post-save reminder schedule (an edit isn't a
  //     fresh feeding event from the keeper's perspective)
  const { id, feedingId } = useLocalSearchParams<{
    id?: string;
    feedingId?: string;
  }>();
  const isEdit = Boolean(feedingId);
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [date, setDate] = useState(new Date());
  const [foodType, setFoodType] = useState('');
  const [foodSize, setFoodSize] = useState('');
  const [accepted, setAccepted] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [tarantulaName, setTarantulaName] = useState('');
  const [notificationPreferences, setNotificationPreferences] = useState<any>(null);
  // Feeding-pause state read off the tarantula record. Surfaced inline
  // so the keeper can pause/resume during the same flow as logging a
  // refusal — see migration pst_20260502.
  const [pausedReason, setPausedReason] = useState<string | null>(null);
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [showPauseSheet, setShowPauseSheet] = useState(false);
  const [showPauseHelp, setShowPauseHelp] = useState(false);

  useEffect(() => {
    // Load tarantula details and notification preferences
    loadTarantulaDetails();
    loadNotificationPreferences();
    // In edit mode, also fetch the existing feeding to pre-fill.
    if (isEdit && feedingId) {
      loadExistingFeeding(feedingId as string);
    }
  }, [id, feedingId]);

  const loadExistingFeeding = async (fid: string) => {
    try {
      const response = await apiClient.get(`/feedings/${fid}`);
      const f = response.data;
      if (f.fed_at) setDate(new Date(f.fed_at));
      setFoodType(f.food_type ?? '');
      setFoodSize(f.food_size ?? '');
      setAccepted(f.accepted !== false);
      setNotes(f.notes ?? '');
    } catch (error) {
      console.error('Failed to load feeding for edit:', error);
      Alert.alert('Error', "Couldn't load this feeding to edit.");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadTarantulaDetails = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}`);
      setTarantulaName(response.data.name || response.data.common_name || 'Tarantula');
      setPausedReason(response.data.feeding_paused_reason ?? null);
      setPausedUntil(response.data.feeding_paused_until ?? null);
    } catch (error) {
      console.error('Failed to load tarantula details:', error);
    }
  };

  const loadNotificationPreferences = async () => {
    try {
      const response = await apiClient.get('/notification-preferences/');
      setNotificationPreferences(response.data);
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  };

  const handleSave = async () => {
    if (!foodType) {
      Alert.alert('Required Field', 'Please select a food type');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        fed_at: date.toISOString(),
        food_type: foodType,
        food_size: foodSize || undefined,
        accepted,
        notes: notes.trim() || undefined,
      };

      if (isEdit && feedingId) {
        // Edit mode — PUT to /feedings/{id}. Skip the reminder
        // scheduling: an edit is a correction, not a fresh feeding
        // event, so re-arming the reminder would be wrong.
        await apiClient.put(`/feedings/${feedingId}`, payload);
        Alert.alert('Saved', 'Feeding log updated');
      } else {
        await apiClient.post(`/tarantulas/${id}/feedings`, payload);
        // Schedule feeding reminder if enabled (create-only)
        if (notificationPreferences?.feeding_reminders_enabled && accepted && tarantulaName) {
          const hours = notificationPreferences.feeding_reminder_hours || 24;
          await scheduleFeedingReminder(
            id as string,
            tarantulaName,
            hours
          );
        }
        Alert.alert('Success', 'Feeding log added successfully');
      }
      router.back();
    } catch (error: any) {
      console.error('Failed to save feeding log:', error);
      Alert.alert('Error', isEdit ? "Couldn't save changes" : 'Failed to save feeding log');
    } finally {
      setSaving(false);
    }
  };

  const closeAction = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close">
      <MaterialCommunityIcons name="close" size={26} color={iconColor} />
    </TouchableOpacity>
  );
  const saveAction = (
    <TouchableOpacity
      onPress={handleSave}
      disabled={saving}
      style={{ opacity: saving ? 0.5 : 1, paddingHorizontal: 4 }}
      accessibilityLabel="Save"
    >
      <Text style={{ color: iconColor, fontSize: 16, fontWeight: '600' }}>
        {saving ? 'Saving…' : 'Save'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title={isEdit ? 'Edit Feeding' : 'Log Feeding'} leftAction={closeAction} rightAction={saveAction} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Date */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Date</Text>
          <DateInput
            value={date}
            onChange={setDate}
            maximumDate={new Date()}
            label="Feeding Date"
          />
        </View>

        {/* Food Type */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Food Type *</Text>
          <View style={styles.chipContainer}>
            {FOOD_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.chip,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  foodType === type && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setFoodType(type)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: colors.textSecondary },
                    foodType === type && { color: '#fff' },
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Food Size */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Food Size</Text>
          <View style={styles.chipContainer}>
            {FOOD_SIZES.map((size) => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.chip,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  foodSize === size && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setFoodSize(foodSize === size ? '' : size)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: colors.textSecondary },
                    foodSize === size && { color: '#fff' },
                  ]}
                >
                  {size}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Accepted */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Did they accept the food?</Text>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                accepted && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setAccepted(true)}
            >
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color={accepted ? '#fff' : colors.success}
              />
              <Text
                style={[
                  styles.toggleButtonText,
                  { color: colors.textSecondary },
                  accepted && { color: '#fff' },
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                !accepted && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setAccepted(false)}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={20}
                color={!accepted ? '#fff' : colors.error}
              />
              <Text
                style={[
                  styles.toggleButtonText,
                  { color: colors.textSecondary },
                  !accepted && { color: '#fff' },
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Notes</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.textPrimary }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any additional notes..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Pause feeding row — surfaces in-context with the log-feeding
            flow, since "she just refused / she's been refusing" is the
            natural moment to think about pausing. Backed by migration
            pst_20260502. */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <View style={styles.pauseLabelRow}>
            <Text style={[styles.label, { color: colors.textPrimary, marginBottom: 0 }]}>
              {pausedReason ? 'Feeding paused' : 'Going off feed?'}
            </Text>
            <TouchableOpacity
              onPress={() => setShowPauseHelp((v) => !v)}
              hitSlop={8}
              accessibilityLabel="What does this do?"
            >
              <MaterialCommunityIcons
                name="information-outline"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          {showPauseHelp && (
            <View
              style={[
                styles.tooltip,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.tooltipText, { color: colors.textSecondary }]}>
                Tarantulas in premolt, recovering from a fall, or settling
                after a rehouse can refuse food for weeks or months. Pause
                feedings to mute overdue alerts so they don't drown out
                real ones on your other spiders. You can resume any time.
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => setShowPauseSheet(true)}
            style={[
              styles.pauseRow,
              {
                backgroundColor: pausedReason
                  ? colors.surfaceElevated
                  : 'transparent',
                borderColor: pausedReason ? colors.primary : colors.border,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={pausedReason ? 'pause-circle' : 'pause-circle-outline'}
              size={22}
              color={pausedReason ? colors.primary : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: 15,
                  fontWeight: '600',
                }}
              >
                {pausedReason
                  ? PAUSE_REASON_LABELS[pausedReason] ?? 'Paused'
                  : 'Pause feedings'}
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                {pausedReason
                  ? pausedUntil
                    ? `Auto-resumes ${new Date(pausedUntil).toLocaleDateString()} — tap to edit`
                    : 'Indefinite — tap to edit or resume'
                  : 'Mute overdue alerts during premolt or fasting'}
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Pause-feedings sheet — same component used on the detail
          screen. onChange refetches the tarantula so the row above
          reflects the new state without needing to back out. */}
      <Suspense fallback={null}>
        {showPauseSheet && id && (
          <PauseFeedingSheet
            visible={showPauseSheet}
            onClose={() => setShowPauseSheet(false)}
            tarantulaId={id as string}
            tarantulaName={tarantulaName || null}
            currentReason={pausedReason}
            currentUntil={pausedUntil}
            onChange={() => {
              loadTarantulaDetails();
            }}
          />
        )}
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    gap: 8,
  },
  inputText: {
    fontSize: 16,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    gap: 8,
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  textArea: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
    minHeight: 100,
  },
  pauseLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tooltip: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  tooltipText: {
    fontSize: 12,
    lineHeight: 17,
  },
  pauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
});
