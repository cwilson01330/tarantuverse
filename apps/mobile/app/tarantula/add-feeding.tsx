import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateInput from '../../src/components/DateInput';
import { apiClient } from '../../src/services/api';
import { scheduleFeedingReminder } from '../../src/services/notifications';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';

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
  const { id } = useLocalSearchParams();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [date, setDate] = useState(new Date());
  const [foodType, setFoodType] = useState('');
  const [foodSize, setFoodSize] = useState('');
  const [accepted, setAccepted] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [tarantulaName, setTarantulaName] = useState('');
  const [notificationPreferences, setNotificationPreferences] = useState<any>(null);

  useEffect(() => {
    // Load tarantula details and notification preferences
    loadTarantulaDetails();
    loadNotificationPreferences();
  }, [id]);

  const loadTarantulaDetails = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}`);
      setTarantulaName(response.data.name || response.data.common_name || 'Tarantula');
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
      await apiClient.post(`/tarantulas/${id}/feedings`, {
        fed_at: date.toISOString(),
        food_type: foodType,
        food_size: foodSize || undefined,
        accepted,
        notes: notes.trim() || undefined,
      });

      // Schedule feeding reminder if enabled
      if (notificationPreferences?.feeding_reminders_enabled && accepted && tarantulaName) {
        const hours = notificationPreferences.feeding_reminder_hours || 24;
        await scheduleFeedingReminder(
          id as string,
          tarantulaName,
          hours
        );
      }

      Alert.alert('Success', 'Feeding log added successfully');
      router.back();
    } catch (error: any) {
      console.error('Failed to save feeding log:', error);
      Alert.alert('Error', 'Failed to save feeding log');
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
      <AppHeader title="Log Feeding" leftAction={closeAction} rightAction={saveAction} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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

        <View style={{ height: 40 }} />
      </ScrollView>
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
});
