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
import { scheduleFeedingReminder } from '../../src/services/notifications';
import { useTheme } from '../../src/contexts/ThemeContext';

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
  const { colors } = useTheme();
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Log Feeding</Text>
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
        <View style={styles.section}>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar" size={20} color="#7c3aed" />
            <Text style={styles.inputText}>{date.toLocaleDateString()}</Text>
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

        {/* Food Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Food Type *</Text>
          <View style={styles.chipContainer}>
            {FOOD_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.chip,
                  foodType === type && styles.chipSelected,
                ]}
                onPress={() => setFoodType(type)}
              >
                <Text
                  style={[
                    styles.chipText,
                    foodType === type && styles.chipTextSelected,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Food Size */}
        <View style={styles.section}>
          <Text style={styles.label}>Food Size</Text>
          <View style={styles.chipContainer}>
            {FOOD_SIZES.map((size) => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.chip,
                  foodSize === size && styles.chipSelected,
                ]}
                onPress={() => setFoodSize(foodSize === size ? '' : size)}
              >
                <Text
                  style={[
                    styles.chipText,
                    foodSize === size && styles.chipTextSelected,
                  ]}
                >
                  {size}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Accepted */}
        <View style={styles.section}>
          <Text style={styles.label}>Did they accept the food?</Text>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                accepted && styles.toggleButtonActive,
              ]}
              onPress={() => setAccepted(true)}
            >
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color={accepted ? '#fff' : '#10b981'}
              />
              <Text
                style={[
                  styles.toggleButtonText,
                  accepted && styles.toggleButtonTextActive,
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                !accepted && styles.toggleButtonActive,
              ]}
              onPress={() => setAccepted(false)}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={20}
                color={!accepted ? '#fff' : '#ef4444'}
              />
              <Text
                style={[
                  styles.toggleButtonText,
                  !accepted && styles.toggleButtonTextActive,
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.textArea}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any additional notes..."
            placeholderTextColor="#9ca3af"
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
    borderBottomColor: '#e5e7eb',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    gap: 8,
  },
  inputText: {
    fontSize: 16,
    color: '#1f2937',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
  },
  chipSelected: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  chipText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#fff',
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
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    gap: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  toggleButtonText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  textArea: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    fontSize: 15,
    color: '#1f2937',
    minHeight: 100,
  },
});
