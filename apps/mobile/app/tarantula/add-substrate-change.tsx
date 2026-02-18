import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiClient } from '../../src/services/api';
import { scheduleSubstrateReminder } from '../../src/services/notifications';
import { useTheme } from '../../src/contexts/ThemeContext';

const SUBSTRATE_TYPES = [
  'Coco Fiber',
  'Peat Moss',
  'Vermiculite',
  'Reptile Sand',
  'Topsoil Mix',
  'Sphagnum Moss',
  'Other',
];

const CHANGE_REASONS = [
  'Routine Maintenance',
  'Mold Growth',
  'Excessive Moisture',
  'Rehousing',
  'Cleaning',
  'Other',
];

export default function AddSubstrateChangeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [substrateType, setSubstrateType] = useState('');
  const [substrateDepth, setSubstrateDepth] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [tarantulaName, setTarantulaName] = useState('');
  const [notificationPreferences, setNotificationPreferences] = useState<any>(null);

  useEffect(() => {
    loadTarantulaDetails();
    loadNotificationPreferences();
  }, [id]);

  const loadTarantulaDetails = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}`);
      setTarantulaName(response.data.name || response.data.common_name || 'Tarantula');

      // Pre-fill with current substrate type if available
      if (response.data.substrate_type) {
        setSubstrateType(response.data.substrate_type);
      }
      if (response.data.substrate_depth) {
        setSubstrateDepth(response.data.substrate_depth);
      }
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
    if (!substrateType) {
      Alert.alert('Required Field', 'Please select a substrate type');
      return;
    }

    setSaving(true);
    try {
      await apiClient.post(`/tarantulas/${id}/substrate-changes`, {
        changed_at: date.toISOString().split('T')[0],
        substrate_type: substrateType,
        substrate_depth: substrateDepth || undefined,
        reason: reason || undefined,
        notes: notes.trim() || undefined,
      });

      // Schedule substrate change reminder if enabled
      if (notificationPreferences?.substrate_reminders_enabled && tarantulaName) {
        const days = notificationPreferences.substrate_reminder_days || 90;
        await scheduleSubstrateReminder(
          id as string,
          tarantulaName,
          days
        );
      }

      Alert.alert('Success', 'Substrate change logged successfully');
      router.back();
    } catch (error: any) {
      console.error('Failed to save substrate change:', error);
      Alert.alert('Error', 'Failed to log substrate change');
    } finally {
      setSaving(false);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Log Substrate Change</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.saveButtonDisabled]}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Date */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Date Changed</Text>
          <TouchableOpacity
            style={[styles.input, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar" size={20} color={colors.primary} />
            <Text style={[styles.inputText, { color: colors.textPrimary }]}>{date.toLocaleDateString()}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              onChange={onDateChange}
              maximumDate={new Date()}
            />
          )}
        </View>

        {/* Substrate Type */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Substrate Type *</Text>
          <View style={styles.chipContainer}>
            {SUBSTRATE_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.chip,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  substrateType === type && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setSubstrateType(type)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: colors.textSecondary },
                    substrateType === type && { color: '#fff' },
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Substrate Depth */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Substrate Depth</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.textPrimary }]}
            value={substrateDepth}
            onChangeText={setSubstrateDepth}
            placeholder="e.g., 3 inches"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        {/* Reason */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Reason for Change</Text>
          <View style={styles.chipContainer}>
            {CHANGE_REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.chip,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  reason === r && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setReason(reason === r ? '' : r)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: colors.textSecondary },
                    reason === r && { color: '#fff' },
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
  textInput: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
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
  textArea: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
    minHeight: 100,
  },
});
